import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";

/**
 * The gate between a signed contract and the training content, for the
 * duration of the learner's withdrawal period.
 *
 * Why it exists: opening a teaching module IS beginning to perform the
 * contract. Without an express request from the learner (art. L.221-28, 13°
 * C. consom.), the organisation then performs while the learner can still
 * withdraw and be reimbursed in full — it works at its own risk. The waiver
 * button is that express request, and the gate is what makes it real: a
 * waiver over content that was already open would be decorative.
 *
 * Scope, deliberately narrow:
 *  - Only `contrat_formation` triggers it. A convention's signatory is a
 *    company, not a consumer — no consumer withdrawal right, no gate.
 *  - Only a signature recorded IN the platform (Document.signedAt) starts
 *    the clock. A contract marked signed by hand carries no reliable date,
 *    and a gate that guesses its opening day is worse than none.
 *  - The fourteen days are the consumer-code period. The ten days of
 *    art. L.6353-5 C. trav. are about money, not access, and survive the
 *    waiver — the accepted text says so explicitly.
 */

export const WITHDRAWAL_DAYS = 14;

/**
 * Sur quel fondement l'apprenant renonce — et ce n'est pas le même selon ce
 * qu'on lui vend.
 *
 * `digital_content` — art. L.221-28, 13° : contenu numérique fourni sur
 * support immatériel. Le droit tombe DÈS le premier accès, moyennant accord
 * exprès et reconnaissance de la perte. C'est le fondement de l'e-learning,
 * et c'était le seul que Jalon connaissait.
 *
 * `service_completed` — art. L.221-28, 1° : service pleinement exécuté avant
 * la fin du délai, commencé après accord exprès et renoncement exprès. Le
 * droit ne tombe PAS au premier jour : il tombe à l'achèvement. Entre les
 * deux, l'apprenant peut encore se rétracter en devant une somme
 * proportionnelle à ce qui a été fourni (art. L.221-25). C'est le fondement
 * d'une formation en présentiel ou en classe virtuelle qui se termine dans
 * les quatorze jours — et invoquer le 13° pour elle serait mal fondé,
 * puisqu'il n'y a aucun contenu numérique.
 */
export const WAIVER_BASES = ["digital_content", "service_completed"] as const;
export type WaiverBasis = (typeof WAIVER_BASES)[number];

// Figés dans chaque ligne WithdrawalWaiver au moment de l'acceptation.
// Modifier une formulation plus tard est sans danger : les lignes existantes
// gardent la version que leur apprenant a réellement lue. Ne jamais y
// interpoler quoi que ce soit de dynamique — la preuve doit être identique,
// octet pour octet, à ce qui était à l'écran.
export const WAIVER_TEXTS: Record<WaiverBasis, string> = {
  digital_content:
    "Je demande expressément à accéder au contenu de ma formation avant l'expiration de mon délai de rétractation de " +
    "quatorze jours (article L.221-18 du Code de la consommation). Je reconnais qu'en accédant dès maintenant à ce " +
    "contenu numérique, je perds mon droit de rétractation au titre du Code de la consommation, conformément à " +
    "l'article L.221-28, 13° du même code. Cette renonciation est sans effet sur le délai de dix jours prévu à " +
    "l'article L.6353-5 du Code du travail, qui reste applicable : aucune somme ne peut être exigée de moi avant son " +
    "expiration, et son exercice m'ouvre droit à la restitution intégrale des sommes éventuellement versées.",
  service_completed:
    "Je demande expressément que ma formation débute avant l'expiration de mon délai de rétractation de quatorze " +
    "jours (article L.221-18 du Code de la consommation). Je reconnais que mon droit de rétractation prendra fin dès " +
    "que la formation aura été pleinement exécutée, conformément à l'article L.221-28, 1° du même code. Si je me " +
    "rétracte avant cet achèvement, je resterai redevable d'une somme proportionnelle à la prestation déjà fournie " +
    "(article L.221-25). Cette renonciation est sans effet sur le délai de dix jours prévu à l'article L.6353-5 du " +
    "Code du travail, qui reste applicable.",
};

