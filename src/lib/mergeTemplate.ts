// The document toolkit's merge-field engine (spec §5.8) — deliberately
// simple string substitution against a fixed set of known placeholders, not
// a general templating language. This is the "dynamic personalization"
// piece the spec calls out as the real engineering work here (the template
// *content* stays client-authored, per spec — this just fills the blanks).
export type MergeContext = {
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    address?: string | null;
    birthDate?: Date | null;
  };
  organization: {
    name: string;
    legalForm?: string | null;
    shareCapital?: string | null;
    legalAddress?: string | null;
    rcsCity?: string | null;
    rcsNumber?: string | null;
    siret?: string | null;
    legalRepresentativeName?: string | null;
    activityDeclarationNumber?: string | null;
    publicContactEmail?: string | null;
    publicContactPhone?: string | null;
    regionPrefecture?: string | null;
    mediatorName?: string | null;
    mediatorContact?: string | null;
    referentHandicapName?: string | null;
    cancellationFeePercent?: number | null;
  };
  session?: { courseTitle: string; startsAt: Date; endsAt?: Date | null; location: string | null; meetingLink?: string | null } | null;
  dossier?: { retentionUntil: Date | null } | null;
  // Client feedback: a template scoped to a formation's own library (see
  // DocumentTemplate.courseId) should pull that formation's reference info
  // directly — distinct from `session`, which is about a specific dated
  // cohort (start time, room), not the course offering itself.
  course?: {
    title: string;
    durationHours: number | null;
    priceCents: number | null;
    description?: string | null;
    objectives?: string | null;
    prerequisites?: string | null;
    teachingMethods?: string | null;
    evaluationModalities?: string | null;
    accessDelay?: string | null;
    accessModalities?: string | null;
    maxLearners?: number | null;
    certificationName?: string | null;
    certificationCode?: string | null;
    certificationRegistry?: string | null;
    certifierName?: string | null;
    retakeConditions?: string | null;
  } | null;
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

// The reference price a contract's arithmetic hangs off: the agreed price
// for this dossier when there is one, the course's list price otherwise.
// Same precedence lib/funding.ts uses, so a calculated field never disagrees
// with the funding summary shown elsewhere.
function contractPriceCents(ctx: MergeContext): number | null {
  return ctx.funding?.totalCents ?? ctx.course?.priceCents ?? null;
}

