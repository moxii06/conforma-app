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

// Default follow-up thresholds. 30 days of funder silence is the point where
// OPCOs' own processing targets are exceeded and a phone call actually helps;
// 30 days before an agreement lapses leaves time to issue and settle the
// invoice. Shared by the dashboard tasks and the dossier panel.
export const FUNDER_SILENCE_DAYS = 30;
export const AGREEMENT_EXPIRY_WARNING_DAYS = 30;

/**
 * A deposited/instructing commitment that has sat unanswered long enough to
 * chase. Anything without a depositedAt timestamp can't be "waiting" — it was
 * created directly in a later status and there's no silence to measure.
 */
export function isAwaitingFunderTooLong(
  c: { status: string; depositedAt?: Date | null },
  now: Date,
  silenceDays = FUNDER_SILENCE_DAYS,
): boolean {
  if (!AWAITING_FUNDER.includes(c.status as CommitmentStatus)) return false;
  if (!c.depositedAt) return false;
  return now.getTime() - c.depositedAt.getTime() >= silenceDays * 86_400_000;
}

/**
 * A secured agreement whose validity window is closing while its money is
 * still on the way (granted → invoice to issue, invoiced → payment to chase).
 * Once paid, expiry is harmless and this never fires.
 */
export function isAgreementExpiringSoon(
  c: { status: string; validUntil?: Date | null },
  now: Date,
  warningDays = AGREEMENT_EXPIRY_WARNING_DAYS,
): boolean {
  if (!SECURED.includes(c.status as CommitmentStatus) || c.status === "paid") return false;
  if (!c.validUntil) return false;
  return c.validUntil <= new Date(now.getTime() + warningDays * 86_400_000);
}

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
  const warningDays = options?.expiryWarningDays ?? AGREEMENT_EXPIRY_WARNING_DAYS;

  let securedCents = 0;
  let pendingCents = 0;
  let subrogatedCents = 0;
  const expiringSoon: FundingCommitmentInput[] = [];

  for (const c of commitments) {
    const isSecured = SECURED.includes(c.status as CommitmentStatus);
    if (isSecured) {
      securedCents += c.amountCents;
      if (c.subrogation) subrogatedCents += c.amountCents;
      if (isAgreementExpiringSoon(c, now, warningDays)) {
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

/**
 * What a funder's barème suggests asking for: rate × the course's official
 * duration, capped at the per-dossier ceiling. With only a ceiling it IS the
 * estimate (a forfait). Null when the barème can't say anything — the caller
 * must then leave the amount field alone. An estimate to prefill, never a
 * decision: the funder's written accord is the only real number.
 */
export function estimateFundingAmountCents(
  funder: { hourlyRateCents: number | null; maxAmountCents: number | null },
  durationHours: number | null,
): number | null {
  if (funder.hourlyRateCents && durationHours && durationHours > 0) {
    const base = funder.hourlyRateCents * durationHours;
    return funder.maxAmountCents ? Math.min(base, funder.maxAmountCents) : base;
  }
  if (funder.maxAmountCents) return funder.maxAmountCents;
  return null;
}

// ---------------------------------------------------------------------------
// Pipeline transverse : « où en sont mes demandes de prise en charge ? »
//
// Le panneau par dossier répond à « qui paie CE dossier ». Il ne répond pas à
// la question quotidienne d'un OF : quelles demandes dorment chez quel OPCO,
// et laquelle rappeler ce matin. Y répondre imposait d'ouvrir les dossiers un
// par un — donc, en pratique, de ne pas y répondre.
//
// Le tri est le cœur de l'écran : une liste de prises en charge classée par
// date de création ne sert à rien. Elle est classée par urgence réelle
// (accord périmé > accord qui expire > silence du financeur), puis par
// ancienneté à l'intérieur de chaque niveau.
// ---------------------------------------------------------------------------

export type FundingBucketKey = "draft" | "awaiting" | "granted" | "invoiced" | "paid" | "refused";

export const FUNDING_BUCKETS: {
  key: FundingBucketKey;
  label: string;
  /** Ce que l'OF doit en faire — l'étiquette seule ne le dit pas. */
  hint: string;
  statuses: CommitmentStatus[];
}[] = [
  {
    key: "draft",
    label: "À déposer",
    hint: "Préparées mais jamais envoyées au financeur — rien n'avancera tant qu'elles restent ici.",
    statuses: ["draft"],
  },
  {
    key: "awaiting",
    label: "Chez le financeur",
    hint: "Déposées, en attente de réponse. Au-delà de 30 jours, un appel débloque plus qu'un mail.",
    statuses: ["deposited", "instructing"],
  },
  {
    key: "granted",
    label: "Accord obtenu",
    hint: "L'argent est acquis mais pas encore demandé : c'est ici que se perd le plus de trésorerie.",
    statuses: ["granted"],
  },
  {
    key: "invoiced",
    label: "Facturé au financeur",
    hint: "Facture émise, règlement à suivre.",
    statuses: ["invoiced"],
  },
  { key: "paid", label: "Réglé", hint: "Encaissé — plus rien à faire.", statuses: ["paid"] },
  {
    key: "refused",
    label: "Refusé",
    hint: "Conservées comme trace de ce qui a été tenté. Le reste à charge revient au client.",
    statuses: ["refused"],
  },
];

export function bucketOf(status: string): FundingBucketKey {
  const bucket = FUNDING_BUCKETS.find((b) => b.statuses.includes(status as CommitmentStatus));
  // Un statut inconnu (donnée ancienne, saisie manuelle en base) reste visible
  // dans « À déposer » plutôt que de disparaître silencieusement de l'écran.
  return bucket?.key ?? "draft";
}

/** Ce qui cloche sur une prise en charge, du plus grave au moins grave. */
export type FundingAlert = "expired" | "expiring" | "silent" | null;

export function commitmentAlert(
  c: { status: string; depositedAt?: Date | null; validUntil?: Date | null },
  now: Date,
): FundingAlert {
  // Un accord périmé alors que la facture n'est pas réglée : le financeur ne
  // doit plus rien. C'est irréversible, donc prioritaire sur tout le reste.
  if (
    SECURED.includes(c.status as CommitmentStatus) &&
    c.status !== "paid" &&
    c.validUntil &&
    c.validUntil < now
  ) {
    return "expired";
  }
  if (isAgreementExpiringSoon(c, now)) return "expiring";
  if (isAwaitingFunderTooLong(c, now)) return "silent";
  return null;
}

const ALERT_RANK: Record<Exclude<FundingAlert, null>, number> = { expired: 3, expiring: 2, silent: 1 };

/**
 * Tri d'urgence : alerte la plus grave d'abord, puis la plus ancienne à
 * l'intérieur d'un même niveau. La date de référence est celle qui porte
 * l'urgence — l'échéance d'accord quand il y en a une, sinon la date de dépôt.
 * Renvoie une valeur négative/positive utilisable directement dans `sort`.
 */
export function compareFundingUrgency(
  a: { status: string; depositedAt?: Date | null; validUntil?: Date | null; createdAt: Date },
  b: { status: string; depositedAt?: Date | null; validUntil?: Date | null; createdAt: Date },
  now: Date,
): number {
  const rankA = ALERT_RANK[commitmentAlert(a, now) as Exclude<FundingAlert, null>] ?? 0;
  const rankB = ALERT_RANK[commitmentAlert(b, now) as Exclude<FundingAlert, null>] ?? 0;
  if (rankA !== rankB) return rankB - rankA;
  const dateA = a.validUntil ?? a.depositedAt ?? a.createdAt;
  const dateB = b.validUntil ?? b.depositedAt ?? b.createdAt;
  return dateA.getTime() - dateB.getTime();
}

export type FundingPipelineTotals = {
  /** Demandé, sans réponse : draft + deposited + instructing. */
  requestedCents: number;
  /** Accordé mais pas encore facturé — la trésorerie qui dort. */
  toInvoiceCents: number;
  /** Facturé aux financeurs, pas encore réglé. */
  awaitingPaymentCents: number;
  /** Encaissé. */
  settledCents: number;
  /** Nombre de prises en charge portant une alerte, par gravité. */
  expired: number;
  expiring: number;
  silent: number;
};

export function computeFundingPipelineTotals(
  commitments: { amountCents: number; status: string; depositedAt?: Date | null; validUntil?: Date | null }[],
  now = new Date(),
): FundingPipelineTotals {
  const totals: FundingPipelineTotals = {
    requestedCents: 0,
    toInvoiceCents: 0,
    awaitingPaymentCents: 0,
    settledCents: 0,
    expired: 0,
    expiring: 0,
    silent: 0,
  };
  for (const c of commitments) {
    switch (bucketOf(c.status)) {
      case "draft":
      case "awaiting":
        totals.requestedCents += c.amountCents;
        break;
      case "granted":
        totals.toInvoiceCents += c.amountCents;
        break;
      case "invoiced":
        totals.awaitingPaymentCents += c.amountCents;
        break;
      case "paid":
        totals.settledCents += c.amountCents;
        break;
      // "refused" ne compte nulle part — même raison que dans
      // computeFundingSummary : c'est une trace, pas un montant.
    }
    const alert = commitmentAlert(c, now);
    if (alert === "expired") totals.expired++;
    else if (alert === "expiring") totals.expiring++;
    else if (alert === "silent") totals.silent++;
  }
  return totals;
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
