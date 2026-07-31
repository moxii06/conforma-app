import { SessionFormat } from "@prisma/client";
import { computeFundingSummary, resolveDossierPriceCents, type FundingCommitmentInput } from "@/lib/funding";

// The fixed catalogue of questions a conditional DocumentTemplate's blocks
// can branch on — same "one place, code-defined, extended by a dev when
// asked" pattern as AUTOMATION_TRIGGER_VALUES in automationRules.ts. Block
// CONTENT (the actual clause text + which conditions attach) lives in the
// DB and is admin-editable from the Bibliothèque; the branching vocabulary
// itself does not, since it needs to stay consistent with what the
// resolvers below can actually compute from real dossier data.
export type QuestionKey =
  | "statutApprenant"
  | "modalite"
  | "subrogation"
  | "resteACharge"
  | "certificationVisee"
  | "paiement"
  | "accesImmediat"
  | "droitImage"
  | "indemniteAnnulation"
  | "missionFormateur"
  | "enregistrementSessions"
  | "stagiairesApparaissent"
  | "contenuRevente";

export type QuestionOption = { value: string; label: string };

export type QuestionDefinition = {
  key: QuestionKey;
  label: string;
  hint?: string;
  options: QuestionOption[];
};

export const QUESTIONS: QuestionDefinition[] = [
  {
    key: "statutApprenant",
    label: "L'apprenant est-il une personne physique payant à titre individuel, ou pris en charge par une entreprise ?",
    hint: "Détermine si un contrat (particulier) ou une convention (entreprise) s'applique.",
    options: [
      { value: "individual", label: "Personne physique, à titre individuel" },
      { value: "company", label: "Salarié ou apprenti, pris en charge par une entreprise" },
    ],
  },
  {
    key: "modalite",
    label: "La formation est-elle délivrée à distance, en présentiel, ou les deux ?",
    options: [
      { value: SessionFormat.IN_PERSON, label: "En présentiel" },
      { value: SessionFormat.REMOTE, label: "À distance" },
      { value: SessionFormat.HYBRID, label: "Les deux (hybride)" },
    ],
  },
  {
    key: "subrogation",
    label: "Un financeur est-il réglé directement par subrogation ?",
    hint: "Oui si un OPCO ou un autre financeur est facturé directement pour tout ou partie du coût.",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "resteACharge",
    label: "Reste-t-il un montant à la charge du client après financement ?",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "certificationVisee",
    label: "La formation prépare-t-elle à une certification enregistrée (RNCP/RS) ?",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "paiement",
    label: "Le règlement s'effectue-t-il en une fois ou selon un échéancier ?",
    options: [
      { value: "comptant", label: "En une fois" },
      { value: "echelonne", label: "Selon un échéancier" },
    ],
  },
  {
    key: "accesImmediat",
    label: "Le bénéficiaire peut-il accéder à des contenus avant la fin du délai de rétractation ?",
    hint: "Déterminé par la politique d'accès pendant le délai définie dans les réglages de l'organisme.",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "droitImage",
    label: "Une autorisation d'utilisation de l'image et de la voix est-elle jointe au contrat ?",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "indemniteAnnulation",
    label: "L'organisme applique-t-il une indemnité forfaitaire en cas d'annulation tardive ?",
    hint: "Déterminé par le pourcentage d'indemnité défini dans les réglages de l'organisme.",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "missionFormateur",
    label: "La mission du formateur est-elle un accompagnement individualisé ou l'animation de sessions collectives ?",
    options: [
      { value: "individualise", label: "Accompagnement individualisé (tutorat, suivi personnalisé)" },
      { value: "collectif", label: "Animation de sessions collectives" },
    ],
  },
  {
    key: "enregistrementSessions",
    label: "Les sessions animées par le formateur sont-elles enregistrées ?",
    hint: "Ajoute l'autorisation d'image et de voix du formateur, et le rappel du consentement à recueillir auprès des apprenants filmés.",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "stagiairesApparaissent",
    label: "Un ou plusieurs apprenants apparaissent-ils ou s'expriment-ils dans la vidéo aux côtés du prestataire ?",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "contenuRevente",
    label: "La vidéo constitue-t-elle à elle seule une action de formation destinée à être commercialisée ?",
    hint: "Déclenche le rappel sur le régime de TVA applicable selon le statut du prestataire.",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
];

export const QUESTION_BY_KEY: Record<QuestionKey, QuestionDefinition> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, q]),
) as Record<QuestionKey, QuestionDefinition>;

