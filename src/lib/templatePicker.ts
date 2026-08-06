// Comment un sélecteur d'envoi présente les modèles disponibles.
//
// Le problème qu'il résout : « Adapter ce modèle » crée une copie qui garde
// le titre de l'original (voir api/documents/templates/[id]/fork). La
// bibliothèque sait les distinguer — elle range l'original sous « Modèles
// Jalon » avec la mention « Déjà adapté », et la copie sous « Documents
// généraux ». Les boîtes de dialogue d'envoi, elles, listaient tout à plat
// par titre : deux lignes rigoureusement identiques, sans moyen de savoir
// laquelle partait. Un OFP qui adapte un modèle de démarrage — le parcours
// que l'application lui recommande — tombe donc systématiquement dessus.
//
// Le choix retenu est de rendre la distinction lisible, pas de retirer une
// des deux lignes : l'original Jalon reste envoyable (on peut vouloir la
// version non modifiée pour un client donné), il est simplement rangé
// ailleurs et signalé comme déjà adapté.
//
// Le titre n'est délibérément pas suffixé à la création de la copie :
// l'organisme peut la renommer ensuite, et un suffixe posé une fois pour
// toutes deviendrait faux ou ferait doublon avec son propre libellé.

export type ModeleChoisissable = {
  id: string;
  title: string;
  category: string;
  // null = modèle de démarrage fourni par Jalon, commun à tous les
  // organismes. Non null = modèle appartenant à cet organisme.
  organizationId: string | null;
  // Renseigné quand ce modèle est la copie adaptée d'un modèle Jalon.
  forkedFromId: string | null;
};

export type CleGroupe = "organisation" | "jalon";

export const LIBELLE_GROUPE: Record<CleGroupe, string> = {
  organisation: "Mes modèles",
  jalon: "Modèles Jalon",
};

export const MENTION_DEJA_ADAPTE = "déjà adapté";

export type EntreeModele<T> = {
  modele: T;
  // Vrai uniquement pour un modèle Jalon dont cet organisme possède déjà
  // une copie adaptée — donc pour la ligne qui, sans mention, serait le
  // sosie de celle rangée dans « Mes modèles ».
  dejaAdapte: boolean;
};

export type GroupeModeles<T> = {
  cle: CleGroupe;
  label: string;
  entrees: EntreeModele<T>[];
};

/**
 * Range les modèles en deux groupes, ceux de l'organisme d'abord.
 *
 * Les doublons d'identifiant sont écartés : les boîtes de dialogue
 * concatènent la liste rendue par le serveur et celle des modèles choisis
 * dans le panneau bibliothèque, qui peuvent se recouvrir. Le premier vu
 * gagne, ce qui préserve l'ordre alphabétique de la requête serveur.
 *
 * Un groupe vide n'est pas retourné — un organisme qui n'a adapté aucun
 * modèle ne doit pas voir un intertitre « Mes modèles » suivi de rien.
 */
export function grouperModeles<T extends ModeleChoisissable>(modeles: T[]): GroupeModeles<T>[] {
  const vus = new Set<string>();
  const uniques: T[] = [];
  for (const m of modeles) {
    if (vus.has(m.id)) continue;
    vus.add(m.id);
    uniques.push(m);
  }

  // Les originaux dont cet organisme détient une copie. Calculé sur la
  // liste dédoublonnée, donc sur ce qui est réellement proposé.
  const adaptes = new Set(
    uniques.flatMap((m) => (m.organizationId !== null && m.forkedFromId ? [m.forkedFromId] : [])),
  );

  const groupes: GroupeModeles<T>[] = [
    {
      cle: "organisation",
      label: LIBELLE_GROUPE.organisation,
      entrees: uniques
        .filter((m) => m.organizationId !== null)
        .map((modele) => ({ modele, dejaAdapte: false })),
    },
    {
      cle: "jalon",
      label: LIBELLE_GROUPE.jalon,
      entrees: uniques
        .filter((m) => m.organizationId === null)
        .map((modele) => ({ modele, dejaAdapte: adaptes.has(modele.id) })),
    },
  ];

  return groupes.filter((g) => g.entrees.length > 0);
}

/**
 * Le libellé d'une ligne du sélecteur.
 *
 * `libelleCategorie` est passé par l'appelant plutôt qu'importé : le
 * dictionnaire des catégories vit côté composants, et ce module doit rester
 * sans dépendance pour être testable seul.
 */
export function libelleEntree<T extends ModeleChoisissable>(
  entree: EntreeModele<T>,
  libelleCategorie: string,
): string {
  const base = `${libelleCategorie} — ${entree.modele.title}`;
  return entree.dejaAdapte ? `${base} (${MENTION_DEJA_ADAPTE})` : base;
}
