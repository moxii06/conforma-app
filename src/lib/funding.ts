// The one place the funding arithmetic lives — same reasoning as
// buildCourseProgress in lib/lms.ts: several screens need "who owes what on
// this dossier" (the dossier's funding section, the invoice form, later the
// BPF breakdown and the expiring-agreement reminders), and three slightly
// different versions of this sum would be three different answers to the
// same question. Pure and unit-tested for that reason.

export type CommitmentStatus =
  | "draft"
  | "deposited"
  | "instructing"
  | "granted"
  | "refused"
  | "invoiced"
  | "paid";

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  draft: "Brouillon",
  deposited: "Déposé",
  instructing: "En instruction",
  granted: "Accord obtenu",
  refused: "Refusé",
  invoiced: "Facturé",
  paid: "Payé",
};

// Statuses where the ball is in the funder's court — the ones an OF wants
// flagged when they sit unanswered too long.
export const AWAITING_FUNDER: CommitmentStatus[] = ["deposited", "instructing"];

export const FUNDER_TYPE_LABELS: Record<string, string> = {
  opco: "OPCO",
  cpf: "CPF (Caisse des Dépôts)",
  france_travail: "France Travail",
  agefice: "AGEFICE",
  company: "Entreprise",
  individual: "Particulier",
  public: "Financeur public",
  other: "Autre",
};

// A commitment counts towards what's actually covered only once the funder
// has said yes. "requested" is an intention — treating it as secured is how
// an OF ends up discovering a hole after the training has already run.
const SECURED: CommitmentStatus[] = ["granted", "invoiced", "paid"];

export type FundingCommitmentInput = {
  amountCents: number;
  status: string;
  subrogation: boolean;
  validUntil?: Date | null;
};

export type FundingSummary = {
  /** Price this enrollment is actually billed at. */
  totalCents: number;
  /** Agreed by funders (granted / invoiced / paid). */
  securedCents: number;
  /** Asked for but not yet agreed — shown apart, never counted as covered. */
  pendingCents: number;
  /** What the client still owes: total − secured. Never negative. */
  remainderCents: number;
  /** Secured AND subrogated: the part invoiced to funders directly. */
  subrogatedCents: number;
  /** True when funders were granted more than the training costs. */
  overCommitted: boolean;
  /** Already-granted commitments whose agreement expires within `days`. */
  expiringSoon: FundingCommitmentInput[];
};

/**
 * A dossier's own negotiated price wins over the course's catalogue price.
 * Null on the dossier means "nothing negotiated, use the catalogue" — which
 * is the common case and what every pre-existing dossier looks like.
 */
export function resolveDossierPriceCents(
  dossier: { agreedPriceCents: number | null },
  course: { priceCents: number | null },
): number {
  return dossier.agreedPriceCents ?? course.priceCents ?? 0;
}

