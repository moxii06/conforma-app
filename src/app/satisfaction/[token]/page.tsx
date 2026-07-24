import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { SatisfactionSurveyForm } from "@/components/SatisfactionSurveyForm";
import { SURVEY_KIND_LABELS, type SurveyKind } from "@/lib/satisfactionSurveys";
import { ShieldCheck } from "lucide-react";

export default async function SatisfactionSurveyPublicPage({ params }: { params: { token: string } }) {
  const response = await prisma.satisfactionSurveyResponse.findUnique({
    where: { token: params.token },
    include: {
      survey: { include: { questions: { orderBy: { order: "asc" } }, course: true, organization: true } },
      dossier: { include: { contact: true } },
    },
  });
  if (!response) notFound();

  const { organization } = response.survey;
  const kindLabel = SURVEY_KIND_LABELS[response.survey.kind as SurveyKind] ?? "Évaluation";

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
            <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-lg text-ink">{organization.name}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-1">{kindLabel}</div>
          <div className="text-[12.5px] text-slate">
            {response.survey.course.title} — {response.dossier.contact.firstName} {response.dossier.contact.lastName}
          </div>
        </div>

        {response.status === "completed" ? (
          <div className="bg-white border border-line rounded-card p-6 text-center">
            <div className="text-[14px] text-ink font-medium mb-1.5">Ce questionnaire a déjà été complété.</div>
            <div className="text-[12.5px] text-slate">Merci, votre réponse a bien été transmise.</div>
          </div>
        ) : (
          <SatisfactionSurveyForm
            token={response.token}
            questions={response.survey.questions.map((q) => ({
              id: q.id,
              type: q.type,
              prompt: q.prompt,
              options: q.options as { id: string; text: string }[] | null,
            }))}
          />
        )}
      </div>
    </div>
  );
}
