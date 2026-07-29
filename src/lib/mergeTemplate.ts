// The document toolkit's merge-field engine (spec §5.8) — deliberately
// simple string substitution against a fixed set of known placeholders, not
// a general templating language. This is the "dynamic personalization"
// piece the spec calls out as the real engineering work here (the template
// *content* stays client-authored, per spec — this just fills the blanks).
export type MergeContext = {
  contact: { firstName: string; lastName: string; email: string; phone: string | null };
  organization: {
    name: string;
    legalForm?: string | null;
    shareCapital?: string | null;
    legalAddress?: string | null;
    rcsCity?: string | null;
    rcsNumber?: string | null;
    legalRepresentativeName?: string | null;
    activityDeclarationNumber?: string | null;
  };
  session?: { courseTitle: string; startsAt: Date; location: string | null } | null;
  dossier?: { retentionUntil: Date | null } | null;
  // Client feedback: a template scoped to a formation's own library (see
  // DocumentTemplate.courseId) should pull that formation's reference info
  // directly — distinct from `session`, which is about a specific dated
  // cohort (start time, room), not the course offering itself.
  course?: { title: string; durationHours: number | null; priceCents: number | null } | null;
  // The contact's employer, when the training is company-funded (contact
  // has no company for an individual paying themselves) — feeds a
  // "convention" template's [NOM DU CLIENT / ENTREPRISE]-style clauses.
  company?: { name: string; siret: string | null } | null;
  // The subrogated funder on this dossier, if any — see
  // lib/documentQuestionnaire.ts's subrogation question. Only ever the
  // funder actually named in the funding plan, never a guess.
  funder?: { name: string } | null;
  // Snapshot of the dossier's funding arithmetic (lib/funding.ts) — the
  // total price and what's left for the client to pay after any secured
  // funding. Computed by the caller, not here, since it needs the full
  // FundingCommitment list this module deliberately doesn't depend on.
  funding?: { totalCents: number; remainderCents: number } | null;
};

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export function mergeTemplate(bodyText: string, ctx: MergeContext): string {
  const fields: Record<string, string> = {
    "contact.firstName": ctx.contact.firstName,
    "contact.lastName": ctx.contact.lastName,
    "contact.email": ctx.contact.email,
    "contact.phone": ctx.contact.phone ?? "",
    "organization.name": ctx.organization.name,
    "organization.legalForm": ctx.organization.legalForm ?? "",
    "organization.shareCapital": ctx.organization.shareCapital ?? "",
    "organization.legalAddress": ctx.organization.legalAddress ?? "",
    "organization.rcsCity": ctx.organization.rcsCity ?? "",
    "organization.rcsNumber": ctx.organization.rcsNumber ?? "",
    "organization.legalRepresentativeName": ctx.organization.legalRepresentativeName ?? "",
    "organization.activityDeclarationNumber": ctx.organization.activityDeclarationNumber ?? "",
    "session.courseTitle": ctx.session?.courseTitle ?? "",
    "session.startsAt": ctx.session ? ctx.session.startsAt.toLocaleDateString("fr-FR", DATE_FORMAT) : "",
    "session.location": ctx.session?.location ?? "",
    "dossier.retentionUntil": ctx.dossier?.retentionUntil
      ? ctx.dossier.retentionUntil.toLocaleDateString("fr-FR", DATE_FORMAT)
      : "",
    "course.title": ctx.course?.title ?? "",
    "course.duration": ctx.course?.durationHours != null ? `${ctx.course.durationHours} heures` : "",
    "course.price": ctx.course?.priceCents != null ? formatEuros(ctx.course.priceCents) : "",
    "company.name": ctx.company?.name ?? "",
    "company.siret": ctx.company?.siret ?? "",
    "funder.name": ctx.funder?.name ?? "",
    "funding.total": ctx.funding ? formatEuros(ctx.funding.totalCents) : "",
    "funding.remainder": ctx.funding ? formatEuros(ctx.funding.remainderCents) : "",
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
  "organization.legalForm",
  "organization.shareCapital",
  "organization.legalAddress",
  "organization.rcsCity",
  "organization.rcsNumber",
  "organization.legalRepresentativeName",
  "organization.activityDeclarationNumber",
  "session.courseTitle",
  "session.startsAt",
  "session.location",
  "dossier.retentionUntil",
  "course.title",
  "course.duration",
  "course.price",
  "company.name",
  "company.siret",
  "funder.name",
  "funding.total",
  "funding.remainder",
];
