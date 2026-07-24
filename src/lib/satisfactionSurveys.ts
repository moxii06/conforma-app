import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import type { Dossier, Contact, Organization } from "@prisma/client";

export const SURVEY_KIND_VALUES = ["hot", "cold"] as const;
export type SurveyKind = (typeof SURVEY_KIND_VALUES)[number];

export const SURVEY_KIND_LABELS: Record<SurveyKind, string> = {
  hot: "Évaluation à chaud",
  cold: "Évaluation à froid",
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  rating: "Note (1 à 5)",
  single_choice: "Choix unique",
  multiple_choice: "Choix multiple",
  text: "Réponse libre",
};

// A starting point offered in the editor — not enforced, staff can clear
// or edit freely (client feedback: fully customizable per course). "rating"
// has no options of its own — the 1-5 scale is fixed in the form renderer,
// not configurable data, unlike single_choice/multiple_choice.
export function defaultQuestions(kind: SurveyKind): { type: string; prompt: string; options?: { id: string; text: string }[] }[] {
  if (kind === "hot") {
    return [
      { type: "rating", prompt: "Note globale de la formation" },
      { type: "rating", prompt: "Qualité du contenu pédagogique" },
      { type: "rating", prompt: "Qualité du formateur" },
      { type: "text", prompt: "Un commentaire à ajouter ?" },
    ];
  }
  return [
    { type: "rating", prompt: "Avec le recul, cette formation a-t-elle répondu à vos attentes ?" },
    { type: "text", prompt: "Qu'avez-vous concrètement mis en pratique depuis la formation ?" },
  ];
}

// Idempotent: reuses an existing "sent" or "completed" response for this
// (survey, dossier) pair rather than creating a duplicate, then emails the
// public link — same shape as createSessionInvitation/NeedsAssessmentRequest.
export async function sendSatisfactionSurvey({
  organization,
  dossier,
  contact,
  courseTitle,
  surveyId,
  origin,
}: {
  organization: Organization;
  dossier: Dossier;
  contact: Contact;
  courseTitle: string;
  surveyId: string;
  origin: string;
}) {
  let response = await prisma.satisfactionSurveyResponse.findUnique({
    where: { surveyId_dossierId: { surveyId, dossierId: dossier.id } },
  });
  if (!response) {
    response = await prisma.satisfactionSurveyResponse.create({
      data: {
        organizationId: organization.id,
        surveyId,
        dossierId: dossier.id,
        token: randomBytes(20).toString("hex"),
      },
    });
  }
  if (response.status === "completed") return response;

  const surveyUrl = `${origin}/satisfaction/${response.token}`;
  try {
    await sendTransactionalEmail({
      to: contact.email,
      toName: `${contact.firstName} ${contact.lastName}`,
      subject: `${organization.name} — votre avis sur "${courseTitle}"`,
      text: `Bonjour ${contact.firstName},\n\nMerci de prendre quelques instants pour nous faire part de votre avis sur la formation "${courseTitle}" :\n${surveyUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
    });
  } catch {
    // Non-fatal — the response record (and its link) still exists for manual relay.
  }
  return response;
}
