import type { PrismaClient } from "@prisma/client";

// La liste de départ des pièces attendues d'un sous-traitant, par type.
//
// Elle vit ici, à côté de starter-templates.ts, pour la même raison : le
// seed de référence en a besoin (il tourne à chaque déploiement) et
// l'application aussi — src/lib/subcontractorRequirements.ts l'importe pour
// répondre à un organisme dont la table est encore vide, comme le fait déjà
// la bibliothèque de modèles avec STARTER_TEMPLATE_NOTICE.
//
// UNE DIFFÉRENCE DE FOND avec les modèles de documents, et c'est elle qui
// dicte la façon de semer : SubcontractorDocumentRequirement porte un
// organizationId OBLIGATOIRE. Il n'existe donc pas de ligne globale
// (organizationId: null) comme pour les indicateurs Qualiopi — chaque
// organisme a les siennes. Un upsert par organisme à chaque déploiement
// ressusciterait ce qu'un OF a délibérément retiré (« je ne demande pas de
// NDA »), ce qui est exactement l'inverse du besoin. D'où la règle de
// seedSubcontractorRequirements plus bas : on ne sème que chez un organisme
// qui n'a AUCUNE ligne, jamais chez celui qui a déjà sa propre liste.
//
// `isDefault: true` marque ce que Jalon a proposé, par opposition à ce que
// l'organisme ajoute lui-même — l'écran de réglage s'en sert pour dire
// laquelle des deux il est en train de modifier.

export type ExigenceParDefaut = {
  /** Même vocabulaire que Subcontractor.type. */
  subcontractorType: string;
  /** Une catégorie de DOCUMENT_CATEGORIES (voir src/lib/documentCategories.ts). */
  documentCategory: string;
  label: string;
  /**
   * Attendue ET exigible. Un CV est utile à la sélection d'un intervenant ;
   * une attestation de vigilance URSSAF engage la responsabilité solidaire
   * du donneur d'ordre (art. L.8222-1 du code du travail, au-delà de
   * 5 000 € HT) — l'écran ne peut pas les mettre sur le même plan.
   */
  required: boolean;
  order: number;
};

export const DEFAULT_SUBCONTRACTOR_REQUIREMENTS: ExigenceParDefaut[] = [
  // Formateur externe — le cas le plus exigeant : il anime la prestation
  // certifiée, donc l'organisme doit pouvoir prouver sa compétence
  // (indicateur 21) autant que la régularité du contrat.
  { subcontractorType: "formateur_externe", documentCategory: "subcontractor_contract", label: "Contrat de sous-traitance signé", required: true, order: 1 },
  { subcontractorType: "formateur_externe", documentCategory: "diploma", label: "Justificatif de qualification (diplôme, certification)", required: true, order: 2 },
  { subcontractorType: "formateur_externe", documentCategory: "rc_pro", label: "Attestation de responsabilité civile professionnelle", required: true, order: 3 },
  { subcontractorType: "formateur_externe", documentCategory: "urssaf_vigilance", label: "Attestation de vigilance URSSAF", required: true, order: 4 },
  { subcontractorType: "formateur_externe", documentCategory: "rnq_engagement", label: "Engagement de conformité au référentiel qualité", required: true, order: 5 },
  { subcontractorType: "formateur_externe", documentCategory: "nda", label: "Engagement de confidentialité", required: true, order: 6 },
  { subcontractorType: "formateur_externe", documentCategory: "cv", label: "CV à jour", required: false, order: 7 },
  { subcontractorType: "formateur_externe", documentCategory: "competence_questionnaire", label: "Questionnaire de compétence à l'entrée", required: false, order: 8 },

  // Sous-traitant pédagogique : il se substitue à l'organisme sur le champ
  // du référentiel, d'où l'engagement de conformité (indicateur 27).
  { subcontractorType: "sous_traitant_pedagogique", documentCategory: "subcontractor_contract", label: "Contrat de sous-traitance signé", required: true, order: 1 },
  { subcontractorType: "sous_traitant_pedagogique", documentCategory: "rnq_engagement", label: "Engagement de conformité au référentiel qualité", required: true, order: 2 },
  { subcontractorType: "sous_traitant_pedagogique", documentCategory: "rc_pro", label: "Attestation de responsabilité civile professionnelle", required: true, order: 3 },
  { subcontractorType: "sous_traitant_pedagogique", documentCategory: "urssaf_vigilance", label: "Attestation de vigilance URSSAF", required: true, order: 4 },
  { subcontractorType: "sous_traitant_pedagogique", documentCategory: "competence_questionnaire", label: "Questionnaire de compétence à l'entrée", required: false, order: 5 },

  // Prestataire technique : aucune responsabilité pédagogique, donc rien
  // sur les compétences d'intervenant — mais la même exigence sociale.
  { subcontractorType: "prestataire_technique", documentCategory: "subcontractor_contract", label: "Contrat de prestation signé", required: true, order: 1 },
  { subcontractorType: "prestataire_technique", documentCategory: "rc_pro", label: "Attestation de responsabilité civile professionnelle", required: true, order: 2 },
  { subcontractorType: "prestataire_technique", documentCategory: "urssaf_vigilance", label: "Attestation de vigilance URSSAF", required: true, order: 3 },

  { subcontractorType: "autre", documentCategory: "subcontractor_contract", label: "Contrat signé", required: true, order: 1 },
];

/**
 * Pose la liste de départ chez les organismes qui n'en ont aucune.
 *
 * Idempotent par construction et non destructif : un organisme qui a déjà
 * une ligne — donc qui a soit reçu ce seed, soit défini sa propre liste —
 * est entièrement ignoré. Sans ce filtre, chaque déploiement remettrait les
 * pièces que l'OF a retirées.
 *
 * Seul angle mort assumé : un organisme qui supprimerait ses exigences
 * jusqu'à la dernière retrouverait la liste par défaut au déploiement
 * suivant. « Aucune pièce attendue nulle part » se lit comme « pas encore
 * configuré », pas comme un choix — et le schéma n'offre aucun endroit où
 * enregistrer la différence entre les deux.
 */
export async function seedSubcontractorRequirements(prisma: PrismaClient): Promise<number> {
  // Un seul aller-retour pour savoir qui est déjà servi, plutôt qu'un
  // count() par organisme : la liste des organismes déjà pourvus tient en
  // mémoire quel que soit le nombre de clients.
  const [organizations, dejaServis] = await Promise.all([
    prisma.organization.findMany({ select: { id: true } }),
    prisma.subcontractorDocumentRequirement.findMany({
      select: { organizationId: true },
      distinct: ["organizationId"],
    }),
  ]);
  const servis = new Set(dejaServis.map((r) => r.organizationId));

  let poses = 0;
  for (const org of organizations) {
    if (servis.has(org.id)) continue;
    await prisma.subcontractorDocumentRequirement.createMany({
      data: DEFAULT_SUBCONTRACTOR_REQUIREMENTS.map((e) => ({ ...e, organizationId: org.id, isDefault: true })),
      // Filet de sécurité contre deux déploiements simultanés : la clé
      // unique (organisme, type, catégorie) rendrait le second fatal.
      skipDuplicates: true,
    });
    poses += 1;
  }
  return poses;
}
