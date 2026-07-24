import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { buildCourseProgress } from "@/lib/lms";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { Tabs } from "@/components/Tabs";
import { SignDocumentButton } from "@/components/SignDocumentButton";

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };
const LEARNER_TABS = [
  { key: "parcours", label: "Parcours" },
  { key: "documents", label: "Mes documents" },
];

export default async function MonEspacePage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "portal") === "none") redirect("/dashboard");
  const isLearner = session.role === "LEARNER";
  const activeTab = searchParams.tab === "documents" ? "documents" : "parcours";

  return (
    <>
      <PageHeader
        title="Mon espace"
        subtitle={isLearner ? "Vos dossiers et votre progression" : "Vos sessions à animer"}
      />
      {isLearner && <Tabs basePath="/mon-espace" tabs={LEARNER_TABS} active={activeTab} />}
      <div className="p-8 max-w-3xl">
        {isLearner ? (
          activeTab === "documents" ? (
            <LearnerDocumentsTab userId={session.userId} organizationId={session.organizationId} />
          ) : (
            <LearnerPortal userId={session.userId} organizationId={session.organizationId} />
          )
        ) : (
          <TrainerPortal userId={session.userId} organizationId={session.organizationId} />
        )}
      </div>
    </>
  );
}

// Every document across every one of the learner's dossiers (contracts,
// convocations, evaluations, and LMS certificates — CourseCertificateButton
// creates those as regular Document rows too) in one flat, dated list —
// client feedback: scattered inside each course card wasn't enough to
// actually find "my certificate" once someone has more than one dossier.
async function LearnerDocumentsTab({ userId, organizationId }: { userId: string; organizationId: string }) {
  const documents = await prisma.document.findMany({
    where: { organizationId, dossier: { learnerUserId: userId } },
    include: { dossier: { include: { session: { include: { course: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="bg-white border border-line rounded-card">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 hover:bg-[#EFEDE7]">
          <a
            href={doc.bodyText ? `/api/documents/generated/${doc.id}` : doc.fileUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex-1 min-w-0"
          >
            <div className="text-[13px] text-ink font-medium truncate">{doc.title}</div>
            {doc.dossier && <div className="text-[11.5px] text-slate truncate">{doc.dossier.session.course.title}</div>}
            <div className="text-[11px] text-slate mt-0.5">{format(doc.createdAt, "d MMM yyyy", { locale: fr })}</div>
          </a>
          <Pill tone="neutral">{CATEGORY_LABELS[doc.category] ?? doc.category}</Pill>
          {doc.signatureStatus === "pending" && <SignDocumentButton documentId={doc.id} title={doc.title} />}
          {doc.signatureStatus === "signed" && doc.signedAt && (
            <Pill tone="good">Signé le {format(doc.signedAt, "d MMM yyyy", { locale: fr })}</Pill>
          )}
        </div>
      ))}
      {documents.length === 0 && (
        <div className="px-4 py-6 text-[12.5px] text-slate text-center">Aucun document pour le moment.</div>
      )}
    </div>
  );
}

async function LearnerPortal({ userId, organizationId }: { userId: string; organizationId: string }) {
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId, learnerUserId: userId },
    include: {
      session: {
        include: {
          course: { include: { elearningModules: { include: { quiz: true }, orderBy: { order: "asc" } } } },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
      satisfactionSurveyResponses: { where: { status: "sent" }, include: { survey: { select: { kind: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (dossiers.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucun dossier ne vous est encore associé.</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {dossiers.map((d) => {
        const pendingSurveyByKind: Record<string, string> = {};
        for (const r of d.satisfactionSurveyResponses) pendingSurveyByKind[r.survey.kind] = r.token;
        const steps = [
          { label: "Recueil des besoins", done: d.needsAssessmentDone },
          { label: "Convention signée", done: d.contractSigned },
          { label: "Convocation reçue", done: d.convocationSent },
          { label: "Évaluation à chaud", done: d.evaluationHotDone, pendingToken: pendingSurveyByKind.hot },
          { label: "Évaluation à froid", done: d.evaluationColdDone, pendingToken: pendingSurveyByKind.cold },
        ];
        return (
          <div key={d.id} className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-0.5">{d.session.course.title}</div>
            <div className="text-[12px] text-slate mb-3.5">
              {format(d.session.startsAt, "EEEE d MMMM yyyy", { locale: fr })} · {FORMAT_LABELS[d.session.format]}
            </div>

            {(d.session.format === "REMOTE" || d.session.format === "HYBRID") && d.session.meetingLink && (
              <Link
                href={`/mon-espace/salle/${d.id}`}
                className="inline-block mb-3.5 text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
              >
                Rejoindre la classe virtuelle
              </Link>
            )}

            <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">Parcours</div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1.5">
                <div className="flex items-center gap-2">
                  {s.done ? <CheckCircle2 size={14} className="text-sage" /> : <Circle size={14} className="text-[#B9B6AA]" />}
                  <span className="text-[12.5px] text-ink">{s.label}</span>
                </div>
                {!s.done && s.pendingToken && (
                  <Link href={`/satisfaction/${s.pendingToken}`} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
                    Répondre
                  </Link>
                )}
              </div>
            ))}

            {d.session.course.elearningModules.length > 0 && (() => {
              const progress = buildCourseProgress(d.session.course.elearningModules, d.elearningProgress, d.quizAttempts);
              const ctaLabel =
                !d.firstAccessedAt ? "Commencer ma formation" : progress.allCompleted ? "Revoir ma formation" : "Continuer ma formation";
              return (
                <>
                  <div className="flex items-center justify-between mt-3.5 mb-1.5">
                    <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">E-learning</div>
                    <div className="text-[11px] text-slate">{progress.completedCount}/{progress.total} modules terminés</div>
                  </div>
                  <div className="h-1.5 bg-[#E6E3DA] rounded-full overflow-hidden mb-2.5">
                    <div className="h-full bg-sage" style={{ width: `${progress.totalPercent}%` }} />
                  </div>
                  <Link
                    href={`/mon-espace/formation/${d.id}`}
                    className="inline-block bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft"
                  >
                    {ctaLabel}
                  </Link>
                </>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

async function TrainerPortal({ userId, organizationId }: { userId: string; organizationId: string }) {
  const sessions = await prisma.session.findMany({
    where: { organizationId, trainerId: userId, startsAt: { gte: new Date() } },
    include: {
      course: true,
      dossiers: { include: { contact: true, invitations: { orderBy: { sentAt: "desc" }, take: 1 } } },
    },
    orderBy: { startsAt: "asc" },
  });

  if (sessions.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucune session à venir ne vous est assignée.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => (
        <Link key={s.id} href={`/planning/${s.id}`} className="bg-white border border-line rounded-card p-4 flex items-center gap-4 hover:border-ink-soft block">
          <div className="w-28 shrink-0">
            <div className="text-[12.5px] font-semibold text-ink">{format(s.startsAt, "EEE d MMM", { locale: fr })}</div>
            <div className="text-[11.5px] text-slate">{format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}</div>
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-ink">{s.course.title}</div>
            <div className="text-[11.5px] text-slate mt-0.5">{FORMAT_LABELS[s.format]} · {s.dossiers.length}/{s.capacity} inscrits</div>
          </div>
          <Pill tone={s.dossiers.every((d) => d.invitations.length > 0) && s.dossiers.length > 0 ? "good" : "warn"}>
            {s.dossiers.filter((d) => d.invitations.length > 0).length}/{s.dossiers.length} invités
          </Pill>
        </Link>
      ))}
    </div>
  );
}