/** Conservé le temps que les appelants historiques migrent. */
export const WAIVER_TEXT = WAIVER_TEXTS.digital_content;

/**
 * Le fondement qui convient, déduit de ce que la formation EST.
 *
 * L'ordre compte et il est juridique, pas pratique : dès qu'il y a du
 * contenu numérique, c'est le 13° qui s'applique à cet accès, quelle que
 * soit la durée. Le 1° prend le relais pour une formation sans e-learning
 * qui s'achève dans le délai — typiquement deux jours de présentiel signés
 * la veille. Une formation sans e-learning qui déborde des quatorze jours ne
 * relève d'aucune exception : rien à faire signer, le droit court.
 */
export function resolveWaiverBasis(input: {
  aDuElearning: boolean;
  /** Fin prévue de la formation, ou null quand elle n'est pas datée. */
  finPrevue: Date | null;
  signeLe: Date;
}): WaiverBasis | null {
  if (input.aDuElearning) return "digital_content";
  if (input.finPrevue && input.finPrevue <= addDays(input.signeLe, WITHDRAWAL_DAYS)) return "service_completed";
  return null;
}

export type WithdrawalGate = {
  /** True while the learner's content access is restricted. */
  active: boolean;
  /** When the period runs out and everything opens regardless. */
  endsAt: Date | null;
  /** "closed" | "partial" — the organisation's own choice. */
  policy: string;
  /** True once the learner has expressly waived. */
  waived: boolean;
};

const OPEN: WithdrawalGate = { active: false, endsAt: null, policy: "closed", waived: false };

/**
 * Quelle politique s'applique : celle de la formation si elle a tranché,
 * celle de l'organisme sinon.
 *
 * Extrait en fonction pure parce que c'est une règle d'héritage, et qu'une
 * règle d'héritage se lit mal au milieu d'une requête. `null` côté formation
 * signifie « je n'ai pas d'avis » et non « ouvert » — l'inverse ouvrirait
 * l'accès pendant la rétractation sur toutes les formations existantes, qui
 * ont toutes ce champ à null.
 */
export function resolveWithdrawalPolicy(
  coursePolicy: string | null | undefined,
  organizationPolicy: string,
): string {
  return coursePolicy ?? organizationPolicy;
}

/**
 * One query bundle, callable from the learner page and from the API routes
 * that must enforce the same decision server-side (stream). Fails open on
 * missing pieces: no signed contract with a date, no gate — restricting
 * access on guesswork would lock learners out of trainings sold under
 * other regimes entirely.
 */
export async function loadWithdrawalGate(dossierId: string): Promise<WithdrawalGate> {
  const [contract, waiver, dossier] = await Promise.all([
    prisma.document.findFirst({
      where: { dossierId, category: "contrat_formation", signatureStatus: "signed", signedAt: { not: null } },
      orderBy: { signedAt: "desc" },
      select: { signedAt: true },
    }),
    prisma.withdrawalWaiver.findUnique({ where: { dossierId }, select: { id: true } }),
    prisma.dossier.findUnique({
      where: { id: dossierId },
      select: {
        organization: { select: { withdrawalAccessPolicy: true } },
        session: { select: { course: { select: { withdrawalAccessPolicy: true } } } },
      },
    }),
  ]);

  if (!contract?.signedAt || !dossier) return OPEN;

  const endsAt = addDays(contract.signedAt, WITHDRAWAL_DAYS);
  const policy = resolveWithdrawalPolicy(
    dossier.session.course.withdrawalAccessPolicy,
    dossier.organization.withdrawalAccessPolicy,
  );
  const waived = waiver != null;

  return {
    active: !waived && new Date() < endsAt,
    endsAt,
    policy,
    waived,
  };
}

/** Whether one module is reachable under the gate — shared by the learner
 *  page (what to render) and the stream route (what to actually serve). */
export function moduleAccessibleUnderGate(
  gate: WithdrawalGate,
  module_: { availableDuringWithdrawal: boolean },
): boolean {
  if (!gate.active) return true;
  return gate.policy === "partial" && module_.availableDuringWithdrawal;
}
