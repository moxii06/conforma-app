import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { LmsProgressUpdater } from "@/components/LmsProgressUpdater";

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

export default async function MonEspacePage() {
  const session = await requireSessionContext();
  if (can(session.role, "portal") === "none") redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Mon espace"
        subtitle={session.role === "LEARNER" ? "Vos dossiers et votre progression" : "Vos sessions à animer"}
      />
      <div className="p-8 max-w-3xl">
        {session.role === "LEARNER" ? (
          <LearnerPortal userId={session.userId} organizationId={session.organizationId} />
        ) : (
          <TrainerPortal userId={session.userId} organizationId={session.organizationId} />
        )}
      </div>
    </>
  );
}

async function LearnerPortal({ userId, organizationId }: { userId: string; organizationId: string }) {
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId, learnerUserId: userId },
    include: {
      session: { include: { course: true } },
      documents: true,
      elearningProgress: { include: { module: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (dossiers.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucun dossier ne vous est encore associé.</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {dossiers.map((d) => {
        const steps = [
          { label: "Recueil des besoins", done: d.needsAssessmentDone },
          { label: "Convention signée", done: d.contractSigned },
          { label: "Convocation reçue", done: d.convocationSent },
          { label: "Évaluation à chaud", done: d.evaluationHotDone },
          { label: "Évaluation à froid", done: d.evaluationColdDone },
        ];
        return (
          <div key={d.id} className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-0.5">{d.session.course.title}</div>
            <div className="text-[12px] text-slate mb-3.5">
              {format(d.session.startsAt, "EEEE d MMMM yyyy", { locale: fr })} · {FORMAT_LABELS[d.session.format]}
            </div>

            <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">Parcours</div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                {s.done ? <CheckCircle2 size={14} className="text-sage" /> : <Circle size={14} className="text-[#C9C4B5]" />}
                <span className="text-[12.5px] text-ink">{s.label}</span>
              </div>
            ))}

            {d.documents.length > 0 && (
              <>
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mt-3.5 mb-1.5">Documents</div>
                {d.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.bodyText ? `/api/documents/generated/${doc.id}` : doc.fileUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[12.5px] text-ink underline decoration-line hover:decoration-ink py-1"
                  >
                    {doc.title}
                  </a>
                ))}
              </>
            )}

            {d.elearningProgress.length > 0 && (
              <>
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mt-3.5 mb-1.5">E-learning</div>
                {d.elearningProgress.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-[12.5px] text-ink">{p.module.title}</span>
                    <LmsProgressUpdater dossierId={d.id} moduleId={p.moduleId} percentComplete={p.percentComplete} />
                  </div>
                ))}
              </>
            )}
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
