import { SessionFormat } from "@prisma/client";
import { computeFundingSummary, resolveDossierPriceCents, type FundingCommitmentInput } from "@/lib/funding";

// The fixed catalogue of questions a conditional DocumentTemplate's blocks
// can branch on — same "one place, code-defined, extended by a dev when
// asked" pattern as AUTOMATION_TRIGGER_VALUES in automationRules.ts. Block
// CONTENT (the actual clause text + which conditions attach) lives in the
// DB and is admin-editable from the Bibliothèque; the branching vocabulary
// itself does not, since it needs to stay consistent with what the
// resolvers below can actually compute from real dossier data.
export type QuestionKey = "statutApprenant" | "modalite" | "subrogation" | "resteACharge";

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
];

export const QUESTION_BY_KEY: Record<QuestionKey, QuestionDefinition> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, q]),
) as Record<QuestionKey, QuestionDefinition>;

export type ResolveContext = {
  dossier: { learnerCategory: string | null; agreedPriceCents: number | null };
  session: { format: SessionFormat };
  course: { priceCents: number | null };
  fundingCommitments: FundingCommitmentInput[];
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
