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
  | "contenuRevente"
  | "ateliers"
  | "autorisationImage"
  | "retractation";

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
    label: "Comment le prix de la formation est-il réglé ?",
    hint:
      "« Financement direct » : le financeur règle l'organisme par subrogation et le bénéficiaire n'a aucune somme à verser — " +
      "un article d'échéancier y décrirait un versement qui n'aura pas lieu.",
    options: [
      { value: "comptant", label: "En une fois, par le bénéficiaire" },
      { value: "echelonne", label: "Selon un échéancier" },
      { value: "opco_direct", label: "Financement direct par l'OPCO (aucun versement du bénéficiaire)" },
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
  {
    key: "ateliers",
    label: "La formation comporte-t-elle des ateliers ou des temps collectifs ?",
    hint: "Résolu tout seul dès qu'un atelier est programmé sur la session (Planning).",
    options: [
      { value: "oui", label: "Oui" },
      { value: "non", label: "Non" },
    ],
  },
  {
    key: "autorisationImage",
    label: "Le bénéficiaire autorise-t-il l'utilisation de son image et de sa voix ?",
    hint: "Le cas du mineur est déduit de la date de naissance du contact quand elle est renseignée.",
    options: [
      { value: "accordee", label: "Oui, autorisation accordée" },
      { value: "refusee", label: "Non, autorisation refusée" },
      { value: "mineur", label: "Bénéficiaire mineur — autorisation du représentant légal" },
    ],
  },
  {
    key: "retractation",
    label: "Quel régime de rétractation s'applique, et l'accès aux contenus est-il ouvert pendant le délai ?",
    hint:
      "Déduit du mode de conclusion du contrat de la session, puis de la politique d'accès de la formation ou de l'organisme.",
    options: [
      { value: "avec_blocage", label: "Délai applicable, accès aux contenus fermé pendant le délai" },
      { value: "sans_blocage", label: "Délai applicable, accès ouvert dès la signature (renonciation expresse)" },
      { value: "sans_delai", label: "Pas de délai de rétractation — contrat signé en présence, dans les locaux" },
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
  paiement: { comptant: "Paiement comptant", echelonne: "Paiement échelonné", opco_direct: "Financement direct OPCO" },
  accesImmediat: { oui: "Accès anticipé possible", non: "Accès fermé pendant le délai" },
  droitImage: { oui: "Autorisation image jointe", non: "Sans autorisation image" },
  indemniteAnnulation: { oui: "Indemnité d'annulation", non: "Sans indemnité d'annulation" },
  missionFormateur: { individualise: "Accompagnement individualisé", collectif: "Sessions collectives" },
  enregistrementSessions: { oui: "Sessions enregistrées", non: "Sessions non enregistrées" },
  stagiairesApparaissent: { oui: "Apprenants filmés", non: "Apprenants non filmés" },
  contenuRevente: { oui: "Formation commercialisée", non: "Contenu complémentaire" },
  ateliers: { oui: "Ateliers collectifs", non: "Sans atelier collectif" },
  autorisationImage: { accordee: "Image autorisée", refusee: "Image refusée", mineur: "Mineur — représentant légal" },
  retractation: {
    avec_blocage: "Rétractation, accès fermé",
    sans_blocage: "Rétractation, accès ouvert",
    sans_delai: "Sans délai de rétractation",
  },
};

export type ResolveContext = {
  dossier: { learnerCategory: string | null; agreedPriceCents: number | null };
  // null = pas encore de session (envoi depuis une opportunité CRM, avant
  // toute inscription) — la question « modalité » est alors posée au lieu
  // d'être auto-résolue.
  session: {
    format: SessionFormat | null;
    // Surcharges portées par la session (null = hérite de la formation, qui
    // hérite de l'organisme) — voir les commentaires de schéma de Session.
    // Toutes optionnelles : les appelants qui n'ont pas de session réelle
    // (CRM, sous-traitant) n'ont rien à en dire, et la question est posée.
    withdrawalAccessPolicy?: string | null;
    /** "remote" | "in_person" — le VRAI critère du droit de rétractation. */
    contractSigningMode?: string | null;
    /** Ateliers/temps collectifs programmés et non annulés sur la session. */
    ateliersCount?: number;
  };
  course: { priceCents: number | null; certificationCode?: string | null; withdrawalAccessPolicy?: string | null };
  /** Le bénéficiaire lui-même. Seule sa date de naissance sert ici : elle
   *  décide du cas « mineur » de l'autorisation d'image. */
  contact?: { birthDate: Date | null };
  fundingCommitments: FundingCommitmentInput[];
  organization: { withdrawalAccessPolicy: string; cancellationFeePercent: number | null };
};

// La cascade session → formation → organisme, écrite une fois : deux
// questions s'appuient dessus et une divergence entre elles ferait dire à un
// même contrat que l'accès est ouvert dans un article et fermé dans l'autre.
function politiqueAccesEffective(ctx: ResolveContext): string {
  return ctx.session.withdrawalAccessPolicy ?? ctx.course.withdrawalAccessPolicy ?? ctx.organization.withdrawalAccessPolicy;
}

/** Âge révolu à la date de référence — pas une division par 365,25 : un
 *  anniversaire pas encore passé dans l'année change la réponse, et c'est
 *  exactement la frontière qui compte ici. */
function ageRevolu(naissance: Date, reference: Date): number {
  let age = reference.getFullYear() - naissance.getFullYear();
  const moisEcoule = reference.getMonth() - naissance.getMonth();
  if (moisEcoule < 0 || (moisEcoule === 0 && reference.getDate() < naissance.getDate())) age--;
  return age;
}

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
  // Une seule des trois branches est déductible. « Comptant » ou
  // « échéancier » n'ont aucun signal en base : les échéances réelles sont
  // saisies APRÈS, sur le Document généré (voir lib/paymentSchedule.ts), qui
  // n'existe pas encore ici. En revanche, quand le prix est intégralement
  // couvert par une prise en charge subrogée, le bénéficiaire ne verse rien :
  // écrire « le prix est réglé en une échéance unique par le Bénéficiaire »
  // serait faux, et c'est le seul cas où la donnée tranche vraiment.
  paiement: (ctx) => {
    const total = resolveDossierPriceCents(ctx.dossier, ctx.course);
    if (total <= 0) return null;
    const summary = computeFundingSummary(total, ctx.fundingCommitments);
    if (summary.remainderCents === 0 && summary.subrogatedCents > 0) return "opco_direct";
    return null;
  },
  // Politique d'accès pendant le délai : session, sinon formation, sinon
  // organisme. La cascade a été ajoutée avec les surcharges par session et
  // par formation — auparavant seul le réglage de l'organisme était lu, ce
  // qui faisait mentir le contrat d'une formation qui s'en écartait.
  accesImmediat: (ctx) => (politiqueAccesEffective(ctx) === "partial" ? "oui" : "non"),
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
  // Un atelier programmé sur la session prouve qu'il y a des temps
  // collectifs. Zéro atelier ne prouve pas l'inverse : sur une session en
  // continu ils se posent au fil de l'eau alors que le contrat, lui, se
  // signe avant. On demande plutôt que d'écrire « non » dans un contrat.
  ateliers: (ctx) => ((ctx.session.ateliersCount ?? 0) > 0 ? "oui" : null),
  // La minorité est un fait d'état civil, déductible dès que la date de
  // naissance du contact est renseignée — et c'est elle qui impose la
  // signature du représentant légal. Accorder ou refuser, en revanche, est
  // une décision de la personne qu'aucune table ne porte : toujours demandé.
  autorisationImage: (ctx) => {
    const naissance = ctx.contact?.birthDate;
    if (naissance && ageRevolu(naissance, new Date()) < 18) return "mineur";
    return null;
  },
  // L'ordre est juridique, pas pratique. Le droit de rétractation de
  // quatorze jours dépend du MODE DE CONCLUSION du contrat, pas du format de
  // la formation (art. L.221-18 C. consom.) — d'où Session.contractSigningMode.
  // Tant qu'il n'est pas renseigné, on ne sait même pas si un délai existe :
  // la politique d'accès de l'organisme répond à une autre question (ce qui
  // se passe PENDANT le délai) et ne peut pas tenir lieu de réponse. La
  // question est alors posée — et c'est cette saisie que l'écran propose
  // ensuite de reporter sur la formation (voir REPORTS_PAR_REPONSE).
  retractation: (ctx) => {
    const mode = ctx.session.contractSigningMode ?? null;
    if (mode === "in_person") return "sans_delai";
    if (mode !== "remote") return null;
    return politiqueAccesEffective(ctx) === "closed" ? "avec_blocage" : "sans_blocage";
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

// ---------------------------------------------------------------------------
// Retour d'écriture vers la formation — l'inverse des résolveurs ci-dessus.
//
// Un résolveur qui rend `null` dit « la fiche formation ne porte pas cette
// information ». L'organisme la saisit alors dans le questionnaire, pour CE
// document — et jusqu'ici elle mourait là : le document suivant reposait la
// même question, et la fiche formation restait vide. Ce qui suit dit, pour
// chaque réponse saisie à la main, quel champ de Course elle renseignerait.
//
// Deux garde-fous portés par la fonction plus bas : on ne propose le report
// que d'une réponse SAISIE (jamais d'une réponse déduite, qui vient déjà de
// la base), et jamais par-dessus un champ déjà renseigné — un document ne
// doit pas pouvoir écraser silencieusement un réglage de la formation.
// ---------------------------------------------------------------------------

/** Les champs de Course qu'une réponse au questionnaire sait renseigner. */
export const CHAMPS_FORMATION_REPORTABLES = ["withdrawalAccessPolicy"] as const;
export type ChampFormation = (typeof CHAMPS_FORMATION_REPORTABLES)[number];

export type ReportFormation = {
  questionKey: QuestionKey;
  champ: ChampFormation;
  valeur: string;
  /** Ce qui suit « Vous avez renseigné : » à l'écran. Une phrase, pas un
   *  nom de colonne — l'organisme n'a pas à connaître le schéma. */
  libelle: string;
};

const REPORTS_PAR_REPONSE: Partial<Record<QuestionKey, Record<string, Omit<ReportFormation, "questionKey">>>> = {
  retractation: {
    avec_blocage: {
      champ: "withdrawalAccessPolicy",
      valeur: "closed",
      libelle: "l'accès aux contenus est fermé pendant le délai de rétractation",
    },
    sans_blocage: {
      champ: "withdrawalAccessPolicy",
      valeur: "partial",
      libelle: "l'accès aux contenus est ouvert pendant le délai de rétractation",
    },
    // « sans_delai » n'a volontairement pas de report : l'absence de délai
    // tient au mode de conclusion du CONTRAT (signé dans les locaux), qui se
    // décide dossier par dossier. Aucun champ de la formation ne le porte, et
    // en inventer un ici ferait dire à la formation quelque chose qu'elle ne
    // sait pas.
  },
  accesImmediat: {
    oui: {
      champ: "withdrawalAccessPolicy",
      valeur: "partial",
      libelle: "l'accès aux contenus est ouvert pendant le délai de rétractation",
    },
    non: {
      champ: "withdrawalAccessPolicy",
      valeur: "closed",
      libelle: "l'accès aux contenus est fermé pendant le délai de rétractation",
    },
  },
};

/**
 * Ce qu'il y aurait à reporter sur la fiche formation, après une génération.
 *
 * `reponsesManuelles` est exactement ce que l'utilisateur a tapé dans le
 * questionnaire — pas le résultat de resolveAnswers, qui mêle saisie et
 * déduction. Une réponse déduite vient déjà de la base : la reporter serait
 * réécrire ce qu'on vient d'y lire.
 *
 * Pure et sans Prisma pour que l'écran (qui l'affiche) et la route (qui
 * l'applique, en recalculant plutôt qu'en croyant le navigateur) tombent sur
 * la même liste.
 */
export function proposerReportsFormation(
  reponsesManuelles: Partial<Record<QuestionKey, string>>,
  formation: Partial<Record<ChampFormation, string | null>>,
): ReportFormation[] {
  const proposes: ReportFormation[] = [];
  const champsDejaProposes = new Set<ChampFormation>();

  for (const q of QUESTIONS) {
    const saisie = reponsesManuelles[q.key];
    if (!saisie) continue;
    // Une valeur qui ne nomme aucune option du catalogue est ignorée ici pour
    // la même raison que dans resolveAnswers : elle n'est pas une réponse.
    if (!q.options.some((o) => o.value === saisie)) continue;

    const report = REPORTS_PAR_REPONSE[q.key]?.[saisie];
    if (!report) continue;
    const actuel = formation[report.champ];
    if (actuel != null && actuel !== "") continue;
    // Deux questions peuvent viser le même champ (rétractation et accès
    // pendant le délai) : on n'en propose qu'un report, sans quoi l'écran
    // demanderait deux fois d'écrire la même colonne — avec le risque de deux
    // valeurs contradictoires.
    if (champsDejaProposes.has(report.champ)) continue;
    champsDejaProposes.add(report.champ);
    proposes.push({ questionKey: q.key, ...report });
  }

  return proposes;
}
