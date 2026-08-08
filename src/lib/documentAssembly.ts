import type { QuestionKey } from "@/lib/documentQuestionnaire";

// A block's stored `conditions` is a flat AND of equality checks — see the
// DocumentTemplateBlock schema comment for why this shape (not a general
// expression language) is enough. Read from Prisma as JsonValue, so this
// module is also where the untyped DB value gets validated back into a
// concrete shape.
export type BlockCondition = { questionKey: QuestionKey; in: string[] };

export type TemplateBlock = {
  order: number;
  bodyText: string;
  conditions: unknown;
};

/** Defensive parse of a block's stored `conditions` JSON — malformed or
 * empty data is treated as "always included" rather than thrown away, so a
 * corrupt row can never silently drop a clause from a generated contract. */
export function parseConditions(raw: unknown): BlockCondition[] {
  if (!Array.isArray(raw)) return [];
  const parsed: BlockCondition[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).questionKey === "string" &&
      Array.isArray((entry as Record<string, unknown>).in)
    ) {
      const inValues = (entry as { in: unknown[] }).in.filter((v): v is string => typeof v === "string");
      if (inValues.length > 0) {
        parsed.push({ questionKey: (entry as { questionKey: QuestionKey }).questionKey, in: inValues });
      }
    }
  }
  return parsed;
}

/** True when every condition on the block is satisfied by `answers` — an
 * empty condition list (no conditions at all, or a question whose answer
 * isn't known) never silently excludes; only a condition that's actively
 * unmet does. */
export function blockMatches(conditions: unknown, answers: Partial<Record<QuestionKey, string>>): boolean {
  const parsed = parseConditions(conditions);
  return parsed.every((c) => {
    const answer = answers[c.questionKey];
    return answer !== undefined && c.in.includes(answer);
  });
}

/** Every question key referenced by any block's conditions — what the
 * caller needs an answer for before it can assemble this template with
 * confidence. */
export function collectQuestionKeys(blocks: TemplateBlock[]): QuestionKey[] {
  const keys = new Set<QuestionKey>();
  for (const block of blocks) {
    for (const c of parseConditions(block.conditions)) keys.add(c.questionKey);
  }
  return Array.from(keys);
}

/**
 * Filters blocks by `answers`, sorts by order, and joins into a single
 * plain-text body — the exact same shape as a flat DocumentTemplate.bodyText,
 * so every downstream consumer (mergeTemplate, plainTextToHtml, PDF
 * generation) needs no changes to handle an assembled document.
 */
