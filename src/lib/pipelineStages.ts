import { PipelineStage } from "@prisma/client";

// Source unique des libellés d'étape. Ils étaient recopiés dans quatre
// fichiers (liste CRM, tableau, sélecteur, tableau de bord) avec des
// formulations qui avaient déjà divergé (« Signée » vs « Convention
// signée », « Planifiée » vs « Session planifiée ») — module purement
// déclaratif, donc importable aussi bien côté serveur que client.
//
// Audit P1 : cinq étapes commerciales, plus aucune étape financière —
// l'argent se suit en Facturation, où chaque facture a son propre statut.
export const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Signé",
  SESSION_SCHEDULED: "En formation",
  COMPLETED: "Terminé",
};

// Ordre d'avancement, du premier contact à la clôture — utilisé pour
// afficher les étapes dans le bon sens (graphique du tableau de bord,
// filtre, sélecteur) plutôt que dans l'ordre alphabétique.
export const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.PROSPECT,
  PipelineStage.QUOTE_SENT,
  PipelineStage.CONTRACT_SIGNED,
  PipelineStage.SESSION_SCHEDULED,
  PipelineStage.COMPLETED,
];

// Toutes les étapes qui précèdent la clôture : ce qu'un encaissement peut
// faire basculer vers « Terminé » sans jamais faire reculer une affaire.
export const STAGES_BEFORE_COMPLETION: PipelineStage[] = [
  PipelineStage.PROSPECT,
  PipelineStage.QUOTE_SENT,
  PipelineStage.CONTRACT_SIGNED,
  PipelineStage.SESSION_SCHEDULED,
];
