import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, InfoRow, ContextBanner } from "@/components/ui";
import { CheckCircle2, Circle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext, can, canWriteRgpd, canManageSessionInvitations, canAccessAccommodations } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { Tabs } from "@/components/Tabs";
import { DossierCategorySelect } from "@/components/DossierCategorySelect";
import { AddDossierDocumentForm } from "@/components/AddDossierDocumentForm";
import { SendDocumentDialog, type ScheduleContext, type SessionInfo } from "@/components/SendDocumentDialog";
import { CreateRightsRequestButton } from "@/components/CreateRightsRequestButton";
import { PlanRetentionForm } from "@/components/PlanRetentionForm";
import { ParcoursStepToggle } from "@/components/ParcoursStepToggle";
import { EmailReplyComposer } from "@/components/EmailReplyComposer";
import { NewEmailComposer } from "@/components/NewEmailComposer";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { SendOutreachButtons } from "@/components/SendOutreachButtons";
import { MarkContractSignedButton } from "@/components/MarkContractSignedButton";
import { AccommodationForm } from "@/components/AccommodationForm";
import { AccommodationStatusForm } from "@/components/AccommodationStatusForm";
import { SendSatisfactionSurveyButton } from "@/components/SendSatisfactionSurveyButton";
import { EditContactForm } from "@/components/EditContactForm";
import { RouvrirDossierButton } from "@/components/RouvrirDossierButton";
import { DossierSwitcher } from "@/components/DossierSwitcher";
import { EditCompanyForm } from "@/components/EditCompanyForm";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { templateCourseFilter, sortTemplatesForCourse } from "@/lib/templateScope";
import { DossierFundingPanel } from "@/components/DossierFundingPanel";
import { resolveDossierPriceCents, computeFundingReadiness, computeFundingSummary, formatCents } from "@/lib/funding";
import { LEARNER_CATEGORY_SINGULAR } from "@/lib/bpfCategories";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const OUTREACH_LABELS: Record<string, string> = {
  contract: "Contrat",
  platform_access: "Accès plateforme",
  certificate: "Attestation",
  learner_nudge: "Relance apprenant",
};

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

// FUNDER_TYPE_LABELS spells out "CPF (Caisse des Dépôts)" — too long for a
// pill that joins several sources ("CPF + OPCO").
const FUNDER_SHORT_LABELS: Record<string, string> = {
  opco: "OPCO",
  cpf: "CPF",
  france_travail: "France Travail",
  agefice: "AGEFICE",
  company: "Entreprise",
  individual: "Particulier",
  public: "Public",
  other: "Autre",
};

const BASE_TABS = [
  { key: "info", label: "Info" },
  { key: "formations", label: "Formations" },
  { key: "emails", label: "Emails" },
  { key: "documents", label: "Documents" },
  { key: "donnees-personnelles", label: "Données personnelles" },
  { key: "preuves-qualiopi", label: "Preuves Qualiopi" },
];

