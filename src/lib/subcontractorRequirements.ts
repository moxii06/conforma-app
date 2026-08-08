import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SUBCONTRACTOR_REQUIREMENTS,
  type ExigenceParDefaut,
} from "@/../prisma/lib/subcontractor-requirements";

// Ce qui est ATTENDU d'un sous-traitant, et ce qui est fourni.
//
// L'état ne se stocke nulle part : il se recalcule en regardant les Document
// rattachés au sous-traitant dont la catégorie correspond. Une colonne
// « fourni » aurait divergé dès la première suppression de document —
// exactement le même raisonnement que dashboardTasks.ts, qui recalcule sa
// liste à chaque affichage plutôt que d'entretenir des lignes de tâches.

export type ExigencePiece = {
  /**
   * L'identifiant en base, ou null quand la ligne vient encore de la liste
   * par défaut du code (organisme jamais servi par le seed, typiquement
   * inscrit depuis le dernier déploiement). L'écran de réglage n'a pas
   * besoin de le savoir : les routes travaillent sur la clé naturelle
   * (type + catégorie), pas sur l'id.
   */
  id: string | null;
  subcontractorType: string;
  documentCategory: string;
  label: string;
  required: boolean;
  isDefault: boolean;
  order: number;
};

function depuisDefauts(defauts: ExigenceParDefaut[]): ExigencePiece[] {
  return defauts.map((e) => ({ ...e, id: null, isDefault: true }));
}

/**
 * Les exigences d'un organisme, tous types confondus.
 *
 * Repli sur la liste du code quand l'organisme n'a AUCUNE ligne : le seed
 * de référence ne tourne qu'au déploiement, donc un organisme inscrit
 * entre-temps verrait sinon une checklist vide — c'est-à-dire un écran qui
 * affirme que rien n'est attendu, ce qui est faux. Le repli disparaît dès
 * que l'organisme touche à sa liste (voir materialiserExigences).
 */
export async function chargerExigences(organizationId: string): Promise<ExigencePiece[]> {
  const lignes = await prisma.subcontractorDocumentRequirement.findMany({
    where: { organizationId },
    orderBy: [{ subcontractorType: "asc" }, { order: "asc" }],
  });
  if (lignes.length === 0) return depuisDefauts(DEFAULT_SUBCONTRACTOR_REQUIREMENTS);
  return lignes.map((l) => ({
    id: l.id,
    subcontractorType: l.subcontractorType,
    documentCategory: l.documentCategory,
    label: l.label,
    required: l.required,
    isDefault: l.isDefault,
    order: l.order,
  }));
}

/** Les exigences d'un type donné, dans l'ordre d'affichage. */
export function exigencesDuType(exigences: ExigencePiece[], subcontractorType: string): ExigencePiece[] {
  return exigences.filter((e) => e.subcontractorType === subcontractorType).sort((a, b) => a.order - b.order);
}

/**
 * Écrit en base la liste par défaut, si et seulement si l'organisme n'a
 * encore rien.
 *
 * Appelée avant toute modification depuis l'écran de réglage : sans elle,
 * retirer une pièce d'une liste purement virtuelle n'aurait rien à
 * supprimer, et la ligne serait revenue au rechargement.
 */
export async function materialiserExigences(organizationId: string): Promise<void> {
  const existantes = await prisma.subcontractorDocumentRequirement.count({ where: { organizationId } });
  if (existantes > 0) return;
  await prisma.subcontractorDocumentRequirement.createMany({
    data: DEFAULT_SUBCONTRACTOR_REQUIREMENTS.map((e) => ({ ...e, organizationId, isDefault: true })),
    skipDuplicates: true,
  });
}

/** Le minimum qu'un document doit porter pour qu'on sache s'il compte. */
export type DocumentPourChecklist = {
  id: string;
  title: string;
  category: string;
  status: string;
  archivedAt: Date | null;
  createdAt: Date;
};

export type LigneChecklist = {
  documentCategory: string;
  label: string;
  required: boolean;
  /** Le document qui satisfait l'exigence, ou null. */
  fourni: { id: string; title: string; createdAt: Date } | null;
  /**
   * Un brouillon existe dans cette catégorie mais rien de finalisé — le cas
   * du questionnaire de compétence envoyé à l'intervenant et pas encore
   * rempli. Ni fourni ni tout à fait manquant : personne n'a rien à
   * réclamer, il faut attendre.
   */
  enAttente: boolean;
};

/**
 * Croise ce qui est attendu avec ce qui est là.
 *
 * Un document ARCHIVÉ ne compte pas : l'archivage sert précisément à sortir
 * du jeu une pièce périmée tout en la gardant pour l'audit (voir la fiche
 * sous-traitant). Un BROUILLON non plus — il n'a pas encore de contenu.
 * Fonction pure, donc testable et utilisable aussi bien par la fiche que
 * par le tableau de suivi.
 */
export function construireChecklist(
  exigences: ExigencePiece[],
  documents: DocumentPourChecklist[],
): LigneChecklist[] {
  return exigences.map((e) => {
    const memeCategorie = documents.filter((d) => d.category === e.documentCategory && d.archivedAt === null);
    const fournis = memeCategorie
      .filter((d) => d.status !== "draft")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const fourni = fournis[0] ?? null;
    return {
      documentCategory: e.documentCategory,
      label: e.label,
      required: e.required,
      fourni: fourni ? { id: fourni.id, title: fourni.title, createdAt: fourni.createdAt } : null,
      enAttente: fourni === null && memeCategorie.some((d) => d.status === "draft"),
    };
  });
}

/** Les libellés qui manquent, pour la colonne « Pièces manquantes ». */
export function piecesManquantes(lignes: LigneChecklist[]): string[] {
  return lignes.filter((l) => !l.fourni).map((l) => l.label);
}
