// Single source of truth for automation-rule trigger kinds and mail-merge
// tags, so the create form, the dashboard task integration, and the cron
// sender all agree on the same values/labels without duplicating strings.
// No server-only imports here (no prisma) so client components can use it
// directly.
export const AUTOMATION_TRIGGER_VALUES = [
  "needs_assessment_incomplete",
  "contract_not_signed",
  "convocation_missing",
  "rolling_duration_expiring",
  "satisfaction_not_collected",
] as const;

export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  needs_assessment_incomplete: "Recueil des besoins non complété",
  contract_not_signed: "Convention non signée",
  convocation_missing: "Convocation non envoyée avant la session",
  rolling_duration_expiring: "Durée d'accès bientôt expirée (formation en continu)",
  satisfaction_not_collected: "Avis de satisfaction non recueilli",
};

// Client feedback: staff should be able to write the reminder email once,
// with clickable tags that insert at the cursor, rather than typing the
// learner's name by hand each time — filled in per learner when the rule
// actually fires (cron or dashboard task), never re-opened per send.
export const MERGE_TAGS: { tag: string; label: string }[] = [
  { tag: "[Prénom]", label: "Prénom" },
  { tag: "[Nom]", label: "Nom" },
  { tag: "[Formation]", label: "Formation" },
  { tag: "[Date de session]", label: "Date de session" },
  { tag: "[Organisme]", label: "Organisme" },
];

export type MergeTagContext = {
  firstName: string;
  lastName: string;
  courseTitle: string;
  sessionDateLabel: string;
  organizationName: string;
};

export function fillMergeTags(template: string, ctx: MergeTagContext) {
  return template
    .split("[Prénom]").join(ctx.firstName)
    .split("[Nom]").join(ctx.lastName)
    .split("[Formation]").join(ctx.courseTitle)
    .split("[Date de session]").join(ctx.sessionDateLabel)
    .split("[Organisme]").join(ctx.organizationName);
}
