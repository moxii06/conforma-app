// Single source of truth for the (currently one) automation trigger kind, so
// the create form, the dashboard task integration, and the cron sender all
// agree on the same label/value without duplicating strings.
export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  needs_assessment_incomplete: "Recueil des besoins non complété",
};
