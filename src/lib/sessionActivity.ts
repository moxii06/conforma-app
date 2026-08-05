import { prisma } from "@/lib/prisma";
import { buildActivityRow, type ActivityRow } from "@/lib/activityReport";

/**
 * Charge le relevé d'activité d'une session — un seul endroit, parce que
 * l'écran et le PDF doivent afficher exactement la même chose.
 *
 * Les attestations comptent les deux origines, comme la grille de clôture
 * de la fiche session : une formation sans e-learning délivre une
 * attestation de fin de formation, pas un certificat LMS.
 */
export const CERTIFICATE_ORIGINS = ["lms_certificate", "attendance_certificate"];

export type SessionActivity = {
  courseTitle: string;
  mode: string;
  startsAt: Date;
  endsAt: Date;
  rows: ActivityRow[];
};

export async function loadSessionActivity(
  organizationId: string,
  sessionId: string
): Promise<SessionActivity | null> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, organizationId },
    select: {
      courseId: true,
      mode: true,
      startsAt: true,
      endsAt: true,
      course: { select: { title: true } },
      dossiers: {
        select: {
          id: true,
          firstAccessedAt: true,
          contact: { select: { firstName: true, lastName: true } },
          documents: {
            where: { templateOrigin: { in: CERTIFICATE_ORIGINS } },
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) return null;

  const dossierIds = session.dossiers.map((d) => d.id);
  const [modules, progress, attempts] = await Promise.all([
    prisma.elearningModule.findMany({
      where: { courseId: session.courseId },
      select: { id: true, type: true, quiz: { select: { id: true } } },
      orderBy: { order: "asc" },
    }),
    dossierIds.length
      ? prisma.elearningProgress.findMany({
          where: { dossierId: { in: dossierIds } },
          select: { dossierId: true, moduleId: true, percentComplete: true, lastEventAt: true },
        })
      : Promise.resolve([]),
    dossierIds.length
      ? prisma.quizAttempt.findMany({
          where: { dossierId: { in: dossierIds } },
          select: { dossierId: true, quizId: true, passed: true, scorePercent: true, submittedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Regroupé en mémoire plutôt qu'une requête par apprenant : une session
  // peut compter plusieurs centaines d'inscrits, et le relevé se consulte
  // d'un bloc.
  const progressByDossier = new Map<string, typeof progress>();
  for (const p of progress) {
    const l = progressByDossier.get(p.dossierId) ?? [];
    l.push(p);
    progressByDossier.set(p.dossierId, l);
  }
  const attemptsByDossier = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const l = attemptsByDossier.get(a.dossierId) ?? [];
    l.push(a);
    attemptsByDossier.set(a.dossierId, l);
  }

  return {
    courseTitle: session.course.title,
    mode: session.mode,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    rows: session.dossiers.map((d) =>
      buildActivityRow({
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        modules,
        progress: progressByDossier.get(d.id) ?? [],
        quizAttempts: attemptsByDossier.get(d.id) ?? [],
        firstAccessedAt: d.firstAccessedAt,
        certificateIssuedAt: d.documents[0]?.createdAt ?? null,
      })
    ),
  };
}

/** « En continu » ou la période réelle — ce que le PDF met en sous-titre. */
export function activityPeriodLabel(activity: SessionActivity): string {
  if (activity.mode === "ROLLING") {
    return "Formation en continu — chaque apprenant suit son propre calendrier";
  }
  const d = (x: Date) => x.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  return `Session du ${d(activity.startsAt)} au ${d(activity.endsAt)}`;
}
