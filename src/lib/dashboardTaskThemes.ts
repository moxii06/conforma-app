// Dans quelle pile une tâche tombe.
//
// Une liste plate de vingt-quatre lignes triées par date se lit comme un mur
// indifférencié : le dirigeant n'y distingue pas « ça me coûte de l'argent
// aujourd'hui » de « c'est de la paperasse pour un audit dans trois mois »,
// qui est exactement la distinction dont il se sert pour décider quoi faire
// des vingt minutes qu'il a.
//
// L'ordre compte : l'argent d'abord, parce que c'est la pile dont
// l'échéance est tenue par quelqu'un d'autre.
//
// Ce fichier était une constante locale de la page. Il en sort pour deux
// raisons.
//
// D'abord le filtre par pile, qui a besoin des mêmes libellés que les
// intertitres. Ensuite et surtout : CETTE TABLE EST DÉSORMAIS LE
// VOCABULAIRE. `DashboardTask["kind"]` s'en déduit, si bien qu'un type de
// tâche nouveau ne compile pas tant qu'il n'a pas été rangé dans une pile.
// Auparavant la table listait les types connus et `themeOf` retombait en
// silence sur « Dossiers à compléter » : une famille nouvelle atterrissait
// dans la mauvaise pile sans que rien ne le signale, et une tâche d'argent
// pouvait se retrouver rangée avec la paperasse. Même piège que la portée
// des documents, où deux bilans sont partis en un exemplaire pour toute une
// promotion — un défaut silencieux ne se voit jamais.
//
// Ce fichier ne dépend de rien : ni de Prisma, ni de dashboardTasks. C'est
// ce qui permet de le tester, et c'est aussi le sens de la dépendance —
// c'est le calcul des tâches qui suit le vocabulaire, pas l'inverse.

export const TASK_THEMES = [
  {
    key: "argent",
    label: "Argent",
    kinds: [
      "invoice_overdue",
      "session_uninvoiced",
      "bank_transaction_pending",
      "funding_no_reply",
      "funding_agreement_expiring",
    ],
  },
  {
    key: "conformite",
    label: "Conformité",
    kinds: [
      "qualiopi_certificate_expiring",
      "qualiopi_audit_upcoming",
      "qualiopi_finding_open",
      "rgpd_suggestion",
      "rgpd_deadline",
      "rgpd_request_assigned",
      // Réclamations et signalements confidentiels adressés à quelqu'un —
      // rangés en conformité, pas en « dossiers à compléter » : c'est
      // l'indicateur Qualiopi 31 d'un côté, le canal de signalement de
      // l'autre, et les deux ont une échéance qu'un tiers surveille.
      "support_request_assigned",
      "subcontractor_expiry",
      "subcontractor_renewal_notice",
      "intervenant_evaluation_due",
      "mediator_missing",
    ],
  },
  {
    key: "pedagogie",
    label: "Sessions et apprenants",
    kinds: [
      "session_draft",
      "convocation",
      "learner_inactive",
      "rolling_deadline_warning",
      "rolling_deadline_overdue",
      "certificate_to_send",
      "satisfaction_not_collected",
    ],
  },
  {
    key: "admin",
    label: "Dossiers à compléter",
    kinds: [
      "needs_assessment",
      "contract",
      "platform_access",
      "platform_access_after_payment",
      "dossier_prep_needs_assessment",
      "dossier_prep_contract",
      "email_assigned",
    ],
  },
] as const satisfies readonly { key: string; label: string; kinds: readonly string[] }[];

export type ThemeKey = (typeof TASK_THEMES)[number]["key"];

/** Le vocabulaire des tâches, déduit des piles — voir l'en-tête du fichier. */
export type DashboardTaskKind = (typeof TASK_THEMES)[number]["kinds"][number];

export function themeOf(kind: DashboardTaskKind): ThemeKey {
  return (TASK_THEMES.find((t) => (t.kinds as readonly string[]).includes(kind))?.key ?? "admin") as ThemeKey;
}

/**
 * Les familles dont l'`id` de tâche N'EST PAS celui d'un enregistrement.
 *
 * Ces quatre-là produisent une ligne agrégée dont l'identifiant est une
 * constante (« pending », « qualiopi-certificate », « qualiopi-next-audit »,
 * « mediation ») : il n'y a jamais qu'une telle ligne par organisme, et son
 * contenu se recalcule à chaque affichage.
 *
 * Conséquence, et c'est tout l'enjeu : le rejet d'une tâche s'enregistre en
 * couple (kind, entityId) à la portée de l'ORGANISME
 * (DashboardTaskDismissal), sans aucun écran pour le défaire. Sur un id
 * constant, « ignorer cette ligne » signifie donc en réalité « éteindre
 * définitivement cette alerte pour tout le monde » — ce que la croix ne
 * promet pas (« ne réapparaîtra plus dans À faire » se lit comme « cette
 * ligne-ci ») et que personne ne veut : un clic sur les 3 transactions
 * bancaires du jour faisait taire les 200 du relevé suivant.
 *
 * Aucune de ces alertes n'a besoin de la croix, parce que chacune s'éteint
 * par son propre écran : valider les transactions sur /facturation, mettre à
 * jour la date de certificat ou d'audit sur /qualiopi, renseigner un
 * médiateur — ou le reporter de 30 jours, ce que /profil sait déjà faire
 * (REPORT_MEDIATION_JOURS).
 */
export const KINDS_AGREGES: readonly DashboardTaskKind[] = [
  "bank_transaction_pending",
  "qualiopi_certificate_expiring",
  "qualiopi_audit_upcoming",
  "mediator_missing",
];

/** Une tâche peut-elle être rejetée à la croix ? Voir KINDS_AGREGES. */
export function tacheRejetable(kind: DashboardTaskKind): boolean {
  return !KINDS_AGREGES.includes(kind);
}

/** La pile demandée par l'URL, ou null pour « tout ». Jamais une erreur. */
export function themeDemande(valeur: string | null | undefined): ThemeKey | null {
  const trouve = TASK_THEMES.find((t) => t.key === valeur);
  return trouve ? trouve.key : null;
}

export function libelleTheme(key: ThemeKey): string {
  return TASK_THEMES.find((t) => t.key === key)!.label;
}

/** Tous les types de tâches, dans l'ordre des piles. */
export const KINDS_CLASSES: string[] = TASK_THEMES.flatMap((t) => [...t.kinds]);
