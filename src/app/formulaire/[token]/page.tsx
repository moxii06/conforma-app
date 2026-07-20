import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { NeedsAssessmentForm } from "@/components/NeedsAssessmentForm";
import { ShieldCheck } from "lucide-react";

export default async function NeedsAssessmentPublicPage({ params }: { params: { token: string } }) {
  const request = await prisma.needsAssessmentRequest.findUnique({
    where: { token: params.token },
    include: { organization: true, contact: true },
  });
  if (!request) notFound();

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
            <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-lg text-ink">{request.organization.name}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-2.5">Recueil des besoins</div>
          <pre className="whitespace-pre-wrap text-[12.5px] text-slate font-sans leading-relaxed">{request.templateBody}</pre>
        </div>

        {request.status === "completed" ? (
          <div className="bg-white border border-line rounded-card p-6 text-center">
            <div className="text-[14px] text-ink font-medium mb-1.5">Ce formulaire a déjà été complété.</div>
            <div className="text-[12.5px] text-slate">Merci, votre réponse a bien été transmise.</div>
          </div>
        ) : (
          <NeedsAssessmentForm token={request.token} />
        )}
      </div>
    </div>
  );
}
