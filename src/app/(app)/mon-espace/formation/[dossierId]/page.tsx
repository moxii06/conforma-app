import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Video } from "lucide-react";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { LmsModulePlayer } from "@/components/LmsModulePlayer";
import { QuizTaker } from "@/components/QuizTaker";
import { CourseModulesList, type ModuleRow } from "@/components/CourseModulesList";
import { CourseCertificateButton } from "@/components/CourseCertificateButton";
import { buildCourseProgress, resolveRegleParcours, unlockNextModuleIfNeeded } from "@/lib/lms";
import { loadWithdrawalGate, moduleAccessibleUnderGate } from "@/lib/withdrawalGate";
import { WithdrawalGatePanel } from "@/components/WithdrawalGatePanel";

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

/** Un atelier tient sur une journée dans l'immense majorité des cas ; on ne
 *  répète la date de fin que lorsqu'elle diffère vraiment. */
function libelleCreneau(debut: Date, fin: Date) {
  if (debut.toDateString() === fin.toDateString()) {
    return `${formatDate(debut, "EEEE d MMMM yyyy", { locale: fr })} · ${formatDate(debut, "HH:mm")}–${formatDate(fin, "HH:mm")}`;
  }
  return `${formatDate(debut, "d MMM yyyy HH:mm", { locale: fr })} → ${formatDate(fin, "d MMM yyyy HH:mm", { locale: fr })}`;
}

