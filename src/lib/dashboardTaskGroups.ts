import type { DashboardTask } from "@/lib/dashboardTasks";

/**
 * Regroupement du widget « à faire » par type de tâche.
 *
 * Audit S7. Le widget affichait une ligne par dossier. À 224 tâches, il
 * était illisible — alors que ce n'est pas 224 décisions, mais environ six
 * décisions répétées quarante fois. « Relancer 47 conventions non signées »
 * est une décision ; l'écrire en 47 lignes qu'il faut lire une par une
 * transforme une minute de travail en une demi-heure de défilement.
 *
 * D'où : au-delà d'un seuil, une famille devient UNE ligne avec son
 * décompte et un lien vers l'écran qui sait déjà la traiter. En dessous,
 * les lignes nominatives restent — « Marie Dupont, convention non signée »
 * est plus actionnable que « 3 conventions non signées », et à trois
 * lignes il n'y a rien à condenser.
 */

// En dessous, on garde le détail nominatif. Au-dessus, on résume.
// Quatre : c'est déjà ce que le widget affichait par thème avant de
// replier le reste, donc le seuil ne change pas ce qu'on voit d'un coup
// d'œil — il change ce qui se cache derrière.
export const SEUIL_REGROUPEMENT = 5;

/**
 * Libellé collectif d'une famille, au pluriel, sans le décompte (l'appelant
 * l'ajoute). Volontairement plus court que le libellé individuel : celui-ci
 * porte un nom, une référence, un montant — informations qui n'ont plus de
 * sens une fois quarante lignes fusionnées.
 */
const LIBELLES_COLLECTIFS: Record<DashboardTask["kind"], string> = {
  needs_assessment: "tests de positionnement sans réponse",
  contract: "conventions en attente",
  mediator_missing: "adhésion médiateur à souscrire",
  platform_access: "accès plateforme à envoyer",
  platform_access_after_payment: "accès plateforme à envoyer (paiement reçu)",
  convocation: "convocations à envoyer",
  invoice_overdue: "factures en retard",
  rgpd_suggestion: "emails à confirmer comme demandes RGPD",
  rgpd_deadline: "demandes RGPD à traiter",
  rgpd_request_assigned: "demandes RGPD qui vous sont assignées",
  support_request_assigned: "réclamations et signalements qui vous sont adressés",
  session_draft: "sessions à valider",
  subcontractor_expiry: "échéances de sous-traitants",
  subcontractor_renewal_notice: "contrats à dénoncer avant reconduction",
  dossier_prep_needs_assessment: "recueils des besoins manquants",
  dossier_prep_contract: "conventions non signées",
  rolling_deadline_warning: "accès e-learning bientôt expirés",
  rolling_deadline_overdue: "accès e-learning expirés",
  satisfaction_not_collected: "avis de satisfaction non recueillis",
  learner_inactive: "apprenants sans activité",
  certificate_to_send: "attestations à envoyer",
  bank_transaction_pending: "transactions bancaires à valider",
  funding_no_reply: "financeurs sans réponse",
  funding_agreement_expiring: "accords de prise en charge à échéance",
  qualiopi_certificate_expiring: "attestations arrivant à expiration",
  qualiopi_audit_upcoming: "audits Qualiopi à préparer",
  qualiopi_finding_open: "non-conformités sans action corrective",
  intervenant_evaluation_due: "évaluations d'intervenants à réaliser",
  session_uninvoiced: "sessions terminées non facturées",
  email_assigned: "emails qui vous sont assignés",
};

/**
 * Écran capable de traiter TOUTE la famille, quand il existe.
 *
 * C'est le cœur du gain : ces destinations sont déjà construites, déjà
 * paginées, déjà cherchables. Le tableau de bord n'a pas à réimplémenter
 * une liste — il a à savoir où envoyer.
 *
 * `null` = pas d'écran filtré correspondant. On ne fabrique PAS un lien
 * vers une page non filtrée : déposer quelqu'un sur `/dossiers` complet en
 * lui disant « c'est quelque part là-dedans » est pire que de déplier la
 * liste sur place. Ces familles gardent donc leur détail dépliable.
 */
