import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AttendanceSheet } from "@/components/AttendanceSheet";
import { SessionDaysForm } from "@/components/SessionDaysForm";

// The in-room attendance screen. Separate from the session record on purpose:
// this is opened on a tablet, in front of the group, and everything that
// isn't the grid is noise at that moment.
export default async function EmargementPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSessionContext();
  if (can(auth.role, "planning") === "none") redirect("/dashboard");

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: {
      course: { select: { title: true, durationHours: true } },
      days: { orderBy: { order: "asc" }, include: { attendance: true } },
      dossiers: { include: { contact: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!session) notFound();
  // Une formation en continu n'a pas de demi-journées à faire signer :
  // sa réalisation se justifie par le relevé d'activité. La fiche session
  // n'y mène plus, mais un signet ou un lien ancien peut encore arriver
  // ici — on le renvoie vers le bon écran plutôt que de lui présenter une
  // feuille vide qu'il croirait devoir remplir.
  if (session.mode === "ROLLING") redirect(`/planning/${params.id}/releve`);

  const canEdit = can(auth.role, "planning") !== "none";
  const learners = session.dossiers
    .map((d) => ({ dossierId: d.id, name: `${d.contact.firstName} ${d.contact.lastName}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const entries = session.days.flatMap((day) =>
    day.attendance.map((a) => ({
      sessionDayId: day.id,
      dossierId: a.dossierId,
      halfDay: a.halfDay as "MORNING" | "AFTERNOON",
      signedAt: a.signedAt.toISOString(),
      hasSignature: a.signatureDataUrl != null,
      byStaff: a.recordedByUserId != null,
    })),
  );

  const totalHours = session.days.reduce((s, d) => s + (d.morningHours ?? 0) + (d.afternoonHours ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Émargement"
        subtitle={`${session.course.title} — ${format(session.startsAt, "d MMMM yyyy", { locale: fr })}`}
      />
      <div className="p-4 sm:p-8 flex flex-col gap-5 max-w-5xl">
        <Link href={`/planning/${session.id}`} className="text-[12px] text-slate hover:text-ink w-fit">
          ← Retour à la session
        </Link>

        <AttendanceSheet
          sessionId={session.id}
          days={session.days.map((d) => ({
            id: d.id,
            date: d.date.toISOString(),
            morningHours: d.morningHours,
            afternoonHours: d.afternoonHours,
          }))}
          learners={learners}
          initialEntries={entries}
          canEdit={canEdit}
        />

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13.5px] font-semibold text-ink">Journées de la session</div>
            {totalHours > 0 && (
              <Pill tone="neutral">
                {totalHours.toFixed(1)} h au total
                {session.course.durationHours != null && session.course.durationHours !== totalHours
                  ? ` — ${session.course.durationHours} h annoncées au catalogue`
                  : ""}
              </Pill>
            )}
          </div>
          <p className="text-[11.5px] text-slate">
            Ces heures sont celles réellement dispensées, hors pause déjeuner — ce sont elles qui alimentent votre
            bilan pédagogique et financier. Laissez une demi-journée vide si elle n&apos;est pas tenue.
          </p>
          <SessionDaysForm
            sessionId={session.id}
            initialDays={session.days.map((d) => ({
              date: d.date.toISOString().slice(0, 10),
              morningHours: d.morningHours,
              afternoonHours: d.afternoonHours,
              locked: d.attendance.length > 0,
            }))}
            defaultDate={session.startsAt.toISOString().slice(0, 10)}
            canEdit={canEdit}
          />
        </div>
      </div>
    </>
  );
}
