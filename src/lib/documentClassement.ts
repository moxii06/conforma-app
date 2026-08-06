// Retrouver un document quand il y en a des milliers.
//
// L'espace Documents range déjà les documents par ÉTAPE DE VIE (brouillon,
// finalisé, envoyé, signé) : c'est la question « où en est-il ». Mais un
// organisme qui a trois ans d'activité derrière lui pose une autre question,
// « lequel » — et une liste chronologique à plat de 2 000 envois n'y répond
// pas. Ce fichier ajoute le second axe : par quoi on classe, et par quoi on
// filtre, à l'intérieur d'un onglet.
//
// Tout est calculé sur des LOTS et non sur des documents : c'est l'unité
// affichée dans la liste, et compter en documents donnerait des chiffres qui
// ne correspondent à rien de visible (« Sécurité au travail (24) » en face de
// trois lignes).
//
// Rien ici ne touche à la base : la page charge déjà les colonnes scalaires
// de la totalité des documents correspondant à la recherche — c'est ce qui
// rend les compteurs d'onglets exacts. Classer et filtrer se fait donc sur
// cet ensemble déjà en mémoire, sans requête supplémentaire, et les comptes
// affichés dans les menus sont eux aussi exacts plutôt qu'estimés.

export const AXES_CLASSEMENT = ["date", "formation", "type"] as const;
export type AxeClassement = (typeof AXES_CLASSEMENT)[number];

export const AXE_LABELS: Record<AxeClassement, string> = {
  date: "Date",
  formation: "Formation",
  type: "Type de document",
};

/** L'axe demandé, ou « date » — jamais une erreur sur un paramètre d'URL. */
export function axeClassement(valeur: string | null | undefined): AxeClassement {
  return (AXES_CLASSEMENT as readonly string[]).includes(valeur ?? "") ? (valeur as AxeClassement) : "date";
}

/** Ce qu'il faut savoir d'un lot pour le classer. Volontairement minimal. */
export type LotClassable = {
  key: string;
  createdAt: Date;
  /** Null pour un document de prospect ou de sous-traitant : ils existent. */
  courseId: string | null;
  formation: string | null;
  category: string;
  typeLabel: string;
};

/** La valeur qui désigne « les documents rattachés à aucune formation ». */
export const HORS_FORMATION = "aucune";
export const HORS_FORMATION_LABEL = "Hors formation";

export type Section<T> = { key: string; label: string | null; lots: T[] };
export type OptionFiltre = { value: string; label: string; count: number };

export type Filtres = { formation?: string; category?: string; annee?: string };

export function anneeDuLot(lot: LotClassable): string {
  return String(lot.createdAt.getFullYear());
}

export function formationDuLot(lot: LotClassable): string {
  return lot.courseId ?? HORS_FORMATION;
}

/**
 * Les trois filtres se cumulent (ET), et un filtre vide ne filtre rien.
 *
 * Le cumul est le comportement attendu — « les attestations de Sécurité au
 * travail en 2025 » est une question courante — et c'est aussi ce qui rend
 * les menus utilisables : chacun réduit ce que les autres ont laissé.
 */
export function correspondAuxFiltres(lot: LotClassable, f: Filtres): boolean {
  if (f.formation && formationDuLot(lot) !== f.formation) return false;
  if (f.category && lot.category !== f.category) return false;
  if (f.annee && anneeDuLot(lot) !== f.annee) return false;
  return true;
}

// Comparaison de titres saisis par l'utilisateur : « Électricité » doit se
// ranger à la lettre E et non après Z, ce que fait localeCompare et pas <.
const parTitre = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" });
const plusRecentDAbord = (a: LotClassable, b: LotClassable) =>
  b.createdAt.getTime() - a.createdAt.getTime() || a.key.localeCompare(b.key);

/**
 * L'ordre d'affichage global, avant pagination.
 *
 * Le tri porte sur la TOTALITÉ des lots de l'onglet et non sur la page
 * affichée : sans ça, classer par formation ne ferait que réordonner
 * vingt-cinq lignes déjà tirées par date, et la formation cherchée resterait
 * dispersée sur quarante pages.
 */
