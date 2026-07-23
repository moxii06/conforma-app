import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { PipelineStage, Prisma } from "@prisma/client";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { NewOpportunityForm } from "@/components/NewOpportunityForm";
import { OpportunityStageSelect } from "@/components/OpportunityStageSelect";
import { OpportunityFilterBar } from "@/components/OpportunityFilterBar";
import { SendProspectDocumentDialog } from "@/components/SendProspectDocumentDialog";
import { DeleteOpportunityButton } from "@/components/DeleteOpportunityButton";

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Convention signée",
  SESSION_SCHEDULED: "Session planifiée",
  TO_INVOICE: "À facturer",
  INVOICED: "Facturé",
  PAID: "Payé",
};

function formatAmount(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function buildOrderBy(sort?: string): Prisma.OpportunityOrderByWithRelationInput {
  switch (sort) {
    case "date_asc":
      return { createdAt: "asc" };
    case "amount_desc":
      return { amountCents: "desc" };
    case "amount_asc":
      return { amountCents: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: { view?: string; stage?: string; sort?: string };
}) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "crm") === "none") redirect("/dashboard");
  const canWrite = can(role, "crm") !== "none";
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, emailSignature: true } });
  const signatureHtml = sender.emailSignature ?? `Cordialement,<br>${sender.name}`;
  // Spec §2: "Sales / commercial: CRM and pipeline only, limited to their
  // own prospects" — every other role with crm access sees the whole org's
  // pipeline.
  const ownerFilter = role === "SALES" ? { ownerId: userId } : {};
  // Table is the default — a stacked list stays readable with a large
  // number of prospects in a way the Kanban board doesn't (client feedback:
  // "1 ligne = 1 prospect" should be the primary view, Pipeline a secondary
  // visual option for whoever wants it).
  const view = searchParams.view === "pipeline" ? "pipeline" : "table";
  const stageFilter = searchParams.stage && searchParams.stage in PipelineStage ? (searchParams.stage as PipelineStage) : undefined;
  const orderBy = buildOrderBy(searchParams.sort);

  // A contact reaching PAID gets auto-archived (see the opportunities PATCH
  // route) — hidden from the default view since the deal is closed out, but
  // still reachable by explicitly filtering the table to the Payé stage.
  const hideArchivedContacts = !(view === "table" && stageFilter === PipelineStage.PAID);

  const [opportunities, contacts, courses, templates] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        organizationId,
        ...ownerFilter,
        ...(view === "table" && stageFilter ? { stage: stageFilter } : {}),
        ...(hideArchivedContacts ? { contact: { archivedAt: null } } : {}),
      },
      include: { contact: true, needsAssessmentRequests: { orderBy: { sentAt: "desc" }, take: 1 } },
      orderBy: view === "table" ? orderBy : { createdAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    canWrite
      ? prisma.documentTemplate.findMany({
          where: { OR: [{ organizationId }, { organizationId: null }] },
          select: { id: true, title: true, category: true },
          orderBy: { title: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const byStage = Object.values(PipelineStage).map((stage) => ({
    stage,
    items: opportunities.filter((o) => o.stage === stage),
  }));

  return (
    <>
      <PageHeader title="CRM commercial" subtitle="Du premier contact à la facturation" />
      <div className="flex gap-1 px-8 border-b border-line">
        <Link
          href="/crm"
          className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            view === "table" ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Tableau
        </Link>
        <Link
          href="/crm?view=pipeline"
          className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            view === "pipeline" ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Pipeline
        </Link>
      </div>
      <div className="p-8 flex flex-col gap-4">
        {canWrite && <NewOpportunityForm contacts={contacts} courses={courses} />}

        {view === "table" ? (
          <>
            <OpportunityFilterBar />
            <div className="bg-white border border-line rounded-card overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Prospect</th>
                    <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Formation</th>
                    <th className="text-right font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Montant</th>
                    <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Date</th>
                    <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Étape</th>
                    {canWrite && <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o) => {
                    const lastRequest = o.needsAssessmentRequests[0];
                    return (
                      <tr key={o.id} className="border-b border-line last:border-b-0 hover:bg-[#F7F5F0]">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/crm/contacts/${o.contactId}`} className="font-semibold text-ink hover:underline">
                            {o.contact.firstName} {o.contact.lastName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate max-w-[220px] truncate">{o.label}</td>
                        <td className="px-4 py-3 text-ink font-mono tabular-nums text-right whitespace-nowrap">{formatAmount(o.amountCents)}</td>
                        <td className="px-4 py-3 text-slate whitespace-nowrap">{format(o.createdAt, "d MMM yyyy", { locale: fr })}</td>
                        <td className="px-4 py-3">
                          {canWrite ? <OpportunityStageSelect opportunityId={o.id} stage={o.stage} /> : <Pill tone="neutral">{STAGE_LABELS[o.stage]}</Pill>}
                        </td>
                        {canWrite && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <SendProspectDocumentDialog
                                opportunityId={o.id}
                                alreadySentNeedsAssessment={Boolean(lastRequest)}
                                templates={templates}
                                contactFirstName={o.contact.firstName}
                                signatureHtml={signatureHtml}
                              />
                              <DeleteOpportunityButton opportunityId={o.id} />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {opportunities.length === 0 && <div className="text-[12.5px] text-slate px-4 py-4">Aucun prospect.</div>}
            </div>
          </>
        ) : (
          <div className="flex gap-3.5">
            {byStage.map(({ stage, items }) => (
              <div key={stage} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="text-xs font-bold text-ink uppercase tracking-wide">{STAGE_LABELS[stage]}</div>
                  <div className="text-[11px] text-slate">{items.length}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((o) => {
                    const lastRequest = o.needsAssessmentRequests[0];
                    return (
                      <div key={o.id} className="bg-white border border-line rounded-md p-4 flex flex-col gap-2.5">
                        <div>
                          <Link href={`/crm/contacts/${o.contactId}`} className="text-[13px] font-semibold text-ink hover:underline">
                            {o.contact.firstName} {o.contact.lastName}
                          </Link>
                          <div className="text-[11.5px] text-slate mt-0.5">{o.label}</div>
                        </div>
                        {canWrite && (
                          <div className="flex flex-col gap-1.5">
                            <OpportunityStageSelect opportunityId={o.id} stage={o.stage} />
                            <SendProspectDocumentDialog
                              opportunityId={o.id}
                              alreadySentNeedsAssessment={Boolean(lastRequest)}
                              templates={templates}
                              contactFirstName={o.contact.firstName}
                              signatureHtml={signatureHtml}
                            />
                            {lastRequest && (
                              <div className="text-[10.5px] text-slate">
                                {lastRequest.status === "completed" ? "Recueil complété" : "Recueil envoyé, en attente"}
                              </div>
                            )}
                            <DeleteOpportunityButton opportunityId={o.id} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
