import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SURVEY_KIND_LABELS, type SurveyKind } from "@/lib/satisfactionSurveys";

export default async function SatisfactionResultsPage({ params }: { params: { id: string; kind: string } }) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) notFound();

  const survey = await prisma.satisfactionSurvey.findUnique({
    where: { courseId_kind: { courseId: dossier.session.courseId, kind: params.kind } },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  const response = survey
    ? await prisma.satisfactionSurveyResponse.findUnique({ where: { surveyId_dossierId: { surveyId: survey.id, dossierId: dossier.id } } })
    : null;
  if (!survey || !response || response.status !== "completed") notFound();

  const answers = (response.answers as Record<string, string | string[]>) ?? {};
  const kindLabel = SURVEY_KIND_LABELS[params.kind as SurveyKind] ?? "Évaluation";

  return (
    <>
      <PageHeader
        title={`${kindLabel} — ${dossier.contact.firstName} ${dossier.contact.lastName}`}
        subtitle={`${dossier.session.course.title} — complété le ${format(response.completedAt!, "d MMM yyyy", { locale: fr })}`}
      />
      <div className="p-8 flex flex-col gap-5 max-w-xl">
        <Link href={`/dossiers/${dossier.id}`} className="text-[12px] text-slate hover:text-ink w-fit">
          ← Retour au dossier
        </Link>
        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-4">
          {survey.questions.map((q) => {
            const answer = answers[q.id];
            const options = q.options as { id: string; text: string }[] | null;
            let display: string;
            if (answer === undefined || answer === null || answer === "") {
              display = "—";
            } else if (Array.isArray(answer)) {
              display = answer.map((id) => options?.find((o) => o.id === id)?.text ?? id).join(", ") || "—";
            } else if (options) {
              display = options.find((o) => o.id === answer)?.text ?? answer;
            } else {
              display = answer;
            }
            return (
              <div key={q.id}>
                <div className="text-[12.5px] text-slate mb-0.5">{q.prompt}</div>
                <div className="text-[13.5px] text-ink whitespace-pre-wrap">{display}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
