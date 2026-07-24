// Shared mail-merge tag machinery — originally built for automation rules
// (see lib/automationRules.ts) but reused by every staff email composer in
// the app (CRM message, complaint reply, inbox reply, convocation, document
// send) so a learner's name/formation gets filled in automatically instead
// of typed by hand each time. No server-only imports here so client
// components can use MERGE_TAGS/insertTagAtCursor directly.
export const MERGE_TAGS: { tag: string; label: string }[] = [
  { tag: "[Prénom]", label: "Prénom" },
  { tag: "[Nom]", label: "Nom" },
  { tag: "[Formation]", label: "Formation" },
  { tag: "[Date de session]", label: "Date de session" },
  { tag: "[Organisme]", label: "Organisme" },
];

// Composers without a Course/Session in scope (a CRM message before any
// enrollment, a complaint reply, an inbox reply) only offer the tags they
// can actually resolve — showing [Formation] where nothing would fill it in
// would just leave the literal brackets in a sent email.
export const CONTACT_ONLY_MERGE_TAGS = MERGE_TAGS.filter((m) => m.tag === "[Prénom]" || m.tag === "[Nom]" || m.tag === "[Organisme]");

export type MergeTagContext = {
  firstName: string;
  lastName: string;
  courseTitle?: string;
  sessionDateLabel?: string;
  organizationName: string;
};

export function fillMergeTags(template: string, ctx: MergeTagContext) {
  return template
    .split("[Prénom]").join(ctx.firstName)
    .split("[Nom]").join(ctx.lastName)
    .split("[Formation]").join(ctx.courseTitle ?? "")
    .split("[Date de session]").join(ctx.sessionDateLabel ?? "")
    .split("[Organisme]").join(ctx.organizationName);
}

// Inserts `tag` at the current cursor position of a controlled input/
// textarea (falls back to appending at the end if the element/selection
// isn't available) and returns the new value plus where the cursor should
// land afterward — callers restore it via el.setSelectionRange in a
// requestAnimationFrame after the state update re-renders the field.
export function insertTagAtCursor(
  el: { selectionStart: number | null; selectionEnd: number | null } | null,
  currentValue: string,
  tag: string
): { text: string; cursor: number } {
  const start = el?.selectionStart ?? currentValue.length;
  const end = el?.selectionEnd ?? currentValue.length;
  const text = currentValue.slice(0, start) + tag + currentValue.slice(end);
  return { text, cursor: start + tag.length };
}
