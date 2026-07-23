import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parse, isValid } from "date-fns";
import { fr } from "date-fns/locale";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { CreateSessionForm } from "@/components/CreateSessionForm";
import { PlanningCalendar } from "@/components/PlanningCalendar";
import { Role } from "@prisma/client";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

const TABS = [
  { key: "liste", label: "Liste" },
  { key: "calendrier", label: "Calendrier" },
];

export default async function PlanningPage({ searchParams }: { searchParams: { tab?: string; month?: string } }) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "planning") === "none") redirect("/dashboard");
  const canCreate = can(role, "planning") === "full";
  const activeTab = searchParams.tab ?? "liste";
  // Spec §2: "Trainer: their own sessions" — every other role with
  // planning access sees the whole org's schedule.
  const ownerFilter = role === Role.TRAINER ? { trainerId: userId } : {};

  const [courses, trainers] = await Promise.all([
    canCreate ? prisma.course.findMany({ where: { organizationId }, orderBy: { title: "asc" } }) : Promise.resolve([]),
    canCreate
      ? prisma.user.findMany({ where: { organizationId, role: Role.TRAINER }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Planning des sessions" subtitle="Formateurs, salles et visioconférence" />
      <Tabs basePath="/planning" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        {canCreate && <CreateSessionForm courses={courses} trainers={trainers} />}
        {activeTab === "calendrier" ? (
          <CalendarTab organizationId={organizationId} monthParam={searchParams.month} ownerFilter={ownerFilter} />
        ) : (
          <ListTab organizationId={organizationId} ownerFilter={ownerFilter} />
        )}
      </div>
    </>
  );
}

async function ListTab({ organizationId, ownerFilter }: { organizationId: string; ownerFilter: { trainerId?: string } }) {
  // ROLLING (bande passante) sessions have no cohort date — Planning's
  // list/calendar are for dated sessions to staff/schedule; a rolling
  // course's roster lives on /formations instead, where it doesn't need a
  // date to make sense.
  const sessions = await prisma.session.findMany({
    where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: new Date() }, ...ownerFilter },
    include: { course: true, trainer: true, dossiers: true },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/planning/${s.id}`}
          className="bg-white border border-line rounded-card px-4.5 py-3.5 flex items-center gap-4 hover:border-ink-soft"
        >
          <div className="w-24 shrink-0">
            <div className="text-[12.5px] font-semibold text-ink">
              {format(s.startsAt, "EEE d MMM", { locale: fr })}
            </div>
            <div className="text-[11.5px] text-slate">
              {format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold text-ink">{s.course.title}</div>
            <div className="text-[11.5px] text-slate mt-0.5">
              {s.location} · {FORMAT_LABELS[s.format]}
            </div>
          </div>
          <div className="text-[12.5px] text-ink">{s.trainer ? s.trainer.name : "À assigner"}</div>
          <div className="text-[12.5px] text-slate w-20">
            {s.dossiers.length}/{s.capacity}
          </div>
          <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
        </Link>
      ))}
      {sessions.length === 0 && <div className="text-[12.5px] text-slate">Aucune session à venir.</div>}
    </div>
  );
}

async function CalendarTab({
  organizationId,
  monthParam,
  ownerFilter,
}: {
  organizationId: string;
  monthParam?: string;
  ownerFilter: { trainerId?: string };
}) {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const month = isValid(parsedMonth) ? parsedMonth : new Date();

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const sessions = await prisma.session.findMany({
    where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: gridStart, lte: gridEnd }, ...ownerFilter },
    include: { course: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <PlanningCalendar
      month={month}
      sessions={sessions.map((s) => ({ id: s.id, startsAt: s.startsAt, courseTitle: s.course.title }))}
    />
  );
}