export default async function DossierPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");
  const canEditCategory = can(role, "dossiers") === "full";
  const canManageEmail = can(role, "inbox") !== "none";
  const activeTab = searchParams.tab ?? "info";

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId },
    include: { contact: { include: { company: true } }, session: { include: { course: true } } },
  });
  if (!dossier) notFound();
  if (role === Role.TRAINER && dossier.session.trainerId !== userId) redirect("/dossiers");

  // Client feedback (S4 UX audit): the header used to show only this
  // dossier's course title, implying it's the learner's one formation even
  // when they have several — this powers a real switcher instead.
  const siblingDossiers = await prisma.dossier.findMany({
    where: { contactId: dossier.contactId, organizationId },
    select: { id: true, session: { select: { startsAt: true, mode: true, course: { select: { title: true } } } } },
    orderBy: { session: { startsAt: "desc" } },
  });
  const dossierOptions = siblingDossiers.map((d) => ({
    id: d.id,
    label: d.session.mode === "ROLLING" ? d.session.course.title : `${d.session.course.title} — ${format(d.session.startsAt, "d MMM yyyy", { locale: fr })}`,
  }));

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, emailSignature: true } });
  const signatureHtml = sender.emailSignature ?? `Cordialement,<br>${sender.name}`;
  const canAccessAccomm = canAccessAccommodations(role, userId, organization);
  // Funding is money data: same audience as /facturation, not the wider set
  // of roles that can open a dossier. A trainer seeing who funds a learner
  // is a confidentiality question, not just a permissions one.
  const canSeeFunding = can(role, "invoicing") !== "none";
  // Context for the payment-schedule section of SendDocumentDialog. Gated by
  // canSeeFunding for the same reason as the Financement tab: the schedule is
  // money data, and a role that cannot see invoicing must not learn the price
  // through the send dialog instead. Null price (no agreed price, no course
  // price) also disables it — a schedule against an unknown total is noise.
  const dossierPriceCents = resolveDossierPriceCents(dossier, dossier.session.course);
  const scheduleContext =
    canSeeFunding && dossierPriceCents != null && dossierPriceCents > 0
      ? {
          priceCents: dossierPriceCents,
          // Proposition, pas règle : une indemnité de résiliation se négocie
          // client par client, l'écran d'envoi peut s'en écarter.
          cancellationFeeDefault: organization.cancellationFeePercent,
          startsAt: dossier.session.startsAt.toISOString(),
          endsAt: dossier.session.endsAt.toISOString(),
          capAcknowledged: organization.paymentCapAckAt != null,
        }
      : undefined;
  // What the contract's session.* merge fields will say — shown in the send
  // dialog so a ROLLING dossier's missing dates are visible BEFORE sending,
  // with a one-step "programmer des dates" fix for roles allowed to plan.
  const sessionInfo = {
    mode: dossier.session.mode,
    format: dossier.session.format,
    startsAtLabel: format(dossier.session.startsAt, "d MMMM yyyy", { locale: fr }),
    canSchedule: can(role, "planning") === "full",
  };
  const TABS = [
    ...BASE_TABS,
    ...(canSeeFunding ? [{ key: "financement", label: "Financement" }] : []),
    ...(canAccessAccomm ? [{ key: "accessibilite", label: "Accessibilité" }] : []),
  ];
  if (activeTab === "accessibilite" && !canAccessAccomm) redirect(`/dossiers/${dossier.id}`);
  if (activeTab === "financement" && !canSeeFunding) redirect(`/dossiers/${dossier.id}`);

  const [fundingCommitments, funders] = canSeeFunding
    ? await Promise.all([
        prisma.fundingCommitment.findMany({
          where: { dossierId: dossier.id, organizationId },
          include: {
            funder: { select: { name: true, type: true } },
            invoice: { select: { reference: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.funder.findMany({
          where: { organizationId, archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true, hourlyRateCents: true, maxAmountCents: true },
        }),
      ])
    : [[], []];

  // The deposit checklist — everything verified against real records, never
  // hand-declared. Loaded only when the tab is reachable.
  let fundingReadiness: ReturnType<typeof computeFundingReadiness> = [];
  if (canSeeFunding) {
    const [dossierDocs, quoteCount, trainerDocCount, org] = await Promise.all([
      prisma.document.findMany({ where: { dossierId: dossier.id }, select: { category: true } }),
      prisma.quote.count({ where: { organizationId, contactId: dossier.contactId } }),
      // "The trainer has a CV on file": documents attached either to the
      // session's trainer (User) or to a subcontractor linked to that user.
      dossier.session.trainerId
        ? prisma.document.count({
            where: {
              organizationId,
              OR: [
                { userId: dossier.session.trainerId },
                { subcontractor: { linkedUserId: dossier.session.trainerId } },
              ],
            },
          })
        : Promise.resolve(0),
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { qualiopiCertificateNumber: true, qualiopiCertificateUntil: true },
      }),
    ]);
    fundingReadiness = computeFundingReadiness({
      dossier: { needsAssessmentDone: dossier.needsAssessmentDone, contractSigned: dossier.contractSigned },
      course: {
        objectives: dossier.session.course.objectives,
        prerequisites: dossier.session.course.prerequisites,
        durationHours: dossier.session.course.durationHours,
        teachingMethods: dossier.session.course.teachingMethods,
        evaluationModalities: dossier.session.course.evaluationModalities,
      },
      session: { mode: dossier.session.mode, startsAt: dossier.session.startsAt, endsAt: dossier.session.endsAt },
      organization: org,
      documentCategories: dossierDocs.map((d) => d.category).filter((c): c is string => c !== null),
      trainerHasDocuments: trainerDocCount > 0,
      quoteExists: quoteCount > 0,
    });
  }

  // Feeds the identity card in the Formations tab — money data, so gated
  // by the same canSeeFunding as the Financement tab, never rendered for
  // roles that can't see invoicing.
  const identityFunding = canSeeFunding
    ? (() => {
        const summary = computeFundingSummary(
          resolveDossierPriceCents(dossier, dossier.session.course),
          fundingCommitments.map((c) => ({
            amountCents: c.amountCents,
            status: c.status,
            subrogation: c.subrogation,
            validUntil: c.validUntil,
          })),
        );
        return {
          totalCents: summary.totalCents,
          remainderCents: summary.remainderCents,
          funderTypes: [...new Set(fundingCommitments.map((c) => c.funder.type))],
        };
      })()
    : null;

  const members = canManageEmail
    ? await prisma.user.findMany({
        where: { organizationId, status: "active", role: { not: Role.LEARNER } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <>
      <PageHeader title={`${dossier.contact.firstName} ${dossier.contact.lastName}`} />
      {/* Un dossier clos doit se voir quand on l'ouvre. Sans ce bandeau,
          « clôturé » n'existait que dans un onglet de liste — on pouvait
          arriver ici par un lien et travailler sur un dossier fermé sans
          jamais le savoir. */}
      {dossier.archivedAt && (
        <div className="mx-8 mt-3.5 border border-line bg-mist rounded-md px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12.5px] text-ink">
            <span className="font-medium">Dossier clôturé.</span> Il n&apos;apparaît plus dans les listes de travail et
            ne déclenche plus de relance. Le bilan pédagogique et l&apos;accès de l&apos;apprenant sont inchangés.
          </div>
          {canEditCategory && <RouvrirDossierButton dossierId={dossier.id} />}
        </div>
      )}
      <div className="px-8 pt-3.5 flex items-center gap-3 text-[12px] text-slate flex-wrap">
        <DossierSwitcher dossiers={dossierOptions} currentId={dossier.id} />
        <span className="text-line">·</span>
        <Link href={`/planning/${dossier.session.id}`} className="hover:text-ink hover:underline decoration-line">
          {dossier.session.mode === "ROLLING"
            ? "Voir la session (formation en continu) →"
            : `Voir la session (${format(dossier.session.startsAt, "d MMM yyyy", { locale: fr })}) →`}
        </Link>
        <span className="text-line">·</span>
        <Link href={`/formations/${dossier.session.course.id}`} className="hover:text-ink hover:underline decoration-line">
          Voir la fiche formation →
        </Link>
      </div>
      <Tabs basePath={`/dossiers/${dossier.id}`} tabs={TABS} active={activeTab} />
      {dossier.contractSigned && (
        <ContextBanner
          tone="good"
          action={
            <Link href={`/dossiers/${dossier.id}?tab=documents`} className="text-ink font-semibold text-[12.5px] whitespace-nowrap hover:underline">
              Voir dans Documents →
            </Link>
          }
        >
          <strong className="font-semibold">Convention signée</strong> — session confirmée pour le{" "}
          {format(dossier.session.startsAt, "d MMM yyyy", { locale: fr })}.
        </ContextBanner>
      )}
      <div className={activeTab === "formations" ? "p-8 max-w-5xl" : "p-8 max-w-xl"}>
        {activeTab === "formations" ? (
          <FormationsTab
            contactId={dossier.contactId}
            organizationId={organizationId}
            currentDossierId={dossier.id}
            role={role}
            userId={userId}
            canManageOutreach={can(role, "dossiers") !== "none"}
            signatureHtml={signatureHtml}
            funding={identityFunding}
            scheduleContext={scheduleContext}
            sessionInfo={sessionInfo}
          />
        ) : activeTab === "emails" ? (
          <EmailsTab contactId={dossier.contactId} dossierId={dossier.id} canManageEmail={canManageEmail} members={members} />
        ) : activeTab === "documents" ? (
          <DocumentsTab
            dossierId={dossier.id}
            organizationId={organizationId}
            canWrite={can(role, "dossiers") !== "none"}
            contactFirstName={dossier.contact.firstName}
            signatureHtml={signatureHtml}
            scheduleContext={scheduleContext}
            sessionInfo={sessionInfo}
          />
        ) : activeTab === "donnees-personnelles" ? (
          <PersonalDataTab dossier={dossier} canWrite={canWriteRgpd(role)} />
        ) : activeTab === "preuves-qualiopi" ? (
          <QualiopiEvidenceTab dossierId={dossier.id} />
        ) : activeTab === "accessibilite" ? (
          <AccessibilityTab dossierId={dossier.id} />
        ) : activeTab === "financement" ? (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-1">Financement</div>
            <div className="text-[12px] text-slate mb-4">
              Qui paie cette formation, et ce qui reste à la charge du client.
            </div>
            <DossierFundingPanel
              dossierId={dossier.id}
              totalCents={resolveDossierPriceCents(dossier, dossier.session.course)}
              usesCoursePrice={dossier.agreedPriceCents == null}
              canEdit={can(role, "invoicing") !== "none"}
              funders={funders}
              readiness={fundingReadiness}
              durationHours={dossier.session.course.durationHours}
              commitments={fundingCommitments.map((c) => ({
                id: c.id,
                funderId: c.funderId,
                funderName: c.funder.name,
                funderType: c.funder.type,
                amountCents: c.amountCents,
                subrogation: c.subrogation,
                agreementNumber: c.agreementNumber,
                validUntil: c.validUntil ? c.validUntil.toISOString() : null,
                depositedAt: c.depositedAt ? c.depositedAt.toISOString() : null,
                status: c.status,
                invoiceReference: c.invoice?.reference ?? null,
              }))}
            />
          </div>
        ) : (
          <InfoTab dossier={dossier} canEditCategory={canEditCategory} />
        )}
      </div>
    </>
  );
}

// Client feedback: with the Parcours checklist and "Autres formations"
// both living here, Info read as covering every formation of the learner
// at once even though the checklist only ever tracked the current dossier.
// Info now holds exactly what its name promises — who this person (and
// their company, if any) is — and nothing formation-specific; all of that
// moved to the new "Formations" tab (see FormationsTab below), one entry
// per dossier, each expandable to its own recap.
function InfoTab({
  dossier,
  canEditCategory,
}: {
  dossier: {
    id: string;
    learnerCategory: string | null;
    contact: { id: string; firstName: string; lastName: string; email: string; phone: string | null; address: string | null; company: { id: string; name: string; siret: string | null; address: string | null; responsableFirstName: string | null; responsableLastName: string | null; responsableEmail: string | null; responsablePhone: string | null; legalRepresentativeName: string | null } | null };
  };
  canEditCategory: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-line rounded-card p-5">
        <EditContactForm contact={dossier.contact} title="Coordonnées" />
      </div>
      {dossier.contact.company && (
        <div className="bg-white border border-line rounded-card p-5">
          <EditCompanyForm company={dossier.contact.company} title="Société" />
        </div>
      )}
      {canEditCategory && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[12.5px] text-slate mb-2">Catégorie légale de l&apos;apprenant (pour le BPF)</div>
          <DossierCategorySelect dossierId={dossier.id} learnerCategory={dossier.learnerCategory} />
        </div>
      )}
    </div>
  );
}

// Every formation (Dossier) this contact has ever been enrolled in, each
// collapsed to a one-line summary and expandable to its own recap — the
// current dossier starts open. Only the current dossier gets the full
// Communications block (send actions): rendering that for every formation
// would mean fetching document templates and building N send dialogs for
// a tab whose point is an overview, not a place to manage every formation
// at once — "Voir le dossier complet" is the deliberate escape hatch for
// managing a DIFFERENT formation, by navigating to its own page where it
// becomes the current one.
async function FormationsTab({
  contactId,
  organizationId,
  currentDossierId,
  role,
  userId,
  canManageOutreach,
  signatureHtml,
  funding,
  scheduleContext,
  sessionInfo,
}: {
  contactId: string;
  organizationId: string;
  currentDossierId: string;
  role: Role;
  userId: string;
  canManageOutreach: boolean;
  signatureHtml: string;
  funding: { totalCents: number; remainderCents: number; funderTypes: string[] } | null;
  scheduleContext?: ScheduleContext;
  sessionInfo?: SessionInfo;
}) {
  const dossiers = await prisma.dossier.findMany({
    where: { contactId, organizationId },
    include: { session: { include: { course: true, trainer: { select: { name: true } } } } },
    orderBy: { session: { startsAt: "desc" } },
  });
  const dossierIds = dossiers.map((d) => d.id);
  const now = new Date();
  // La formation en jeu, c'est celle du dossier ouvert — un même contact
  // peut en suivre plusieurs, et les modèles proposés doivent suivre
  // l'onglet, pas le contact.
  const courseEnJeu = dossiers.find((d) => d.id === currentDossierId)?.session.courseId ?? null;

  const [contact, allDocuments, allSurveyResponses, allOutreaches, templatesBruts] = await Promise.all([
    prisma.contact.findUniqueOrThrow({
      where: { id: contactId },
      select: { firstName: true, lastName: true, email: true, company: { select: { name: true } } },
    }),
    prisma.document.findMany({ where: { dossierId: { in: dossierIds } }, orderBy: { createdAt: "desc" } }),
    prisma.satisfactionSurveyResponse.findMany({
      where: { dossierId: { in: dossierIds }, status: "completed" },
      select: { dossierId: true, survey: { select: { kind: true } } },
    }),
    prisma.clientOutreach.findMany({ where: { dossierId: { in: dossierIds } }, orderBy: { sentAt: "desc" } }),
    canManageOutreach
      ? prisma.documentTemplate.findMany({
          // Deux conditions en OR : les juxtaposer à la racine ferait que la
          // seconde écrase la première. D'où le AND explicite.
          where: {
            AND: [{ OR: [{ organizationId }, { organizationId: null }] }, templateCourseFilter(courseEnJeu)],
          },
          select: { id: true, title: true, category: true, courseId: true },
          orderBy: { title: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const templates = sortTemplatesForCourse(templatesBruts, courseEnJeu);

  const current = dossiers.find((d) => d.id === currentDossierId);
  const initials = `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase();
  const categoryPill = current?.learnerCategory ? LEARNER_CATEGORY_SINGULAR[current.learnerCategory] : null;
  const funderPill =
    funding && funding.funderTypes.length > 0
      ? funding.funderTypes.map((t) => FUNDER_SHORT_LABELS[t] ?? t).join(" + ")
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
      {current && (
        <div className="bg-white border border-line rounded-card p-5 lg:sticky lg:top-6">
          <Avatar initials={initials} />
          <div className="font-display text-[18px] text-ink mt-3">
            {contact.firstName} {contact.lastName}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {categoryPill && <Pill tone="neutral">{categoryPill}</Pill>}
            {funderPill && <Pill tone="warn">{funderPill}</Pill>}
          </div>
          {funding && (
            <div className="mt-4">
              <div className="text-[12px] text-slate mb-1">Montant formation</div>
              <div className="text-2xl font-mono font-semibold tabular-nums text-ink">
                {funding.totalCents > 0 ? formatCents(funding.totalCents) : "—"}
              </div>
              {funding.totalCents > 0 && funding.remainderCents > 0 && funding.remainderCents < funding.totalCents && (
                <div className="text-[11.5px] text-slate mt-1">
                  dont {formatCents(funding.remainderCents)} reste à charge client
                </div>
              )}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-line flex flex-col gap-2.5">
            {contact.company && <InfoRow label="Entreprise">{contact.company.name}</InfoRow>}
            <InfoRow label="Formateur">{current.session.trainer?.name ?? "Non assigné"}</InfoRow>
            <InfoRow label="Session">
              {current.session.mode === "ROLLING"
                ? "Formation en continu"
                : `${format(current.session.startsAt, "d MMM yyyy", { locale: fr })} · ${FORMAT_LABELS[current.session.format] ?? current.session.format}`}
            </InfoRow>
            <InfoRow label="Email">
              <span className="break-all">{contact.email}</span>
            </InfoRow>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
      <div className="text-[12px] text-slate">
        {dossiers.length} formation{dossiers.length > 1 ? "s" : ""} pour {contact.firstName}.
      </div>
      {dossiers.map((d) => {
        const isCurrent = d.id === currentDossierId;
        const documents = allDocuments.filter((doc) => doc.dossierId === d.id);
        const outreaches = allOutreaches.filter((o) => o.dossierId === d.id);
        const canConvocation = canManageSessionInvitations(role, userId, d.session);

        const documentHrefByStep: Record<string, string> = {};
        for (const doc of documents) {
          if (!["needs_assessment", "convention", "convocation", "eval_hot", "eval_cold"].includes(doc.category)) continue;
          if (documentHrefByStep[doc.category]) continue; // most recent already kept — findMany above is createdAt desc
          documentHrefByStep[doc.category] = doc.fileUrl ? `/api/documents/${doc.id}/file` : `/documents/apercu/${doc.id}`;
        }
        for (const r of allSurveyResponses.filter((r) => r.dossierId === d.id)) {
          documentHrefByStep[`eval_${r.survey.kind}`] = `/dossiers/${d.id}/satisfaction/${r.survey.kind}`;
        }

        // overdue/hint are real signals derived from the session's own dates,
        // not hand-declared: a convocation is overdue once the session has
        // already started without one, and an evaluation genuinely can't be
        // done before the session ends.
        const steps: { key: "needs_assessment" | "contract" | "convocation" | "eval_hot" | "eval_cold"; docCategory: string; label: string; done: boolean; overdue?: boolean; hint?: string }[] = [
          { key: "needs_assessment", docCategory: "needs_assessment", label: "Recueil des besoins", done: d.needsAssessmentDone },
          { key: "contract", docCategory: "convention", label: "Convention signée", done: d.contractSigned },
          {
            key: "convocation",
            docCategory: "convocation",
            label: "Convocation envoyée",
            done: d.convocationSent,
            overdue: !d.convocationSent && d.session.startsAt <= now,
          },
          {
            key: "eval_hot",
            docCategory: "eval_hot",
            label: "Évaluation à chaud",
            done: d.evaluationHotDone,
            hint: !d.evaluationHotDone && d.session.endsAt > now ? "Disponible après la session" : undefined,
          },
          {
            key: "eval_cold",
            docCategory: "eval_cold",
            label: "Évaluation à froid",
            done: d.evaluationColdDone,
            hint: !d.evaluationColdDone && d.session.endsAt > now ? "Disponible après la session" : undefined,
          },
        ];
        const doneCount = steps.filter((s) => s.done).length;

        return (
          <CollapsibleSection
            key={d.id}
            title={d.session.course.title}
            badge={<Pill tone={isCurrent ? "good" : "neutral"}>{format(d.session.startsAt, "d MMM yyyy", { locale: fr })}</Pill>}
            defaultOpen={isCurrent}
          >
            <div className="text-[11.5px] text-slate mb-3">
              {FORMAT_LABELS[d.session.format] ?? d.session.format} · {d.session.trainer?.name ?? "Formateur non assigné"} · du{" "}
              {format(d.session.startsAt, "d MMM", { locale: fr })} au {format(d.session.endsAt, "d MMM yyyy", { locale: fr })}
            </div>

            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Parcours de formation</div>
              <div className="text-[11px] text-slate">{doneCount}/{steps.length} complétées</div>
            </div>
            {steps.map((s) =>
              isCurrent && canManageOutreach ? (
                <ParcoursStepToggle
                  key={s.key}
                  dossierId={d.id}
                  stepKey={s.key}
                  label={s.label}
                  done={s.done}
                  documentHref={documentHrefByStep[s.docCategory]}
                  overdue={s.overdue}
                  hint={s.hint}
                />
              ) : (
                <div key={s.key} className="flex items-center justify-between gap-2.5 py-2 border-t border-line first:border-t-0">
                  <div className="flex items-start gap-2.5">
                    {s.done ? (
                      <CheckCircle2 size={16} className="text-sage mt-0.5 shrink-0" />
                    ) : (
                      <Circle size={16} className={`mt-0.5 shrink-0 ${s.overdue ? "text-rust" : "text-ash"}`} />
                    )}
                    <div>
                      <div className={`text-[13px] ${s.done ? "text-ink" : "text-slate"}`}>{s.label}</div>
                      {!s.done && s.overdue && <div className="text-[11px] text-rust font-medium">En retard</div>}
                      {!s.done && !s.overdue && s.hint && <div className="text-[11px] text-ash">{s.hint}</div>}
                    </div>
                  </div>
                  {s.done && documentHrefByStep[s.docCategory] && (
                    <a
                      href={documentHrefByStep[s.docCategory]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate underline decoration-line hover:decoration-ink shrink-0"
                    >
                      Voir le document
                    </a>
                  )}
                </div>
              )
            )}

            {documents.length > 0 && (
              <div className="mt-3.5 pt-3.5 border-t border-line">
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1.5">Documents ({documents.length})</div>
                <div className="flex flex-col gap-1.5">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.bodyText ? `/documents/apercu/${doc.id}` : `/api/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 text-[12px] text-ink underline decoration-line hover:decoration-ink"
                    >
                      <span className="truncate">{doc.title}</span>
                      <span className="text-slate shrink-0 no-underline">{format(doc.createdAt, "d MMM yyyy", { locale: fr })}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isCurrent && (canManageOutreach || canConvocation) && (
              <div className="mt-3.5 pt-3.5 border-t border-line">
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1.5">Communications</div>
                <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
                  <SendOutreachButtons dossierId={d.id} showConvocation={canConvocation} />
                  {canManageOutreach && (
                    <SendDocumentDialog
                      dossierId={d.id}
                      templates={templates}
                      contactFirstName={contact.firstName}
                      signatureHtml={signatureHtml}
                      // Only exact for the dossier this page is open on: the
                      // Communications panel lists sibling dossiers too, and
                      // their price/dates may differ. Passing the current
                      // dossier's context to a sibling would print another
                      // contract's arithmetic, so siblings get none.
                      scheduleContext={d.id === currentDossierId ? scheduleContext : undefined}
                      sessionInfo={d.id === currentDossierId ? sessionInfo : undefined}
                    />
                  )}
                  {canManageOutreach && <SendSatisfactionSurveyButton dossierId={d.id} kind="positioning" />}
                  {canManageOutreach && <SendSatisfactionSurveyButton dossierId={d.id} kind="hot" />}
                  {canManageOutreach && <SendSatisfactionSurveyButton dossierId={d.id} kind="cold" />}
                </div>
                {outreaches.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {outreaches.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-3 text-[12px]">
                        <div className="text-ink">
                          {OUTREACH_LABELS[o.type] ?? o.type} — envoyé le {format(o.sentAt, "d MMM yyyy", { locale: fr })} par {o.sentByName}
                        </div>
                        {o.status === "acknowledged" ? (
                          <Pill tone="good">{o.type === "platform_access" ? "Activé" : "Signé"}</Pill>
                        ) : o.type === "contract" ? (
                          <MarkContractSignedButton outreachId={o.id} />
                        ) : (
                          <Pill tone="neutral">En attente</Pill>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isCurrent && (
              <div className="mt-3.5 pt-3.5 border-t border-line">
                <Link href={`/dossiers/${d.id}`} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
                  Voir le dossier complet →
                </Link>
              </div>
            )}
          </CollapsibleSection>
        );
      })}
      </div>
    </div>
  );
}

async function EmailsTab({
  contactId,
  dossierId,
  canManageEmail,
  members,
}: {
  contactId: string;
  dossierId: string;
  canManageEmail: boolean;
  members: { id: string; name: string }[];
}) {
  const emails = await prisma.emailMessage.findMany({ where: { contactId }, orderBy: { receivedAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Échanges par email</div>
      {canManageEmail && <NewEmailComposer contactId={contactId} dossierId={dossierId} />}
      {emails.map((m) => (
        <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12.5px] text-ink font-medium">
              {m.direction === "out" && <span className="text-slate font-normal">Vous — </span>}
              {m.subject}
            </div>
            <div className="text-[11px] text-slate shrink-0">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
          </div>
          <div className="text-[12px] text-slate whitespace-pre-wrap">{m.body ?? m.snippet}</div>
          {canManageEmail && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-slate">Assigné à</span>
              <AssignEmailSelect messageId={m.id} members={members} assignedToUserId={m.assignedToUserId} />
            </div>
          )}
          {canManageEmail && m.direction === "in" && <EmailReplyComposer messageId={m.id} />}
        </div>
      ))}
      {emails.length === 0 && <div className="text-[12.5px] text-slate">Aucun email rattaché à ce contact.</div>}
    </div>
  );
}

async function DocumentsTab({
  dossierId,
  organizationId,
  canWrite,
  contactFirstName,
  signatureHtml,
  scheduleContext,
  sessionInfo,
}: {
  dossierId: string;
  organizationId: string;
  canWrite: boolean;
  contactFirstName: string;
  signatureHtml: string;
  scheduleContext?: ScheduleContext;
  sessionInfo?: SessionInfo;
}) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { session: { select: { courseId: true } } },
  });
  const courseEnJeu = dossier?.session.courseId ?? null;

  const [documents, templatesBruts] = await Promise.all([
    prisma.document.findMany({ where: { dossierId }, orderBy: { createdAt: "desc" } }),
    canWrite
      ? prisma.documentTemplate.findMany({
          where: {
            AND: [{ OR: [{ organizationId }, { organizationId: null }] }, templateCourseFilter(courseEnJeu)],
          },
          select: { id: true, title: true, category: true, courseId: true },
          orderBy: { title: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const templates = sortTemplatesForCourse(templatesBruts, courseEnJeu);

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[13.5px] font-semibold text-ink">Documents</div>
        {canWrite && (
          <SendDocumentDialog
            dossierId={dossierId}
            templates={templates}
            contactFirstName={contactFirstName}
            signatureHtml={signatureHtml}
            scheduleContext={scheduleContext}
            sessionInfo={sessionInfo}
          />
        )}
      </div>
      {documents.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-line first:border-t-0">
          <div className="min-w-0">
            <a
              href={d.bodyText ? `/documents/apercu/${d.id}` : `/api/documents/${d.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink"
            >
              {d.title}
            </a>
            <div className="text-[11px] text-slate mt-0.5">
              Envoyé le {format(d.createdAt, "d MMM yyyy", { locale: fr })}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Pill tone="neutral">{CATEGORY_LABELS[d.category] ?? d.category}</Pill>
            {d.templateOrigin && <Pill tone="neutral">{d.templateOrigin}</Pill>}
            {d.signatureStatus === "pending" && <Pill tone="warn">En attente de signature</Pill>}
            {d.signatureStatus === "signed" && d.signedAt && (
              <Pill tone="good">Signé le {format(d.signedAt, "d MMM yyyy", { locale: fr })}</Pill>
            )}
          </div>
        </div>
      ))}
      {documents.length === 0 && <div className="text-[12.5px] text-slate py-2">Aucun document.</div>}
      {canWrite && (
        <div className="mt-3.5 pt-3.5 border-t border-line">
          <div className="text-[11px] text-slate uppercase tracking-wide mb-1.5">Ou rattacher un lien existant</div>
          <AddDossierDocumentForm dossierId={dossierId} />
        </div>
      )}
    </div>
  );
}

function PersonalDataTab({
  dossier,
  canWrite,
}: {
  dossier: { id: string; legalBasis: string; retentionUntil: Date | null };
  canWrite: boolean;
}) {
  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
      <div>
        <div className="text-[12.5px] text-slate mb-1">Base légale</div>
        <div className="text-[13px] text-ink">{dossier.legalBasis}</div>
      </div>
      <div>
        <div className="text-[12.5px] text-slate mb-1">Purge prévue</div>
        <div className="text-[13px] text-ink mb-2">
          {dossier.retentionUntil ? format(dossier.retentionUntil, "d MMMM yyyy", { locale: fr }) : "Non planifiée"}
        </div>
        {canWrite && <PlanRetentionForm dossierId={dossier.id} retentionUntil={dossier.retentionUntil} />}
      </div>
      {canWrite && (
        <div className="pt-2 border-t border-line">
          <div className="text-[12.5px] text-slate mb-2">Exercice des droits</div>
          <CreateRightsRequestButton dossierId={dossier.id} />
        </div>
      )}
    </div>
  );
}

async function QualiopiEvidenceTab({ dossierId }: { dossierId: string }) {
  const evidence = await prisma.qualiopiIndicatorEvidence.findMany({ where: { dossierId }, orderBy: { indicatorNumber: "asc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Preuves Qualiopi rattachées</div>
      {evidence.map((e) => (
        <div key={e.id} className="py-2.5 border-t border-line first:border-t-0">
          <div className="text-[12.5px] text-ink">
            Indicateur {e.indicatorNumber} (critère {e.criterionNumber})
          </div>
          {e.evidenceNote && <div className="text-[12px] text-slate mt-0.5">{e.evidenceNote}</div>}
        </div>
      ))}
      {evidence.length === 0 && <div className="text-[12.5px] text-slate">Aucune preuve rattachée à ce dossier.</div>}
    </div>
  );
}

const ACCOMMODATION_STATUS_LABELS: Record<string, string> = { pending: "En attente", granted: "Accordé", declined: "Refusé" };
const ACCOMMODATION_STATUS_TONE: Record<string, "warn" | "good" | "danger"> = { pending: "warn", granted: "good", declined: "danger" };

// Only reachable when canAccessAccommodations() already passed on the page
// component — this tab is never rendered (and the route redirects away
// from ?tab=accessibilite) for anyone else, since the content itself is
// RGPD art. 9 special-category data.
async function AccessibilityTab({ dossierId }: { dossierId: string }) {
  const requests = await prisma.accommodationRequest.findMany({ where: { dossierId }, orderBy: { createdAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Aménagements — situation de handicap</div>
      </div>
      <div className="text-[11.5px] text-slate mb-3.5">
        Informations confidentielles, visibles uniquement par les administrateurs et le référent handicap désigné.
      </div>
      {requests.map((r) => (
        <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-slate">{format(r.createdAt, "d MMM yyyy", { locale: fr })} · {r.createdByName}</div>
            <Pill tone={ACCOMMODATION_STATUS_TONE[r.status] ?? "warn"}>{ACCOMMODATION_STATUS_LABELS[r.status] ?? r.status}</Pill>
          </div>
          <div className="text-[12.5px] text-ink"><span className="text-slate">Situation : </span>{r.description}</div>
          <div className="text-[12.5px] text-ink"><span className="text-slate">Demande : </span>{r.requestedAccommodations}</div>
          {r.grantedAccommodations && (
            <div className="text-[12.5px] text-ink"><span className="text-slate">Accordé : </span>{r.grantedAccommodations}</div>
          )}
          <AccommodationStatusForm dossierId={dossierId} requestId={r.id} status={r.status} grantedAccommodations={r.grantedAccommodations} />
        </div>
      ))}
      {requests.length === 0 && <div className="text-[12.5px] text-slate py-2">Aucune demande enregistrée.</div>}
      <div className="mt-3.5 pt-3.5 border-t border-line">
        <AccommodationForm dossierId={dossierId} />
      </div>
    </div>
  );
}
