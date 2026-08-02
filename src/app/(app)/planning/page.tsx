import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parse, isValid } from "date-fns";
import { fr } from "date-fns/locale";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { CreateSessionForm } from "@/components/CreateSessionForm";
import { TrainerFilter } from "@/components/TrainerFilter";
import { PlanningCalendar } from "@/components/PlanningCalendar";
import { ArchiveSessionButton } from "@/components/ArchiveSessionButton";
import { Role } from "@prisma/client";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

const TABS = [
  { key: "liste", label: "Liste" },
  { key: "calendrier", label: "Calendrier" },
  { key: "archives", label: "Archives" },
];

export default async function PlanningPage(props: { searchParams: Promise<{ tab?: string; month?: string; trainer?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "planning") === "none") redirect("/dashboard");
  const canCreate = can(role, "planning") === "full";
  const activeTab = searchParams.tab ?? "liste";
  // Spec §2: "Trainer: their own sessions" — every other role with
  // planning access sees the whole org's schedule, optionally narrowed
  // to one trainer via the filter below (moot for TRAINER, who is
  // already locked to themselves).
  const canFilterByTrainer = role !== Role.TRAINER;
  const ownerFilter =
    role === Role.TRAINER ? { trainerId: userId } : searchParams.trainer ? { trainerId: searchParams.trainer } : {};

  const [courses, trainers] = await Promise.all([
    canCreate ? prisma.course.findMany({ where: { organizationId }, orderBy: { title: "asc" } }) : Promise.resolve([]),
    canFilterByTrainer
      ? prisma.user.findMany({ where: { organizationId, role: Role.TRAINER }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Planning des sessions" subtitle="Formateurs, salles et visioconférence" />
      <Tabs basePath="/planning" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        {canFilterByTrainer && trainers.length > 0 && (
          <div className="flex items-center gap-2.5">
            <TrainerFilter trainers={trainers} />
            {searchParams.trainer && (
              <a
                href={`/api/planning/export?trainer=${searchParams.trainer}`}
                className="text-[12.5px] text-slate hover:text-ink underline underline-offset-2"
              >
                Exporter ce planning (PDF)
              </a>
            )}
          </div>
        )}
        {canCreate && <CreateSessionForm courses={courses} trainers={trainers} />}
        {activeTab === "calendrier" ? (
          <CalendarTab organizationId={organizationId} monthParam={searchParams.month} ownerFilter={ownerFilter} />
        ) : activeTab === "archives" ? (
          <ArchivesTab organizationId={organizationId} ownerFilter={ownerFilter} canEdit={canCreate} />
        ) : (
          <ListTab organizationId={organizationId} ownerFilter={ownerFilter} />
        )}
      </div>
    </>
  );
}

async function ListTab({ organizationId, ownerFilter }: { organizationId: string; ownerFilter: { trainerId?: string } }) {
  // Une session en bande passante n'a pas de date de cohorte : elle n'a
  // donc rien à faire dans le calendrier, et le raisonnement d'origine
  // l'excluait de tout le Planning.
  //
  // Sauf que l'écran PROPOSE de la créer. On cliquait, ça réussissait, et
  // ça disparaissait — sans message, sans trace. Un formulaire qui crée ce
  // que sa propre page est incapable de montrer n'est pas défendable :
  // elles ont désormais leur section, sous les sessions datées.
  const [sessions, rolling] = await Promise.all([
    prisma.session.findMany({
      where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: new Date() }, archivedAt: null, ...ownerFilter },
      include: { course: true, trainer: true, dossiers: true },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
    prisma.session.findMany({
      where: { organizationId, mode: "ROLLING", archivedAt: null, ...ownerFilter },
      include: { course: true, trainer: true, dossiers: true },
      // Session n'a pas de createdAt. En bande passante, startsAt porte la
      // date de création — c'est ce que pose la route faute de cohorte.
      orderBy: { startsAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((s) => {
        const isFull = s.dossiers.length >= s.capacity;
        const isCancelled = s.status === "CANCELLED";
        return (
          <Link
            key={s.id}
            href={`/planning/${s.id}`}
            className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6 hover:border-ink-soft"
          >
            <div className="w-24 shrink-0">
              <div className="text-[12.5px] font-semibold text-ink">
                {format(s.startsAt, "EEE d MMM", { locale: fr })}
              </div>
              <div className="text-[11.5px] text-slate">
                {format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
              <div className="text-[11.5px] text-slate mt-0.5 truncate">
                {s.location} · {FORMAT_LABELS[s.format]}
              </div>
            </div>
            <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">{s.trainer ? s.trainer.name : "À assigner"}</div>
            <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
              {s.dossiers.length}/{s.capacity}
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              {isFull && !isCancelled && <Pill tone="neutral">Complet</Pill>}
              {isCancelled ? (
                <Pill tone="danger">Annulée</Pill>
              ) : (
                <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
              )}
            </div>
          </Link>
        );
      })}
      {sessions.length === 0 && <div className="text-[12.5px] text-slate">Aucune session à venir.</div>}

      {rolling.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-slate uppercase tracking-wide mb-2">
            En continu (bande passante)
          </div>
          <div className="text-[11.5px] text-slate mb-2.5">
            Sans date de cohorte : chaque apprenant démarre quand il s&apos;inscrit, avec son propre délai d&apos;accès.
          </div>
          <div className="flex flex-col gap-2.5">
            {rolling.map((s) => (
              <Link
                key={s.id}
                href={`/planning/${s.id}`}
                className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6 hover:border-ink-soft"
              >
                <div className="w-24 shrink-0 text-[12px] text-slate">Toujours ouverte</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
                  <div className="text-[11.5px] text-slate mt-0.5 truncate">
                    {s.location ? `${s.location} · ` : ""}
                    {FORMAT_LABELS[s.format]}
                  </div>
                </div>
                <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">
                  {s.trainer ? s.trainer.name : "À assigner"}
                </div>
                {/* Pas de « x/capacité » ici : en bande passante il n'y a
                    pas de places à remplir, seulement des inscrits. */}
                <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
                  {s.dossiers.length} inscrit{s.dossiers.length > 1 ? "s" : ""}
                </div>
                <div className="shrink-0">
                  <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
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

// Client feedback: past sessions used to just vanish from "Liste" (its query
// only ever looked at startsAt >= now) with nowhere to browse them again.
// This surfaces both flavors of "inactive" — naturally past, and manually
// archived via ArchiveSessionButton (e.g. a cancelled future session) — in
// one place, newest-first so recently-finished sessions are at the top.
async function ArchivesTab({
  organizationId,
  ownerFilter,
  canEdit,
}: {
  organizationId: string;
  ownerFilter: { trainerId?: string };
  canEdit: boolean;
}) {
  const sessions = await prisma.session.findMany({
    where: {
      organizationId,
      mode: "FIXED_DATE",
      OR: [{ archivedAt: { not: null } }, { endsAt: { lt: new Date() } }],
      ...ownerFilter,
    },
    include: { course: true, trainer: true, dossiers: true },
    orderBy: { startsAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((s) => (
        <div key={s.id} className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6">
          <Link href={`/planning/${s.id}`} className="flex items-center gap-6 flex-1 min-w-0 hover:opacity-80">
            <div className="w-24 shrink-0">
              <div className="text-[12.5px] font-semibold text-ink">
                {format(s.startsAt, "EEE d MMM yyyy", { locale: fr })}
              </div>
              <div className="text-[11.5px] text-slate">
                {format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
              <div className="text-[11.5px] text-slate mt-0.5 truncate">
                {s.location} · {FORMAT_LABELS[s.format]}
              </div>
            </div>
            <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">{s.trainer ? s.trainer.name : "À assigner"}</div>
            <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
              {s.dossiers.length}/{s.capacity}
            </div>
            <div className="shrink-0">
              <Pill tone={s.status === "CANCELLED" ? "danger" : s.archivedAt ? "neutral" : "warn"}>
                {s.status === "CANCELLED" ? "Annulée" : s.archivedAt ? "Archivée" : "Terminée"}
              </Pill>
            </div>
          </Link>
          {canEdit && <ArchiveSessionButton sessionId={s.id} archived={Boolean(s.archivedAt)} />}
        </div>
      ))}
      {sessions.length === 0 && <div className="text-[12.5px] text-slate">Aucune session archivée.</div>}
    </div>
  );
}
