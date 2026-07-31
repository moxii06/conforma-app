// Les six bases légales de l'article 6 du RGPD.
//
// `ProcessingActivity.legalBasis` était un champ texte libre. Un registre
// des traitements n'a d'intérêt que s'il est opposable : « parce qu'on en a
// besoin » n'est pas une base légale, et une case vide devant un contrôleur
// vaut absence de base. Il n'y en a que six, elles sont limitatives, donc
// c'est une liste — pas une question ouverte.
//
// Reste un `String` en base plutôt qu'un enum Prisma : les organisations qui
// ont déjà rempli le registre à la main ont des valeurs libres qu'on ne veut
// pas perdre, et `labelForLegalBasis` sait afficher l'une comme l'autre.

export type LegalBasisKey =
  | "contract"
  | "legal_obligation"
  | "consent"
  | "legitimate_interest"
  | "public_task"
  | "vital_interests";

export const LEGAL_BASES: { key: LegalBasisKey; label: string; hint: string }[] = [
  {
    key: "contract",
    label: "Exécution du contrat",
    hint: "Le traitement est nécessaire au contrat de formation ou aux démarches précontractuelles.",
  },
  {
    key: "legal_obligation",
    label: "Obligation légale",
    hint: "Un texte impose de traiter ces données — comptabilité, émargement, déclarations.",
  },
  {
    key: "consent",
    label: "Consentement",
    hint: "La personne a accepté, librement et de façon éclairée, et peut retirer son accord.",
  },
  {
    key: "legitimate_interest",
    label: "Intérêt légitime",
    hint: "Votre intérêt justifie le traitement sans porter atteinte aux droits de la personne. À documenter.",
  },
  {
    key: "public_task",
    label: "Mission d'intérêt public",
    hint: "Rare pour un organisme privé — réservé à une mission confiée par l'autorité publique.",
  },
  {
    key: "vital_interests",
    label: "Sauvegarde des intérêts vitaux",
    hint: "Situation d'urgence mettant en jeu la vie d'une personne.",
  },
];

const PAR_CLE = new Map(LEGAL_BASES.map((b) => [b.key, b]));

/**
 * Ce que l'organisme voit. Une valeur inconnue est rendue telle quelle : le
 * registre saisi à la main avant cette liste reste lisible plutôt que de
 * s'afficher vide, ce qui serait pire que du texte imparfait.
 */
export function labelForLegalBasis(value: string): string {
  return PAR_CLE.get(value as LegalBasisKey)?.label ?? value;
}

export function isKnownLegalBasis(value: string): value is LegalBasisKey {
  return PAR_CLE.has(value as LegalBasisKey);
}

// Les formulations françaises rencontrées dans les registres existants, pour
// la migration des lignes déjà saisies. Comparaison sans accents ni casse :
// « Exécution du contrat » et « execution du contrat » sont la même chose.
const SYNONYMES: Record<string, LegalBasisKey> = {
  "execution du contrat": "contract",
  "executiondu contrat": "contract",
  contrat: "contract",
  "relation contractuelle": "contract",
  "obligation legale": "legal_obligation",
  "obligations legales": "legal_obligation",
  legal: "legal_obligation",
  consentement: "consent",
  accord: "consent",
  "interet legitime": "legitimate_interest",
  "interets legitimes": "legitimate_interest",
  "mission d'interet public": "public_task",
  "interet public": "public_task",
  "interets vitaux": "vital_interests",
  "sauvegarde des interets vitaux": "vital_interests",
};

function normaliser(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Rattache une valeur libre à l'une des six bases, ou renvoie null quand
 * rien ne correspond — auquel cas on laisse la valeur d'origine intacte
 * plutôt que de deviner. Requalifier un traitement à tort est exactement ce
 * qu'un registre ne doit pas faire.
 */
export function matchLegalBasis(value: string): LegalBasisKey | null {
  const n = normaliser(value);
  if (isKnownLegalBasis(n)) return n;
  return SYNONYMES[n] ?? null;
}