// Chip-length wording for each resolved answer — the option labels above
// are full sentences, right for a form but too long for a "✓ Distanciel"
// badge over an assembled preview. Shared by SendDocumentDialog and
// AdaptTemplateDialog so the same choice never reads differently.
export const SHORT_OPTION_LABELS: Record<string, Record<string, string>> = {
  statutApprenant: { individual: "Particulier", company: "Salarié / entreprise" },
  modalite: { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Hybride" },
  subrogation: { oui: "Subrogation financeur", non: "Sans subrogation" },
  resteACharge: { oui: "Reste à charge inclus", non: "Sans reste à charge" },
  certificationVisee: { oui: "Certification visée", non: "Sans certification" },
  paiement: { comptant: "Paiement comptant", echelonne: "Paiement échelonné" },
  accesImmediat: { oui: "Accès anticipé possible", non: "Accès fermé pendant le délai" },
  droitImage: { oui: "Autorisation image jointe", non: "Sans autorisation image" },
  indemniteAnnulation: { oui: "Indemnité d'annulation", non: "Sans indemnité d'annulation" },
  missionFormateur: { individualise: "Accompagnement individualisé", collectif: "Sessions collectives" },
  enregistrementSessions: { oui: "Sessions enregistrées", non: "Sessions non enregistrées" },
  stagiairesApparaissent: { oui: "Apprenants filmés", non: "Apprenants non filmés" },
  contenuRevente: { oui: "Formation commercialisée", non: "Contenu complémentaire" },
};

export type ResolveContext = {
  dossier: { learnerCategory: string | null; agreedPriceCents: number | null };
  session: { format: SessionFormat };
  course: { priceCents: number | null; certificationCode?: string | null };
  fundingCommitments: FundingCommitmentInput[];
  organization: { withdrawalAccessPolicy: string; cancellationFeePercent: number | null };
};

// Each resolver returns an answer already implied by real data, or null to
// mean "ask" — never a guess. A resolver only ever returns one of its own
// question's declared option values.
const RESOLVERS: Record<QuestionKey, (ctx: ResolveContext) => string | null> = {
  statutApprenant: (ctx) => {
    const cat = ctx.dossier.learnerCategory;
    if (cat === "individual" || cat === "jobseeker") return "individual";
    if (cat === "employee" || cat === "apprentice") return "company";
    return null;
  },
  // A session's format is always set (it has a default), so this never
  // actually needs asking — expressed as a resolver anyway so it's usable
  // as a block condition through the exact same mechanism as the others.
  modalite: (ctx) => ctx.session.format,
  subrogation: (ctx) => {
    const active = ctx.fundingCommitments.filter((c) => c.status !== "refused");
    if (active.length === 0) return "non";
    return active.some((c) => c.subrogation) ? "oui" : "non";
  },
  resteACharge: (ctx) => {
    const total = resolveDossierPriceCents(ctx.dossier, ctx.course);
    const summary = computeFundingSummary(total, ctx.fundingCommitments);
    return summary.remainderCents > 0 ? "oui" : "non";
  },
  // Driven by the course's own certification fields — a course either leads
  // to a registered certification or it doesn't, there's nothing per-dossier
  // to ask.
  certificationVisee: (ctx) => (ctx.course.certificationCode ? "oui" : "non"),
  // No signal exists at generation time: the actual due dates/amounts are
  // captured afterward, on the generated Document itself (paymentSchedule —
  // see lib/paymentSchedule.ts), which doesn't exist yet while this
  // question is being resolved. Always asked.
  paiement: () => null,
  // Driven by the organisation's own withdrawal-access setting (Mon profil /
  // Bibliothèque) — never per-dossier.
  accesImmediat: (ctx) => (ctx.organization.withdrawalAccessPolicy === "partial" ? "oui" : "non"),
  // Whether a given beneficiary's image/voice gets used (testimonial, filmed
  // session...) is a per-contract fact with no underlying record. Always asked.
  droitImage: () => null,
  // Driven by the organisation's own cancellation-fee setting (Bibliothèque
  // › Clauses et politiques contractuelles) — never per-dossier.
  indemniteAnnulation: (ctx) => (ctx.organization.cancellationFeePercent != null ? "oui" : "non"),
  // The 4 questions below back the formateur/tournage templates. None of
  // them concern a dossier — a Subcontractor carries no field any of these
  // could be resolved from — so every one is always asked, same as
  // paiement/droitImage above.
  missionFormateur: () => null,
  enregistrementSessions: () => null,
  stagiairesApparaissent: () => null,
  contenuRevente: () => null,
};

/**
 * Resolves every question in the catalogue: a manual answer (if it names a
 * real option) wins, otherwise the auto-resolver runs, otherwise the
 * question is reported unresolved. The caller narrows `unresolved` down to
 * the keys a specific template's blocks actually reference — see
 * lib/documentAssembly.ts.
 */
export function resolveAnswers(
  ctx: ResolveContext,
  manualAnswers: Partial<Record<QuestionKey, string>> = {},
): { answers: Partial<Record<QuestionKey, string>>; unresolved: QuestionKey[] } {
  const answers: Partial<Record<QuestionKey, string>> = {};
  const unresolved: QuestionKey[] = [];

  for (const q of QUESTIONS) {
    const manual = manualAnswers[q.key];
    if (manual && q.options.some((o) => o.value === manual)) {
      answers[q.key] = manual;
      continue;
    }
    const auto = RESOLVERS[q.key](ctx);
    if (auto) {
      answers[q.key] = auto;
    } else {
      unresolved.push(q.key);
    }
  }

  return { answers, unresolved };
}

/**
 * The funder actually named in a subrogation clause — same "active,
 * subrogated" filter as the subrogation question's own resolver, so the
 * name shown in a document always matches the branch that included the
 * clause in the first place. Null when there's nothing to name.
 */
export function resolveSubrogatedFunderName(
  fundingCommitments: { status: string; subrogation: boolean; funder: { name: string } }[],
): string | null {
  const active = fundingCommitments.find((c) => c.status !== "refused" && c.subrogation);
  return active?.funder.name ?? null;
}
