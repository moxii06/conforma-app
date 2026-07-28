import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import type { Dossier, Contact, Organization } from "@prisma/client";

// "positioning" reuses the whole satisfaction pipeline (per-course editor,
// public token form, manual send button, completion tracking) for the
// entry-level assessment Qualiopi indicator 8 asks for — a self-positioning
// questionnaire at enrollment. Deliberately NOT a graded quiz: the LMS quiz
// engine measures acquired knowledge at the END; this captures the
// learner's starting point (self-assessed level per objective), which is
// the practice the OF decided to create rather than outil-iser an exam
// nobody runs today. Exit-side comparison comes from real LMS results.
export const SURVEY_KIND_VALUES = ["positioning", "hot", "cold"] as const;
export type SurveyKind = (typeof SURVEY_KIND_VALUES)[number];

export const SURVEY_KIND_LABELS: Record<SurveyKind, string> = {
  positioning: "Test de positionnement",
  hot: "Évaluation à chaud",
  cold: "Évaluation à froid",
};

// Button/action phrasing — "l'évaluation" vs "le test" makes a generic
// `l'${label.toLowerCase()}` impossible, so each kind carries its own.
export const SURVEY_SEND_LABELS: Record<SurveyKind, string> = {
  positioning: "Envoyer le test de positionnement",
  hot: "Envoyer l'évaluation à chaud",
  cold: "Envoyer l'évaluation à froid",
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
  if (kind === "positioning") {
    return [
      { type: "rating", prompt: "Comment évaluez-vous votre niveau actuel sur le sujet de la formation ? (1 = débutant, 5 = expert)" },
      { type: "rating", prompt: "À quelle fréquence pratiquez-vous déjà ce sujet dans votre activité ?" },
      { type: "text", prompt: "Qu'attendez-vous concrètement de cette formation ?" },
      { type: "text", prompt: "Y a-t-il des points particuliers sur lesquels vous vous sentez en difficulté ?" },
    ];
  }
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

  // The email wording depends on what's being asked: a positioning
  // questionnaire arrives BEFORE the training and frames "help us adapt",
  // while hot/cold ask for an opinion afterwards.
  const survey = await prisma.satisfactionSurvey.findUnique({ where: { id: surveyId }, select: { kind: true } });
  const isPositioning = survey?.kind === "positioning";

  const surveyUrl = `${origin}/satisfaction/${response.token}`;
  try {
    await sendTransactionalEmail({
      to: contact.email,
      toName: `${contact.firstName} ${contact.lastName}`,
      subject: isPositioning
        ? `${organization.name} — quelques questions avant "${courseTitle}"`
        : `${organization.name} — votre avis sur "${courseTitle}"`,
      text: isPositioning
        ? `Bonjour ${contact.firstName},\n\nAvant de démarrer la formation "${courseTitle}", merci de répondre à quelques questions : elles nous permettent de situer votre niveau de départ et d'adapter la formation à vos besoins.\n${surveyUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`
        : `Bonjour ${contact.firstName},\n\nMerci de prendre quelques instants pour nous faire part de votre avis sur la formation "${courseTitle}" :\n${surveyUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
    });
  } catch {
    // Non-fatal — the response record (and its link) still exists for manual relay.
  }
  return response;
}