export function assembleBlocks(blocks: TemplateBlock[], answers: Partial<Record<QuestionKey, string>>): string {
  return blocks
    .filter((b) => blockMatches(b.conditions, answers))
    .sort((a, b) => a.order - b.order)
    .map((b) => b.bodyText)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Palette de clauses — le moteur conditionnel, ouvert à tous les modèles.
//
// Le moteur ci-dessus marche pour n'importe quel modèle depuis le début, mais
// en pratique seuls les modèles de démarrage Jalon en profitaient : y recourir
// supposait d'écrire soi-même le texte d'une clause ET de savoir sur quelle
// question la brancher. Un organisme qui importe son propre contrat n'allait
// pas réécrire un article d'échéancier pour découvrir le mécanisme.
//
// Ces clauses sont donc livrées prêtes, condition comprise, à cocher depuis
// l'éditeur de la Bibliothèque. Une fois cochée, une clause est un bloc comme
// un autre : rien de spécial à la génération, elle s'insère ou se retire selon
// les réponses au questionnaire par le chemin normal (blockMatches).
//
// Même statut que les modèles de démarrage : ce sont des points de départ
// génériques, à faire relire par un juriste — voir STARTER_TEMPLATE_NOTICE.
// ---------------------------------------------------------------------------

export type ClauseDePalette = {
  id: string;
  /** Texte de la puce dans l'éditeur. Court : c'est une pastille. */
  label: string;
  /** Quand la clause apparaîtra dans le document — la vraie information. */
  description: string;
  bodyText: string;
  conditions: BlockCondition[];
};

export const CLAUSES_PALETTE: ClauseDePalette[] = [
  {
    id: "echeancier",
    label: "Échéancier de règlement",
    description: "Apparaît quand le règlement se fait selon un échéancier.",
    conditions: [{ questionKey: "paiement", in: ["echelonne"] }],
    bodyText:
      "Article — Échéancier de règlement\n\n" +
      "Le prix est réglé selon l'échéancier annexé au présent document. Aucune somme n'est exigible avant l'expiration " +
      "du délai de rétractation légal. Le premier versement ne peut excéder trente pour cent (30 %) du prix convenu ; " +
      "le solde est réparti en échéances appelées au fur et à mesure du déroulement de l'action de formation.",
  },
  {
    id: "financement_direct",
    label: "Financement OPCO direct",
    description: "Apparaît quand le financeur règle l'organisme et que le bénéficiaire ne verse rien.",
    conditions: [{ questionKey: "paiement", in: ["opco_direct"] }],
    bodyText:
      "Article — Prise en charge directe par le financeur\n\n" +
      "Le prix de la formation est réglé directement à {{organization.name}} par le financeur, dans le cadre d'une " +
      "subrogation de paiement, sur présentation des justificatifs de réalisation de l'action. Aucune somme n'est " +
      "appelée auprès du bénéficiaire à ce titre.\n\n" +
      "En cas de refus, de retrait ou de réduction de la prise en charge, ou de défaut de paiement du financeur, les " +
      "sommes correspondantes redeviennent exigibles auprès du bénéficiaire, après information écrite préalable.",
  },
  {
    id: "image_accordee",
    label: "Droit à l'image — accordé",
    description: "Apparaît quand le bénéficiaire autorise l'utilisation de son image et de sa voix.",
    conditions: [{ questionKey: "autorisationImage", in: ["accordee"] }],
    bodyText:
      "Article — Autorisation d'utilisation de l'image et de la voix\n\n" +
      "Le bénéficiaire autorise {{organization.name}} à fixer, reproduire et communiquer son image et sa voix, captées " +
      "à l'occasion de la formation, sur ses supports pédagogiques et de communication. Cette autorisation est " +
      "consentie à titre gratuit, pour une durée de cinq ans à compter de la signature.\n\n" +
      "Elle peut être retirée à tout moment par écrit, sans effet sur les exploitations antérieures. Aucune " +
      "utilisation portant atteinte à la dignité ou à la réputation du bénéficiaire ne peut être faite.",
  },
  {
    id: "image_mineur",
    label: "Droit à l'image — mineur",
    description: "Apparaît quand le bénéficiaire est mineur : c'est le représentant légal qui autorise.",
    conditions: [{ questionKey: "autorisationImage", in: ["mineur"] }],
    bodyText:
      "Article — Autorisation d'utilisation de l'image et de la voix d'un mineur\n\n" +
      "Le bénéficiaire étant mineur, l'autorisation d'utilisation de son image et de sa voix est donnée par son " +
      "représentant légal, qui signe le présent document à cet effet. Elle est consentie à titre gratuit, pour une " +
      "durée de cinq ans, et peut être retirée à tout moment par écrit.\n\n" +
      "Toute exploitation cesse au plus tard au retrait de l'autorisation, ou à la demande du bénéficiaire devenu " +
      "majeur.",
  },
  {
    id: "image_refusee",
    label: "Droit à l'image — refusé",
    description: "Apparaît quand le bénéficiaire refuse l'utilisation de son image.",
    conditions: [{ questionKey: "autorisationImage", in: ["refusee"] }],
    bodyText:
      "Article — Refus d'utilisation de l'image et de la voix\n\n" +
      "Le bénéficiaire n'autorise pas l'utilisation de son image ni de sa voix. {{organization.name}} s'engage à ce " +
      "qu'aucune captation le représentant ne soit diffusée et, le cas échéant, à l'écarter de toute séquence " +
      "enregistrée.",
  },
  {
    id: "atelier_collectif",
    label: "Ateliers et temps collectifs",
    description: "Apparaît quand la formation comporte des ateliers ou des temps collectifs.",
    conditions: [{ questionKey: "ateliers", in: ["oui"] }],
    bodyText:
      "Article — Ateliers et temps collectifs\n\n" +
      "La formation comporte des ateliers ou temps collectifs, animés à des dates communiquées au bénéficiaire. La " +
      "participation est ouverte aux personnes inscrites et peut être limitée en nombre de places.\n\n" +
      "L'absence à un atelier n'ouvre droit à aucune réduction du prix. Lorsque cela est possible, un report sur une " +
      "session ultérieure de l'atelier est proposé.",
  },
  {
    id: "distanciel",
    label: "Formation à distance",
    description: "Apparaît quand la formation est délivrée à distance, en tout ou partie.",
    conditions: [{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }],
    bodyText:
      "Article — Formation à distance\n\n" +
      "Tout ou partie de la formation est délivrée à distance. Le bénéficiaire doit disposer d'une connexion internet, " +
      "d'un équipement compatible et, pour les temps synchrones, d'un micro. Les modalités techniques d'accès lui sont " +
      "communiquées avant l'entrée en formation.\n\n" +
      "L'assistance technique est joignable à {{organization.publicContactEmail}}. Une interruption de service " +
      "imputable à {{organization.name}} donne lieu au report de la séquence concernée, sans frais.",
  },
  {
    id: "retractation_acces_ferme",
    label: "Rétractation — accès fermé",
    description: "Apparaît quand le délai court et que l'accès aux contenus reste fermé pendant celui-ci.",
    conditions: [{ questionKey: "retractation", in: ["avec_blocage"] }],
    bodyText:
      "Article — Accès aux contenus pendant le délai de rétractation\n\n" +
      "L'accès aux contenus de formation est ouvert à l'expiration du délai de rétractation. Le bénéficiaire conserve " +
      "la faculté de demander expressément un accès anticipé ; à défaut d'une telle demande, aucune exécution n'est " +
      "engagée avant ce terme.",
  },
  {
    id: "retractation_acces_ouvert",
    label: "Rétractation — accès anticipé",
    description: "Apparaît quand l'accès est ouvert dès la signature, sur renonciation expresse.",
    conditions: [{ questionKey: "retractation", in: ["sans_blocage"] }],
    bodyText:
      "Article — Demande d'exécution anticipée\n\n" +
      "Le bénéficiaire qui souhaite accéder aux contenus avant l'expiration de son délai de rétractation en formule la " +
      "demande expresse. Les contenus constituant un contenu numérique fourni sur support immatériel, il reconnaît, " +
      "conformément à l'article L.221-28, 13° du Code de la consommation, perdre son droit de rétractation au titre de " +
      "ce code dès le commencement de l'exécution.\n\n" +
      "Cette renonciation demeure sans effet sur le délai de dix jours prévu à l'article L.6353-5 du Code du travail, " +
      "lequel est d'ordre public et continue de courir.",
  },
  {
    id: "sans_retractation",
    label: "Signé en présence — sans délai de 14 jours",
    description: "Apparaît quand le contrat a été signé dans les locaux : pas de délai du Code de la consommation.",
    conditions: [{ questionKey: "retractation", in: ["sans_delai"] }],
    bodyText:
      "Article — Absence de droit de rétractation au titre du Code de la consommation\n\n" +
      "Le présent contrat ayant été conclu en présence des parties dans les locaux de {{organization.name}}, il ne " +
      "relève pas des contrats conclus à distance ou hors établissement : le délai de quatorze jours prévu à " +
      "l'article L.221-18 du Code de la consommation ne s'applique pas.\n\n" +
      "Le délai de rétractation de dix jours prévu à l'article L.6353-5 du Code du travail, d'ordre public, demeure " +
      "quant à lui applicable.",
  },
];

export const CLAUSE_PALETTE_BY_ID: Record<string, ClauseDePalette> = Object.fromEntries(
  CLAUSES_PALETTE.map((c) => [c.id, c]),
);

function premiereLigne(texte: string): string {
  return texte.split("\n", 1)[0].trim();
}

/**
 * La clause de palette dont ce bloc est issu, ou null.
 *
 * Reconnue à sa PREMIÈRE LIGNE (l'intitulé de l'article) et non au texte
 * entier : un organisme qui adapte le corps d'une clause doit continuer à la
 * voir cochée, sinon la décocher ne la retirerait pas et la recocher en
 * créerait une seconde. Renommer l'intitulé, en revanche, la fait sortir de la
 * palette — le paragraphe devient le sien, ce qui est le comportement voulu :
 * la palette ne réclame la propriété de rien.
 */
export function clausePaletteDuBloc(bodyText: string): string | null {
  const titre = premiereLigne(bodyText);
  if (!titre) return null;
  return CLAUSES_PALETTE.find((c) => premiereLigne(c.bodyText) === titre)?.id ?? null;
}
