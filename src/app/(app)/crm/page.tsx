import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { PipelineStage } from "@prisma/client";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewOpportunityForm } from "@/components/NewOpportunityForm";
import { OpportunityStageSelect } from "@/components/OpportunityStageSelect";
import { SendNeedsAssessmentButton } from "@/components/SendNeedsAssessmentButton";

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Convention signée",
  SESSION_SCHEDULED: "Session planifiée",
  INVOICED: "Facturé",
};

export default async function CrmPage() {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "crm") === "none") redirect("/dashboard");
  const canWrite = can(role, "crm") !== "none";
  // Spec §2: "Sales / commercial: CRM and pipeline only, limited to their
  // own prospects" — every other role with crm access sees the whole org's
  // pipeline.
  const ownerFilter = role === "SALES" ? { ownerId: userId } : {};

  const [opportunities, contacts] = await Promise.all([
    prisma.opportunity.findMany({
      where: { organizationId, ...ownerFilter },
      include: { contact: true, needsAssessmentRequests: { orderBy: { sentAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  const byStage = Object.values(PipelineStage).map((stage) => ({
    stage,
    items: opportunities.filter((o) => o.stage === stage),
  }));

  return (
    <>
      <PageHeader title="CRM commercial" subtitle="Du premier contact à la facturation" />
      <div className="p-8 flex flex-col gap-4">
        {canWrite && <NewOpportunityForm contacts={contacts} />}
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
                    <div key={o.id} className="bg-white border border-line rounded-md p-3 text-[12.5px] text-ink flex flex-col gap-2">
                      <div>
                        {o.contact.firstName} {o.contact.lastName} — {o.label}
                      </div>
                      {canWrite && (
                        <div className="flex flex-col gap-1.5">
                          <OpportunityStageSelect opportunityId={o.id} stage={o.stage} />
                          <SendNeedsAssessmentButton
                            opportunityId={o.id}
                            alreadySent={Boolean(lastRequest)}
                          />
                          {lastRequest && (
                            <div className="text-[10.5px] text-slate">
                              {lastRequest.status === "completed" ? "Recueil complété" : "Recueil envoyé, en attente"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