export function computeFundingSummary(
  totalCents: number,
  commitments: FundingCommitmentInput[],
  options?: { now?: Date; expiryWarningDays?: number },
): FundingSummary {
  const now = options?.now ?? new Date();
  const warningDays = options?.expiryWarningDays ?? 30;
  const warningCutoff = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

  let securedCents = 0;
  let pendingCents = 0;
  let subrogatedCents = 0;
  const expiringSoon: FundingCommitmentInput[] = [];

  for (const c of commitments) {
    const isSecured = SECURED.includes(c.status as CommitmentStatus);
    if (isSecured) {
      securedCents += c.amountCents;
      if (c.subrogation) subrogatedCents += c.amountCents;
      // Only warn on money that is still waiting to arrive: an agreement
      // that already paid out can expire without consequence.
      if (c.status !== "paid" && c.validUntil && c.validUntil <= warningCutoff) {
        expiringSoon.push(c);
      }
    } else if (c.status === "draft" || AWAITING_FUNDER.includes(c.status as CommitmentStatus)) {
      pendingCents += c.amountCents;
    }
    // "refused" contributes to nothing on purpose — it's kept as a record of
    // what was tried, not as a number.
  }

  return {
    totalCents,
    securedCents,
    pendingCents,
    // Clamped: funders granting more than the price is a data-entry mistake,
    // not a credit owed to the learner. It's surfaced via overCommitted
    // instead of showing a negative "reste à charge" nobody can act on.
    remainderCents: Math.max(0, totalCents - securedCents),
    subrogatedCents,
    overCommitted: securedCents > totalCents,
    expiringSoon,
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// ---------------------------------------------------------------------------
// Dossier de financement : les pièces qu'un financeur exige, vérifiées
// contre ce qui existe réellement — jamais déclarées à la main.
//
// The list is the common core every OPCO asks for. It is deliberately NOT
// per-funder-configurable in v1: a wrong "everything is ready" is worse
// than a slightly over-complete checklist, and the core pieces are required
// by all of them anyway.
// ---------------------------------------------------------------------------

export type ReadinessInput = {
  dossier: { needsAssessmentDone: boolean; contractSigned: boolean };
  course: {
    objectives: string | null;
    prerequisites: string | null;
    durationHours: number | null;
    teachingMethods: string | null;
    evaluationModalities: string | null;
  };
  session: { mode: string; startsAt: Date; endsAt: Date };
  organization: { qualiopiCertificateNumber: string | null; qualiopiCertificateUntil: Date | null };
  /** Document categories present on the dossier (Document.category). */
  documentCategories: string[];
  /** True when the session's trainer (or subcontractor) has at least one document (CV, diplôme…). */
  trainerHasDocuments: boolean;
  quoteExists: boolean;
};

export type ReadinessItem = {
  key: string;
  label: string;
  ok: boolean;
  /** What to do about it — actionable, not just "missing". */
  hint: string;
};

export function computeFundingReadiness(input: ReadinessInput, now = new Date()): ReadinessItem[] {
  const courseComplete = Boolean(
    input.course.objectives &&
      input.course.prerequisites !== null &&
      input.course.durationHours &&
      input.course.teachingMethods &&
      input.course.evaluationModalities,
  );
  const certificateValid = Boolean(
    input.organization.qualiopiCertificateNumber &&
      (!input.organization.qualiopiCertificateUntil || input.organization.qualiopiCertificateUntil > now),
  );

  return [
    {
      key: "convention",
      label: "Convention de formation signée",
      ok: input.dossier.contractSigned || input.documentCategories.includes("convention"),
      hint: "Envoyez la convention depuis le dossier, onglet Formations.",
    },
    {
      key: "devis",
      label: "Devis",
      ok: input.quoteExists,
      hint: "Créez le devis sur Facturation, en le liant à ce dossier.",
    },
    {
      key: "programme",
      label: "Programme de formation complet",
      ok: courseComplete,
      hint: "Complétez la fiche formation : objectifs, prérequis, durée, méthodes, modalités d'évaluation.",
    },
    {
      key: "calendrier",
      label: "Calendrier de la formation",
      // A dated session carries its own calendar; a rolling one is defined
      // by its access window, which the enrollment already fixed.
      ok: input.session.mode === "ROLLING" || input.session.endsAt > input.session.startsAt,
      hint: "Renseignez les dates de la session sur le Planning.",
    },
    {
      key: "cv_formateur",
      label: "CV / qualification du formateur",
      ok: input.trainerHasDocuments,
      hint: "Ajoutez le CV sur la fiche du formateur (Équipe & rôles) ou du sous-traitant.",
    },
    {
      key: "certificat_qualiopi",
      label: "Certificat Qualiopi en cours de validité",
      ok: certificateValid,
      hint: "Renseignez votre certificat sur Conformité Qualiopi, onglet Audits.",
    },
    {
      key: "recueil",
      label: "Recueil des besoins",
      ok: input.dossier.needsAssessmentDone,
      hint: "Envoyez le recueil des besoins depuis le dossier — certains financeurs l'exigent au dépôt.",
    },
  ];
}
