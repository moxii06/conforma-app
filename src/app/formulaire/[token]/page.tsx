import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { NeedsAssessmentForm } from "@/components/NeedsAssessmentForm";
import { BrandedLogo } from "@/components/BrandedLogo";
import { parseNeedsAssessmentBody } from "@/lib/needsAssessmentQuestions";

export default async function NeedsAssessmentPublicPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const request = await prisma.needsAssessmentRequest.findUnique({
    where: { token: params.token },
    include: { organization: true, contact: true },
  });
  if (!request) notFound();

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-xl mx-auto flex flex-col gap-5">
        <BrandedLogo name={request.organization.name} logoUrl={request.organization.logoUrl} brandColor={request.organization.brandColor} size={28} />

        {/* Seule l'introduction reste ici. Les questions numérotées sont
            désormais rendues par le formulaire, chacune au-dessus de son
            propre champ — les répéter ici obligerait à faire l'ascenseur
            entre l'énoncé et la saisie, ce qui était précisément le
            problème sur mobile. */}
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-2.5">Recueil des besoins</div>
          <pre className="whitespace-pre-wrap text-[12.5px] text-slate font-sans leading-relaxed">
            {parseNeedsAssessmentBody(request.templateBody).intro}
          </pre>
        </div>

        {request.status === "completed" ? (
          <div className="bg-white border border-line rounded-card p-6 text-center">
            <div className="text-[14px] text-ink font-medium mb-1.5">Ce formulaire a déjà été complété.</div>
            <div className="text-[12.5px] text-slate">Merci, votre réponse a bien été transmise.</div>
          </div>
        ) : (
          <NeedsAssessmentForm token={request.token} templateBody={request.templateBody} />
        )}
      </div>
    </div>
  );
}
