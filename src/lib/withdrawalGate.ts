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

/* ------------------------------------------------------------------ *
 * CE QUI DÉCLENCHE LE DÉLAI : LA FAÇON DONT LE CONTRAT A ÉTÉ CONCLU
 *
 * Beaucoup d'organismes croient que « présentiel = pas de rétractation ».
 * C'est faux, et l'erreur coûte cher : le délai de quatorze jours dépend
 * du MODE DE CONCLUSION du contrat (art. L.221-1 et L.221-18 C. consom.),
 * pas du lieu où la formation se déroule ensuite.
 *
 *   — signé à distance (e-mail, signature électronique, téléphone) : les
 *     quatorze jours courent, même si la formation se tient en salle ;
 *   — signé en présence, dans les locaux de l'organisme : contrat conclu
 *     hors du champ de la vente à distance et du démarchage, aucun délai
 *     de rétractation consumériste.
 *
 * Et la formation professionnelle ne figure dans AUCUNE des treize
 * exceptions de l'art. L.221-28 — l'exception « loisirs à date
 * déterminée » (12°) vise le spectacle et l'hôtellerie, pas une action de
 * formation. Il n'y a donc pas de porte de sortie par la nature du
 * service : seul le mode de conclusion tranche.
 *
 * Le champ vit sur la SESSION (Session.contractSigningMode) parce que la
 * même formation se vend en agence un mois et par e-mail le suivant.
 * ------------------------------------------------------------------ */

export const SIGNING_MODES = ["remote", "in_person"] as const;
export type SigningMode = (typeof SIGNING_MODES)[number];

export const SIGNING_MODE_LABELS: Record<SigningMode, string> = {
  remote: "Signé à distance",
  in_person: "Signé en présence",
};

/** Le détail qui rend le choix évident — repris tel quel à l'écran. */
export const SIGNING_MODE_HINTS: Record<SigningMode, string> = {
  remote: "E-mail, signature électronique, courrier ou téléphone. Le délai de 14 jours s'applique.",
  in_person: "Contrat signé sur place, dans vos locaux. Aucun délai de rétractation.",
};

/**
 * La phrase à afficher partout où ce réglage se présente. Une seule
 * formulation, pour que l'écran de la session, celui de la formation et un
 * futur écran d'aide ne racontent pas trois versions du même droit.
 */
export const CRITERE_RETRACTATION_PHRASE =
  "Ce n'est pas le lieu de la formation qui compte, mais la façon dont le contrat a été signé : " +
  "à distance (e-mail, signature électronique), l'apprenant a 14 jours pour se rétracter même si la " +
  "formation se déroule ensuite en salle ; signé en présence dans vos locaux, il n'y a pas de délai.";

/**
 * Y a-t-il un délai de rétractation à respecter ?
 *
 * `null` (non renseigné) répond OUI. C'est délibérément le comportement
 * prudent : se tromper en appliquant un délai qui n'existait pas ne coûte
 * que quelques jours d'attente, alors que se tromper dans l'autre sens
 * expose l'organisme à un remboursement intégral.
 */
export function delaiRetractationApplicable(contractSigningMode: string | null | undefined): boolean {
  return contractSigningMode !== "in_person";
}

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
  /**
   * Le fondement applicable, ou null quand aucune exception ne joue.
   *
   * Résolu ICI et nulle part ailleurs : l'écran qui affiche la case et la
   * route qui enregistre la preuve doivent tomber sur le même texte, au
   * caractère près. Deux calculs séparés finiraient par diverger, et la
   * preuve ne correspondrait plus à ce qui était affiché.
   */
  waiverBasis: WaiverBasis | null;
  /** Le texte exact soumis à l'apprenant, ou null s'il n'y a rien à signer. */
  waiverText: string | null;
  /**
   * Le mode de conclusion retenu pour cette session, tel qu'il est en base.
   * Exposé pour que l'écran puisse dire POURQUOI il n'y a pas de délai,
   * plutôt que de laisser croire à un oubli.
   */
  signingMode: SigningMode | null;
  /**
   * Faux uniquement quand le contrat a été signé en présence : il n'y a
   * alors aucun délai à faire courir, donc rien à bloquer et rien à faire
   * renoncer. Non renseigné vaut vrai (voir delaiRetractationApplicable).
   */
  delaiApplicable: boolean;
};

