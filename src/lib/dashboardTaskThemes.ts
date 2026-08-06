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
      "subcontractor_expiry",
      "intervenant_evaluation_due",
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