export function buildMergeFields(ctx: MergeContext): Record<string, string> {
  const price = contractPriceCents(ctx);
  const feePercent = ctx.organization.cancellationFeePercent;

  return {
    "contact.firstName": ctx.contact.firstName,
    "contact.lastName": ctx.contact.lastName,
    "contact.email": ctx.contact.email,
    "contact.phone": ctx.contact.phone ?? "",
    "contact.address": ctx.contact.address ?? "",
    "contact.birthDate": ctx.contact.birthDate
      ? ctx.contact.birthDate.toLocaleDateString("fr-FR", DATE_FORMAT)
      : "",
    "organization.name": ctx.organization.name,
    "organization.legalForm": ctx.organization.legalForm ?? "",
    "organization.shareCapital": ctx.organization.shareCapital ?? "",
    "organization.legalAddress": ctx.organization.legalAddress ?? "",
    "organization.rcsCity": ctx.organization.rcsCity ?? "",
    "organization.rcsNumber": ctx.organization.rcsNumber ?? "",
    "organization.siret": ctx.organization.siret ?? "",
    "organization.legalRepresentativeName": ctx.organization.legalRepresentativeName ?? "",
    "organization.activityDeclarationNumber": ctx.organization.activityDeclarationNumber ?? "",
    "organization.publicContactEmail": ctx.organization.publicContactEmail ?? "",
    "organization.publicContactPhone": ctx.organization.publicContactPhone ?? "",
    "organization.regionPrefecture": ctx.organization.regionPrefecture ?? "",
    "organization.mediatorName": ctx.organization.mediatorName ?? "",
    "organization.mediatorContact": ctx.organization.mediatorContact ?? "",
    "organization.referentHandicapName": ctx.organization.referentHandicapName ?? "",
    "session.courseTitle": ctx.session?.courseTitle ?? "",
    "session.startsAt": ctx.session ? ctx.session.startsAt.toLocaleDateString("fr-FR", DATE_FORMAT) : "",
    "session.endsAt": ctx.session?.endsAt ? ctx.session.endsAt.toLocaleDateString("fr-FR", DATE_FORMAT) : "",
    "session.location": ctx.session?.location ?? "",
    "session.meetingLink": ctx.session?.meetingLink ?? "",
    "dossier.retentionUntil": ctx.dossier?.retentionUntil
      ? ctx.dossier.retentionUntil.toLocaleDateString("fr-FR", DATE_FORMAT)
      : "",
    "course.title": ctx.course?.title ?? "",
    "course.duration": ctx.course?.durationHours != null ? `${ctx.course.durationHours} heures` : "",
    "course.price": ctx.course?.priceCents != null ? formatEuros(ctx.course.priceCents) : "",
    "course.description": ctx.course?.description ?? "",
    "course.objectives": ctx.course?.objectives ?? "",
    "course.prerequisites": ctx.course?.prerequisites ?? "",
    "course.teachingMethods": ctx.course?.teachingMethods ?? "",
    "course.evaluationModalities": ctx.course?.evaluationModalities ?? "",
    "course.accessDelay": ctx.course?.accessDelay ?? "",
    "course.accessModalities": ctx.course?.accessModalities ?? "",
    "course.maxLearners": ctx.course?.maxLearners != null ? String(ctx.course.maxLearners) : "",
    "course.certificationName": ctx.course?.certificationName ?? "",
    "course.certificationCode": ctx.course?.certificationCode ?? "",
    "course.certificationRegistry": ctx.course?.certificationRegistry ?? "",
    "course.certifierName": ctx.course?.certifierName ?? "",
    "course.retakeConditions": ctx.course?.retakeConditions ?? "",
    "company.name": ctx.company?.name ?? "",
    "company.siret": ctx.company?.siret ?? "",
    "funder.name": ctx.funder?.name ?? "",
    "funding.total": ctx.funding ? formatEuros(ctx.funding.totalCents) : "",
    "funding.remainder": ctx.funding ? formatEuros(ctx.funding.remainderCents) : "",

    // ---- Calculated, not substituted ----
    // A contract that states a percentage without the matching amount forces
    // the OF to do the arithmetic by hand, in a document that binds them.
    // That is exactly where errors settle, so the engine does the sum.

    // The ceiling of art. L.6353-6 C. trav.: no more than 30 % of the agreed
    // price may be collected once the withdrawal period has run.
    "funding.cap30": price != null ? formatEuros(Math.round(price * 0.3)) : "",
    // Late-cancellation indemnity. Empty when the organisation charges none —
    // the clause carrying it is then dropped from the assembled document
    // anyway (see the indemniteAnnulation question), so an empty string here
    // is never what a reader ends up seeing.
    "contract.cancellationFeePercent": feePercent != null ? `${feePercent} %` : "",
    "contract.cancellationFeeAmount":
      feePercent != null && price != null ? formatEuros(Math.round((price * feePercent) / 100)) : "",
    // The day the document is produced. A contract states its own date, and
    // nothing in the record carries it.
    today: new Date().toLocaleDateString("fr-FR", DATE_FORMAT),
  };
}

export function mergeTemplate(bodyText: string, ctx: MergeContext): string {
  const fields = buildMergeFields(ctx);

  return bodyText.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in fields ? fields[key] : match
  );
}

// Template-level adaptation (no dossier yet): fill what the organisation
// alone can answer, and leave every learner/session-specific token VISIBLE
// as {{…}} instead of blanking it — the downloaded Word file is a base the
// OFP completes per client, and an invisible empty string where a name
// belongs is exactly how a field gets forgotten.
export function mergeTemplatePartial(bodyText: string, ctx: MergeContext): string {
  const fields = buildMergeFields(ctx);

  return bodyText.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in fields && fields[key] !== "" ? fields[key] : match
  );
}

// Derived from the resolver rather than restated beside it. The two used to
// be separate lists, which is a standing invitation to drift: a field added
// to one and forgotten in the other either never appears in the help panel,
// or is offered to the user and then renders as a raw {{token}} in a real
// document. Deriving it makes both impossible.
export const AVAILABLE_MERGE_FIELDS: string[] = Object.keys(
  buildMergeFields({
    contact: { firstName: "", lastName: "", email: "", phone: null },
    organization: { name: "" },
  }),
).sort();