const OPEN: WithdrawalGate = {
  active: false,
  endsAt: null,
  policy: "closed",
  waived: false,
  waiverBasis: null,
  waiverText: null,
  signingMode: null,
  delaiApplicable: true,
};

/**
 * Quelle politique s'applique : celle de la SESSION si elle a tranché,
 * celle de la formation sinon, celle de l'organisme en dernier ressort.
 *
 * Extrait en fonction pure parce que c'est une règle d'héritage, et qu'une
 * règle d'héritage se lit mal au milieu d'une requête. `null` à un échelon
 * signifie « je n'ai pas d'avis » et non « ouvert » — l'inverse ouvrirait
 * l'accès pendant la rétractation sur toutes les formations existantes, qui
 * ont toutes ce champ à null.
 *
 * L'échelon session est arrivé après coup et se glisse DEVANT les deux
 * autres : une même formation vendue en inter puis en intra n'a pas les
 * mêmes contraintes, et c'est la session qui porte la vente.
 */
export function resolveWithdrawalPolicy(
  sessionPolicy: string | null | undefined,
  coursePolicy: string | null | undefined,
  organizationPolicy: string,
): string {
  return sessionPolicy ?? coursePolicy ?? organizationPolicy;
}

/** D'où vient la valeur effective — ce que l'écran doit pouvoir nommer. */
export type OrigineReglage = "session" | "formation" | "organisme";

export function originePolitiqueAcces(
  sessionPolicy: string | null | undefined,
  coursePolicy: string | null | undefined,
): OrigineReglage {
  if (sessionPolicy != null) return "session";
  if (coursePolicy != null) return "formation";
  return "organisme";
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
        session: {
          select: {
            // La fin PRÉVUE de la formation : c'est elle qui dit si le
            // service sera pleinement exécuté dans le délai (L.221-28, 1°).
            endsAt: true,
            // Les deux réglages portés par la session : sa surcharge de la
            // politique d'accès, et surtout le mode de conclusion du
            // contrat, qui décide s'il y a un délai tout court.
            withdrawalAccessPolicy: true,
            contractSigningMode: true,
            course: {
              select: {
                withdrawalAccessPolicy: true,
                // Un seul module suffit à faire du contenu numérique : on
                // cherche l'existence, pas le compte.
                elearningModules: { select: { id: true }, take: 1 },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!contract?.signedAt || !dossier) return OPEN;

  const signingMode = (SIGNING_MODES as readonly string[]).includes(dossier.session.contractSigningMode ?? "")
    ? (dossier.session.contractSigningMode as SigningMode)
    : null;
  const delaiApplicable = delaiRetractationApplicable(signingMode);

  const endsAt = addDays(contract.signedAt, WITHDRAWAL_DAYS);
  const policy = resolveWithdrawalPolicy(
    dossier.session.withdrawalAccessPolicy,
    dossier.session.course.withdrawalAccessPolicy,
    dossier.organization.withdrawalAccessPolicy,
  );
  const waived = waiver != null;
  const waiverBasis = resolveWaiverBasis({
    aDuElearning: dossier.session.course.elearningModules.length > 0,
    finPrevue: dossier.session.endsAt,
    signeLe: contract.signedAt,
  });

  // Contrat signé en présence : aucun délai ne court, donc rien à bloquer
  // et rien à faire renoncer. On sort avec un portail ouvert plutôt qu'avec
  // une date de fin fictive — `endsAt` renseigné ferait afficher « jusqu'au
  // 21 août » à un apprenant qui n'a jamais eu ce droit.
  if (!delaiApplicable) {
    return { ...OPEN, policy, waived, signingMode, delaiApplicable: false };
  }

  return {
    active: !waived && new Date() < endsAt,
    endsAt,
    policy,
    waived,
    waiverBasis,
    waiverText: waiverBasis ? WAIVER_TEXTS[waiverBasis] : null,
    signingMode,
    delaiApplicable: true,
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
