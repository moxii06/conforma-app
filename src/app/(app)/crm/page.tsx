import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard } from "@/components/ui";
import { PipelineStage, Prisma } from "@prisma/client";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewOpportunityForm } from "@/components/NewOpportunityForm";
import { OpportunityFilterBar } from "@/components/OpportunityFilterBar";
import { ImportDataDialog } from "@/components/ImportDataDialog";
import { ArchiveContactButton } from "@/components/ArchiveContactButton";
import { OpportunityTable } from "@/components/OpportunityTable";
import { SearchInput } from "@/components/SearchInput";
import { Pagination } from "@/components/Pagination";
import { FirstVisitBanner } from "@/components/FirstVisitBanner";
import { isYousignConfigured } from "@/lib/yousign";
import { STAGE_LABELS, STAGES_BEFORE_COMPLETION } from "@/lib/pipelineStages";

function formatAmount(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// Client feedback: clicking a name from the CRM landed on /crm/contacts/[id]
// even for someone already enrolled, a differently-tabbed page from
// /dossiers/[id] — two places to edit the same person's info. Once a
// contact has at least one Dossier, that IS the canonical page now (its
// own Formations tab already lists every one of their formations, see
// dossiers/[id]/page.tsx) — only a pure prospect with no Dossier yet still
// goes to the CRM contact record, since there's nothing dossier-shaped to
// show them. Most recent session first, matching FormationsTab's own
// ordering, so the dossier landed on is the same one it opens expanded.
function contactHref(contact: { id: string; dossiers: { id: string }[] }): string {
  return contact.dossiers.length > 0 ? `/dossiers/${contact.dossiers[0].id}` : `/crm/contacts/${contact.id}`;
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

// Même pas que /dossiers et /facturation. L'écran chargeait la totalité du
// pipeline — tenable à cinquante prospects, plus du tout à plusieurs
// milliers (audit S7, P1 n°5).
const PAGE_SIZE = 30;

export default async function CrmPage(
  props: {
    searchParams: Promise<{ view?: string; stage?: string; sort?: string; q?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
  // visual option for whoever wants it). Archives is a third, explicit view:
  // a contact archived (manually or auto-archived on reaching PAID) never
  // appears in Table/Pipeline, only here — client feedback wanted a real
  // "archives" tab rather than the previous "filter the table to Payé"
  // workaround.
  // L'ancien onglet "Pipeline" (kanban 7 colonnes, sans glisser-déposer) a
  // été retiré : mêmes données et mêmes actions que le tableau, en moins
  // lisible, et la vue d'ensemble par étape existe déjà sur le dashboard
  // ("Pipeline commercial par étape"). Un ?view=pipeline retombe ici sur
  // le tableau.
  const view = searchParams.view === "archives" ? "archives" : "table";
  const stageFilter = searchParams.stage && searchParams.stage in PipelineStage ? (searchParams.stage as PipelineStage) : undefined;
  const orderBy = buildOrderBy(searchParams.sort);
  const q = searchParams.q?.trim() || undefined;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // `contact` porte SEULEMENT le filtre d'archive, et la recherche vit dans
  // un OR séparé que Prisma combine en ET avec lui. Écrire les deux dans le
  // même objet `contact` reviendrait à exiger que le nom corresponde ET que
  // l'intitulé corresponde : chercher « Excel » ne trouverait plus rien.
  const where: Prisma.OpportunityWhereInput = {
    organizationId,
    ...ownerFilter,
    ...(view === "table" && stageFilter ? { stage: stageFilter } : {}),
    contact: { archivedAt: view === "archives" ? { not: null } : null },
    ...(q
      ? {
          OR: [
            // L'intitulé de l'affaire compte autant que le nom : « formation
            // Excel » s'écrit là, et pas dans la fiche du contact.
            { label: { contains: q, mode: "insensitive" } },
            { contact: { firstName: { contains: q, mode: "insensitive" } } },
            { contact: { lastName: { contains: q, mode: "insensitive" } } },
            { contact: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [opportunities, total, contacts, courses, templates, pipelineTotals] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            notes: true,
            dossiers: { select: { id: true }, orderBy: { session: { startsAt: "desc" } }, take: 1 },
          },
        },
        needsAssessmentRequests: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: view === "archives" ? { contact: { archivedAt: "desc" } } : view === "table" ? orderBy : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.opportunity.count({ where }),
    // Le choix d'un contact existant passe désormais par la recherche
    // serveur (ContactSearchInput) — il ne reste à charger qu'UN contact,
    // juste pour savoir si l'onglet « Contact existant » a un sens.
    prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 1,
    }),
    prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    canWrite
      ? prisma.documentTemplate.findMany({
          where: { OR: [{ organizationId }, { organizationId: null }] },
          select: { id: true, title: true, category: true },
          orderBy: { title: "asc" },
        })
      : Promise.resolve([]),
    // Summary strip totals: same scope as the table (org + owner for SALES,
    // non-archived) but deliberately NOT the stage filter — the strip stays
    // stable while the table narrows, so the numbers keep meaning "my whole
    // pipeline".
    prisma.opportunity.groupBy({
      by: ["stage"],
      where: { organizationId, ...ownerFilter, contact: { archivedAt: null } },
      _count: true,
      _sum: { amountCents: true },
    }),
  ]);
  const eSignatureAvailable = canWrite ? await isYousignConfigured(organizationId) : false;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stageSum = (stages: PipelineStage[]) =>
    pipelineTotals.filter((g) => stages.includes(g.stage)).reduce((sum, g) => sum + (g._sum.amountCents ?? 0), 0);
  const activeCount = pipelineTotals.reduce((sum, g) => sum + g._count, 0);
  // Audit P1 : deux montants commerciaux, plus trois cases financières —
  // « en cours » (tout ce qui n'est pas clos) et « conclu ».
  const inProgressCents = stageSum(STAGES_BEFORE_COMPLETION);
  const completedCents = stageSum([PipelineStage.COMPLETED]);

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
          href="/crm?view=archives"
          className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            view === "archives" ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Archives
        </Link>
      </div>
      <div className="p-8 flex flex-col gap-4">
        {view !== "archives" && (
          <FirstVisitBanner id="crm">
            Chaque prospect avance ici du premier contact jusqu&apos;au paiement — changez son étape à mesure qu&apos;il
            progresse. Tout l&apos;historique (emails, documents envoyés) reste sur sa fiche.
          </FirstVisitBanner>
        )}
        {view === "table" && (
          <div className="flex gap-3.5">
            <MetricCard label="Prospects actifs" value={String(activeCount)} />
            <MetricCard label="En cours" value={formatAmount(inProgressCents)} hint="du premier contact à la formation en cours" />
            <MetricCard label="Conclu" value={formatAmount(completedCents)} tone="good" href="/crm?stage=COMPLETED" />
            <MetricCard label="Suivi des règlements" value="Facturation" hint="factures émises, payées, en retard" href="/facturation?tab=factures" />
          </div>
        )}
        {canWrite && view !== "archives" && (
          <div className="flex items-start gap-2.5">
            <NewOpportunityForm contacts={contacts} courses={courses} />
            {can(role, "crm") === "full" && (
              <ImportDataDialog
                kind="contacts"
                courses={courses}
                triggerClassName="inline-flex items-center gap-1.5 bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft"
              />
            )}
          </div>
        )}

        {/* La recherche vaut pour les deux vues : retrouver un client archivé
            par son nom est exactement ce qu'on vient faire dans « Archives ». */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <SearchInput placeholder="Rechercher un prospect (nom, email, intitulé)…" />
          <div className="text-[12px] text-slate">
            {total} {view === "archives" ? "archivé" : "prospect"}
            {total > 1 ? "s" : ""}
          </div>
        </div>

        {view === "archives" ? (
          <div className="bg-white border border-line rounded-card overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Prospect</th>
                  <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Formation</th>
                  <th className="text-right font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Montant</th>
                  <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Étape</th>
                  {canWrite && <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-b-0 hover:bg-mist">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={contactHref(o.contact)}
                        className="font-semibold text-ink hover:underline"
                        title={o.contact.dossiers.length > 0 ? "Ouvre le dossier de formation" : "Ouvre la fiche prospect"}
                      >
                        {o.contact.firstName} {o.contact.lastName}
                      </Link>
                      {o.contact.dossiers.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-seal-dark align-middle whitespace-nowrap">→ dossier de formation</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate max-w-[220px] truncate">{o.label}</td>
                    <td className="px-4 py-3 text-ink font-mono tabular-nums text-right whitespace-nowrap">{formatAmount(o.amountCents)}</td>
                    <td className="px-4 py-3">
                      <Pill tone="neutral">{STAGE_LABELS[o.stage]}</Pill>
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <ArchiveContactButton contactId={o.contactId} archived />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {opportunities.length === 0 && (
              <div className="text-[12.5px] text-slate px-4 py-4">
                {q ? "Aucun contact archivé ne correspond à cette recherche." : "Aucun contact archivé."}
              </div>
            )}
          </div>
        ) : (
          <>
            <OpportunityFilterBar />
            <OpportunityTable
              opportunities={opportunities}
              canWrite={canWrite}
              templates={templates}
              signatureHtml={signatureHtml}
              eSignatureAvailable={eSignatureAvailable}
            />
          </>
        )}
        <Pagination
          basePath="/crm"
          searchParams={{ view: searchParams.view, stage: searchParams.stage, sort: searchParams.sort, q, page: searchParams.page }}
          page={page}
          totalPages={totalPages}
        />
      </div>
    </>
  );
}