function formatCourseDuration(session: { mode: string; startsAt: Date; endsAt: Date }, accessDurationDays: number | null) {
  if (session.mode === "ROLLING") {
    return accessDurationDays
      ? `Formation en continu · ${accessDurationDays} j pour la terminer`
      : "Formation en continu · pas de délai imposé";
  }
  const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// The learner's dedicated page for one specific training — reached from
// the "Commencer"/"Continuer ma formation" button on their course
// catalog (/formations for a LEARNER). Deliberately scoped to exactly one
// dossier, never a list: a learner has no legitimate reason to browse
// straight to another learner's dossier by guessing an id, so this checks
// ownership itself rather than relying on the catalog page never linking
// there.
export default async function LearnerCourseDetailPage(props: { params: Promise<{ dossierId: string }> }) {
  const params = await props.params;
  const session = await requireSessionContext();
  if (session.role !== "LEARNER") redirect("/formations");

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
    include: {
      session: {
        include: {
          trainer: true,
          course: {
            include: {
              elearningModules: {
                include: {
                  quiz: { include: { questions: { orderBy: { order: "asc" } } } },
                  attachments: { orderBy: { createdAt: "asc" } },
                  chapter: { select: { id: true, title: true } },
                },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
    },
  });
  if (!dossier) notFound();

  // Les ateliers de la session auxquels CE dossier est inscrit. En lecture
  // seule : c'est l'organisme qui constitue le groupe, l'apprenant ne
  // s'inscrit pas lui-même. Les annulés restent affichés (barrés) — voir
  // disparaître un rendez-vous noté dans son agenda est pire que le voir
  // annulé.
  //
  // Le cloisonnement passe par la session parente : SessionAtelier ne porte
  // pas d'organizationId.
  const ateliers = await prisma.sessionAtelier.findMany({
    where: {
      session: { id: dossier.sessionId, organizationId: session.organizationId },
      participants: { some: { dossierId: dossier.id } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      titre: true,
      description: true,
      startsAt: true,
      endsAt: true,
      format: true,
      location: true,
      meetingLink: true,
      annuleeAt: true,
    },
  });
  const maintenant = new Date();

  // While the learner's withdrawal period runs (signed contrat_formation,
  // no express waiver yet), the module list below is filtered to what the
  // organisation chose to open early — possibly nothing. The real
  // enforcement is server-side in the stream route; this only decides what
  // the page renders.
  const gate = await loadWithdrawalGate(dossier.id);
  const allModules = dossier.session.course.elearningModules;
  const modules = gate.active ? allModules.filter((m) => moduleAccessibleUnderGate(gate, m)) : allModules;

  // Self-heal on load: if staff reordered modules (or dragged a new one
  // above the learner's position) after this learner started, the moved
  // module has no progress row and no completion event left to ever create
  // one — unlock the current frontier now so the parcours stays finishable.
  // See unlockNextModuleIfNeeded's comment; no-op in the normal case.
  let progressRows = dossier.elearningProgress;
  if (await unlockNextModuleIfNeeded({ dossierId: dossier.id, courseId: dossier.session.course.id })) {
    progressRows = await prisma.elearningProgress.findMany({ where: { dossierId: dossier.id } });
  }

  const progress = buildCourseProgress(modules, progressRows, dossier.quizAttempts);
  const progressByModule = new Map(progressRows.map((p) => [p.moduleId, p]));

  // Le « Passer cette vidéo » se règle désormais aussi au niveau de la
  // session (null = hérite de la formation) — voir resolveRegleParcours.
  const autoriserSautVideo = resolveRegleParcours(
    dossier.session.allowVideoSkip,
    dossier.session.course.allowVideoSkip,
  );

  const rows: ModuleRow[] = modules.map((m, i) => {
    const state = progress.states.get(m.id)!;
    let node: React.ReactNode = null;

    if (state !== "locked") {
      if (m.type === "quiz" && m.quiz) {
        const quiz = m.quiz;
        const attempts = dossier.quizAttempts.filter((a) => a.quizId === quiz.id);
        const best = attempts.reduce<{ scorePercent: number; passed: boolean } | null>((acc, a) => {
          if (!acc || a.scorePercent > acc.scorePercent) return { scorePercent: a.scorePercent, passed: a.passed };
          return acc;
        }, null);
        // Never send `correct` flags or correctAnswerText to the learner's
        // browser — grading happens server-side only.
        const safeQuestions = quiz.questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          options: Array.isArray(q.options)
            ? (q.options as { id: string; text: string }[]).map((o) => ({ id: o.id, text: o.text }))
            : null,
        }));
        node = (
          <QuizTaker
            quizId={quiz.id}
            dossierId={dossier.id}
            questions={safeQuestions}
            minScorePercent={quiz.minScorePercent}
            maxAttempts={quiz.maxAttempts}
            attemptsUsed={attempts.length}
            bestResult={best}
          />
        );
      } else {
        const p = progressByModule.get(m.id);
        node = (
          <LmsModulePlayer
            dossierId={dossier.id}
            moduleId={m.id}
            type={m.type}
            hasFile={Boolean(m.fileUrl)}
            percentComplete={p?.percentComplete ?? 0}
            lastPositionSeconds={p?.lastPositionSeconds ?? null}
            allowSkip={autoriserSautVideo}
            skippedAt={p?.skippedAt ? p.skippedAt.toISOString() : null}
          />
        );
      }
    }

    return {
      id: m.id,
      title: m.title,
      description: m.description,
      type: m.type as ModuleRow["type"],
      state,
      lockedAfterTitle: state === "locked" && i > 0 ? modules[i - 1].title : null,
      attachments: m.attachments.map((a) => ({ id: a.id, title: a.title, fileUrl: a.fileUrl })),
      node,
      chapterId: m.chapter?.id ?? null,
      chapterTitle: m.chapter?.title ?? null,
      skippedAt: Boolean(progressByModule.get(m.id)?.skippedAt),
    };
  });

  return (
    <>
      <PageHeader title={dossier.session.course.title} subtitle="Votre formation" />
      <div className="p-8 max-w-2xl flex flex-col gap-5">
        <Link href="/formations" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate hover:text-ink w-fit">
          <ArrowLeft size={14} /> Retour à mes formations
        </Link>

        {gate.active && gate.endsAt && gate.waiverText && (
          <WithdrawalGatePanel
            dossierId={dossier.id}
            endsAtLabel={gate.endsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            waiverText={gate.waiverText}
            partial={gate.policy === "partial" && modules.length > 0}
          />
        )}

        {/* Placé AVANT le contenu de la formation : un rendez-vous daté est
            la seule chose de cette page qui se rate. Les modules, eux,
            attendent. */}
        {ateliers.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink">Vos rendez-vous</div>
            <div className="text-[11.5px] text-slate mt-0.5 mb-3">
              Les ateliers auxquels votre organisme vous a inscrit(e) pour cette formation.
            </div>
            <div className="flex flex-col gap-2">
              {ateliers.map((atelier) => {
                const annule = Boolean(atelier.annuleeAt);
                const passe = atelier.endsAt < maintenant;
                return (
                  <div key={atelier.id} className="border border-line rounded-md px-3.5 py-2.5 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className={`text-[13px] font-medium ${annule ? "text-slate line-through" : "text-ink"}`}>
                        {atelier.titre}
                      </div>
                      <Pill tone={annule ? "danger" : passe ? "neutral" : "good"}>
                        {annule ? "Annulé" : passe ? "Passé" : "À venir"}
                      </Pill>
                    </div>
                    <div className="text-[11.5px] text-slate">{libelleCreneau(atelier.startsAt, atelier.endsAt)}</div>
                    {atelier.description && (
                      <div className="text-[12px] text-slate leading-relaxed">{atelier.description}</div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-slate">
                      <span>{FORMAT_LABELS[atelier.format] ?? atelier.format}</span>
                      {atelier.location && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate">{atelier.location}</span>
                        </span>
                      )}
                      {/* Le lien reste masqué sur un atelier annulé : le
                          proposer, c'est envoyer quelqu'un dans une salle
                          vide. */}
                      {atelier.meetingLink && !annule && (
                        <a
                          href={atelier.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline decoration-line hover:text-ink"
                        >
                          <Video size={12} /> Rejoindre en visio
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center gap-3 text-[12.5px] text-slate mb-1">
            <span>Formateur : {dossier.session.trainer?.name ?? "à confirmer"}</span>
            <span>·</span>
            <span>{formatCourseDuration(dossier.session, dossier.accessDurationDays)}</span>
            {dossier.session.mode === "FIXED_DATE" && (
              <>
                <span>·</span>
                <span>{FORMAT_LABELS[dossier.session.format]}</span>
              </>
            )}
          </div>

          {modules.length === 0 ? (
            <div className="text-[12.5px] text-slate mt-3">
              {gate.active && allModules.length > 0
                ? "Les modules de formation ouvriront à la fin de votre délai de rétractation — ou dès maintenant si vous en faites la demande ci-dessus."
                : "Aucun contenu en ligne n'est encore associé à cette formation."}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mt-4 mb-1.5">
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Progression</div>
                <div className="text-[11px] text-slate">{progress.completedCount}/{progress.total} modules terminés</div>
              </div>
              <div className="h-1.5 bg-pebble rounded-full overflow-hidden mb-4">
                <div className="h-full bg-sage" style={{ width: `${progress.totalPercent}%` }} />
              </div>
              <div className="bg-linen border border-line rounded-md">
                <CourseModulesList rows={rows} defaultExpandedId={progress.currentModuleId} />
              </div>
              {progress.allCompleted && (
                <div className="mt-3.5">
                  <CourseCertificateButton dossierId={dossier.id} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
