// The document toolkit's merge-field engine (spec §5.8) — deliberately
// simple string substitution against a fixed set of known placeholders, not
// a general templating language. This is the "dynamic personalization"
// piece the spec calls out as the real engineering work here (the template
// *content* stays client-authored, per spec — this just fills the blanks).
export type MergeContext = {
  contact: { firstName: string; lastName: string; email: string; phone: string | null };
  organization: { name: string };
  session?: { courseTitle: string; startsAt: Date; location: string | null } | null;
  dossier?: { retentionUntil: Date | null } | null;
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export function mergeTemplate(bodyText: string, ctx: MergeContext): string {
  const fields: Record<string, string> = {
    "contact.firstName": ctx.contact.firstName,
    "contact.lastName": ctx.contact.lastName,
    "contact.email": ctx.contact.email,
    "contact.phone": ctx.contact.phone ?? "",
    "organization.name": ctx.organization.name,
    "session.courseTitle": ctx.session?.courseTitle ?? "",
    "session.startsAt": ctx.session ? ctx.session.startsAt.toLocaleDateString("fr-FR", DATE_FORMAT) : "",
    "session.location": ctx.session?.location ?? "",
    "dossier.retentionUntil": ctx.dossier?.retentionUntil
      ? ctx.dossier.retentionUntil.toLocaleDateString("fr-FR", DATE_FORMAT)
      : "",
  };

  return bodyText.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in fields ? fields[key] : match
  );
}

export const AVAILABLE_MERGE_FIELDS = [
  "contact.firstName",
  "contact.lastName",
  "contact.email",
  "contact.phone",
  "organization.name",
  "session.courseTitle",
  "session.startsAt",
  "session.location",
  "dossier.retentionUntil",
];