export function ordonnerLots<T extends LotClassable>(lots: T[], axe: AxeClassement): T[] {
  const copie = [...lots];
  if (axe === "formation") {
    // Les documents hors formation en dernier : ils sont l'exception, et les
    // mettre en tête ferait ouvrir la liste sur ce qu'on cherche le moins.
    return copie.sort(
      (a, b) =>
        Number(a.courseId === null) - Number(b.courseId === null) ||
        parTitre(a.formation ?? "", b.formation ?? "") ||
        plusRecentDAbord(a, b)
    );
  }
  if (axe === "type") {
    return copie.sort((a, b) => parTitre(a.typeLabel, b.typeLabel) || plusRecentDAbord(a, b));
  }
  return copie.sort(plusRecentDAbord);
}

const moisEtAnnee = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function libelleMois(d: Date): string {
  const brut = moisEtAnnee.format(d); // « août 2026 »
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function sectionDuLot(lot: LotClassable, axe: AxeClassement): { key: string; label: string } {
  if (axe === "formation") {
    return { key: formationDuLot(lot), label: lot.formation ?? HORS_FORMATION_LABEL };
  }
  if (axe === "type") return { key: lot.category, label: lot.typeLabel };
  // Par mois plutôt que par jour : un intertitre par jour redonnerait la
  // liste à plat qu'on cherchait à structurer.
  return {
    key: `${lot.createdAt.getFullYear()}-${String(lot.createdAt.getMonth() + 1).padStart(2, "0")}`,
    label: libelleMois(lot.createdAt),
  };
}

/**
 * Découpe une liste DÉJÀ ORDONNÉE en sections consécutives.
 *
 * S'applique à la page affichée, pas à l'ensemble : une section qui déborde
 * sur la page suivante y réaffiche simplement son intertitre, ce qui est le
 * comportement attendu d'une liste paginée.
 */
export function decouperEnSections<T extends LotClassable>(lots: T[], axe: AxeClassement): Section<T>[] {
  const sections: Section<T>[] = [];
  for (const lot of lots) {
    const { key, label } = sectionDuLot(lot, axe);
    const derniere = sections[sections.length - 1];
    if (derniere && derniere.key === key) derniere.lots.push(lot);
    else sections.push({ key, label, lots: [lot] });
  }
  return sections;
}

/** Regroupe et compte, en gardant un libellé stable par valeur. */
function compter(
  lots: LotClassable[],
  valeur: (l: LotClassable) => string,
  libelle: (l: LotClassable) => string
): Map<string, OptionFiltre> {
  const parValeur = new Map<string, OptionFiltre>();
  for (const lot of lots) {
    const v = valeur(lot);
    const existante = parValeur.get(v);
    if (existante) existante.count += 1;
    else parValeur.set(v, { value: v, label: libelle(lot), count: 1 });
  }
  return parValeur;
}

/**
 * Les formations qui ont réellement des documents dans cet onglet.
 *
 * Lister le catalogue entier remplirait le menu de formations pour
 * lesquelles il n'y a rien à trouver — et chez un organisme qui a deux cents
 * formations au catalogue, le menu deviendrait le problème plutôt que la
 * solution.
 */
export function optionsFormation(lots: LotClassable[]): OptionFiltre[] {
  const options = [...compter(lots, formationDuLot, (l) => l.formation ?? HORS_FORMATION_LABEL).values()];
  return options.sort(
    (a, b) =>
      Number(a.value === HORS_FORMATION) - Number(b.value === HORS_FORMATION) || parTitre(a.label, b.label)
  );
}

export function optionsType(lots: LotClassable[]): OptionFiltre[] {
  return [...compter(lots, (l) => l.category, (l) => l.typeLabel).values()].sort((a, b) =>
    parTitre(a.label, b.label)
  );
}

/** Les années les plus récentes d'abord : c'est là que se trouve le travail. */
export function optionsAnnee(lots: LotClassable[]): OptionFiltre[] {
  return [...compter(lots, anneeDuLot, anneeDuLot).values()].sort((a, b) => b.value.localeCompare(a.value));
}
