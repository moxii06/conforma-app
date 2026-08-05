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

// Frozen into every WithdrawalWaiver row at acceptance time. Editing this
// wording later is safe: existing rows keep the version their learner
// actually read. Never interpolate anything dynamic into it — the proof
// must be byte-identical to what was on screen.
export const WAIVER_TEXT =
  "Je demande expressément à accéder au contenu de ma formation avant l'expiration de mon délai de rétractation de " +
  "quatorze jours (article L.221-18 du Code de la consommation). Je reconnais qu'en accédant dès maintenant à ce " +
  "contenu numérique, je perds mon droit de rétractation au titre du Code de la consommation, conformément à " +
  "l'article L.221-28, 13° du même code. Cette renonciation est sans effet sur le délai de dix jours prévu à " +
  "l'article L.6353-5 du Code du travail, qui reste applicable : aucune somme ne peut être exigée de moi avant son " +
  "expiration, et son exercice m'ouvre droit à la restitution intégrale des sommes éventuellement versées.";

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