const DESTINATIONS_COLLECTIVES: Record<DashboardTask["kind"], string | null> = {
  // Les trois filtres de /dossiers correspondent exactement à ces familles
  // (voir DossierStatusFilter) — l'écran a recherche, pagination et
  // regroupement par apprenant.
  dossier_prep_contract: "/dossiers?status=contract_missing",
  contract: "/dossiers?status=contract_missing",
  // Null : il n'y en a jamais qu'une, elle se lit et se traite sur place.
  mediator_missing: null,
  dossier_prep_needs_assessment: "/dossiers?status=needs_assessment_missing",
  needs_assessment: "/dossiers?status=needs_assessment_missing",
  convocation: "/dossiers?status=convocation_missing",

  invoice_overdue: "/facturation?tab=factures&status=OVERDUE",
  bank_transaction_pending: "/facturation?tab=a-valider",
  funding_no_reply: "/facturation?tab=prises-en-charge",
  funding_agreement_expiring: "/facturation?tab=prises-en-charge",

  rgpd_suggestion: "/inbox",
  rgpd_deadline: "/rgpd?tab=droits",
  rgpd_request_assigned: "/rgpd?tab=droits",
  email_assigned: "/inbox",
  // Le tableau de suivi porte exactement cette famille : sujet, responsable,
  // échéance, urgence, statut — cherchable et paginé.
  support_request_assigned: "/support?tab=suivi",

  subcontractor_expiry: "/team",
  // L'onglet prestataires porte la date de dénonciation à côté de chaque
  // fin de contrat : c'est bien l'écran qui traite toute la famille.
  subcontractor_renewal_notice: "/team?tab=prestataires",
  intervenant_evaluation_due: "/team?tab=evaluations",
  qualiopi_audit_upcoming: "/qualiopi?tab=preparation-audit",
  qualiopi_finding_open: "/qualiopi?tab=audits",

  // Pas de filtre dédié : ces familles restent dépliables sur place.
  platform_access: null,
  platform_access_after_payment: null,
  session_draft: null,
  rolling_deadline_warning: null,
  rolling_deadline_overdue: null,
  satisfaction_not_collected: null,
  learner_inactive: null,
  certificate_to_send: null,
  qualiopi_certificate_expiring: null,
  session_uninvoiced: null,
};

export type TaskGroup = {
  kind: DashboardTask["kind"];
  items: DashboardTask[];
  /** Vrai si la famille est assez nombreuse pour être résumée. */
  resume: boolean;
  /** Libellé pluriel, sans décompte. */
  libelle: string;
  /** Écran traitant toute la famille, si un existe. */
  href: string | null;
  overdue: number;
  /**
   * La requête de cette famille a été coupée au plafond : `items.length`
   * n'est pas un total. La ligne l'écrit (« 100+ »), sans quoi un nombre
   * plafonné se lirait comme exact.
   */
  tronquee: boolean;
};

/**
 * Regroupe par type en conservant l'ordre d'arrivée — les tâches sont déjà
 * triées (en retard d'abord, puis échéance la plus proche), donc la
 * première tâche d'un groupe est la plus urgente, et l'ordre des groupes
 * suit l'urgence de leur tête de file.
 */
export function groupTasksByKind(
  tasks: DashboardTask[],
  /** Les familles plafonnées, telles que getDashboardTasks les remonte. */
  kindsTronques: readonly DashboardTask["kind"][] = [],
): TaskGroup[] {
  const parKind = new Map<DashboardTask["kind"], DashboardTask[]>();
  for (const t of tasks) {
    const existant = parKind.get(t.kind);
    if (existant) existant.push(t);
    else parKind.set(t.kind, [t]);
  }

  const tronques = new Set(kindsTronques);
  return Array.from(parKind.entries()).map(([kind, items]) => ({
    kind,
    items,
    resume: items.length >= SEUIL_REGROUPEMENT,
    libelle: LIBELLES_COLLECTIFS[kind],
    href: DESTINATIONS_COLLECTIVES[kind],
    overdue: items.filter((t) => t.overdue).length,
    tronquee: tronques.has(kind),
  }));
}
