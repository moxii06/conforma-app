import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewQuoteForm } from "@/components/NewQuoteForm";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import { DocStatusSelect, statusLabels } from "@/components/DocStatusSelect";
import { DocFilterBar } from "@/components/DocFilterBar";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { CreatePaymentLinkButton } from "@/components/CreatePaymentLinkButton";
import { BankStatementImportDialog } from "@/components/BankStatementImportDialog";
import { BankTransactionReview } from "@/components/BankTransactionReview";
import { BankConnectionPanel } from "@/components/BankConnectionPanel";
import { isStripeConfigured } from "@/lib/stripe";
import { isBridgeConfigured } from "@/lib/bridge";
import { rankInvoiceMatches, CONFIDENT_MATCH_THRESHOLD } from "@/lib/bankReconciliation";
import { FundersPanel } from "@/components/FundersPanel";
import { DocStatus, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_TONE: Record<DocStatus, "good" | "warn" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SENT: "warn",
  SIGNED: "good",
  PAID: "good",
  OVERDUE: "danger",
};

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function buildOrderBy(sort?: string): Prisma.QuoteOrderByWithRelationInput | Prisma.InvoiceOrderByWithRelationInput {
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

// Parses a `?from=`/`?to=` URL param (yyyy-mm-dd, from an <input type="date">)
// into a Date usable in a Prisma `createdAt` range filter — `to` is bumped to
// the end of that calendar day so "01/07 au 31/07" actually includes every
// invoice created on the 31st, not just up to midnight.
function parseDateParam(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return isNaN(date.getTime()) ? undefined : date;
}

export default async function FacturationPage(
  props: {
    searchParams: Promise<{ tab?: string; status?: string; sort?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "invoicing") === "none") redirect("/dashboard");
  const canWrite = can(role, "invoicing") !== "none";
  const activeTab = searchParams.tab ?? "devis";
  const statusFilter = searchParams.status && searchParams.status in DocStatus ? (searchParams.status as DocStatus) : undefined;
  const orderBy = buildOrderBy(searchParams.sort);
  const dateFrom = parseDateParam(searchParams.from, false);
  const dateTo = parseDateParam(searchParams.to, true);

  const [contacts, dossiers, pendingBankCount] = await Promise.all([
    prisma.contact.findMany({ where: { organizationId }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }),
    prisma.dossier.findMany({
      where: { organizationId },
      include: { contact: true, session: { include: { course: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bankTransaction.count({ where: { organizationId, status: "pending" } }),
  ]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    label: `${d.contact.firstName} ${d.contact.lastName} — ${d.session.course.title}`,
  }));
  const tabs = [
    { key: "devis", label: "Devis" },
    { key: "factures", label: "Factures" },
    { key: "a-valider", label: pendingBankCount > 0 ? `À valider (${pendingBankCount})` : "À valider" },
    { key: "financeurs", label: "Financeurs" },
  ];

  // Loaded only for its own tab: three extra queries on every invoice page
  // view, for a referential most people open twice a year, isn't a trade
  // worth making.
  const funderRows =
    activeTab === "financeurs"
      ? await prisma.funder.findMany({
          where: { organizationId },
          orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
          include: {
            commitments: { select: { amountCents: true, status: true, dossierId: true } },
          },
        })
      : [];

  return (
    <>
      <PageHeader title="Facturation" subtitle="Devis et factures, transmission via le portail public par défaut" />
      <Tabs basePath="/facturation" tabs={tabs} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        {activeTab === "financeurs" ? (
          <FundersPanel
            canWrite={canWrite}
            funders={funderRows.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              contactEmail: f.contactEmail,
              contactPhone: f.contactPhone,
              hourlyRateCents: f.hourlyRateCents,
              maxAmountCents: f.maxAmountCents,
              archivedAt: f.archivedAt ? f.archivedAt.toISOString() : null,
              // Distinct dossiers, not commitments: nothing stops two lines
              // from the same funder on one dossier (a top-up, a correction),
              // and the label says "dossier".
              usageCount: new Set(f.commitments.map((c) => c.dossierId)).size,
              // Same rule as computeFundingSummary: only agreed money counts.
              securedCents: f.commitments
                .filter((c) => ["granted", "invoiced", "paid"].includes(c.status))
                .reduce((sum, c) => sum + c.amountCents, 0),
            }))}
          />
        ) : activeTab === "a-valider" ? (
          canWrite ? (
            <BankValidationTab organizationId={organizationId} />
          ) : null
        ) : (
          <>
            <DocFilterBar />
            {activeTab === "factures" ? (
              <InvoicesTab organizationId={organizationId} canWrite={canWrite} contacts={contacts} dossierOptions={dossierOptions} statusFilter={statusFilter} orderBy={orderBy} dateFrom={dateFrom} dateTo={dateTo} />
            ) : (
              <QuotesTab organizationId={organizationId} canWrite={canWrite} contacts={contacts} dossierOptions={dossierOptions} statusFilter={statusFilter} orderBy={orderBy} dateFrom={dateFrom} dateTo={dateTo} />
            )}
          </>
        )}
      </div>
    </>
  );
}

async function BankValidationTab({ organizationId }: { organizationId: string }) {
  const [pending, openInvoices, connections] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { organizationId, status: "pending" },
      orderBy: { bookedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["SENT", "OVERDUE", "SIGNED"] } },
      include: { contact: { include: { company: true } }, payments: true },
    }),
    isBridgeConfigured() ? prisma.bankConnection.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);

  const invoiceCandidates = openInvoices.map((inv) => ({
    id: inv.id,
    reference: inv.reference,
    amountCents: inv.amountCents,
    paidCents: inv.payments.reduce((sum, p) => sum + p.amountCents, 0),
    createdAt: inv.createdAt,
    contact: { firstName: inv.contact.firstName, lastName: inv.contact.lastName, company: inv.contact.company },
  }));
  const invoiceById = new Map(openInvoices.map((inv) => [inv.id, inv]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-slate leading-relaxed max-w-lg">
          Chaque virement reçu ne porte jamais de référence facture fiable — Jalon propose un rapprochement, à valider
          en un clic. Rien n&apos;est jamais associé automatiquement.
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isBridgeConfigured() && (
            <BankConnectionPanel
              connections={connections.map((c) => ({
                id: c.id,
                institutionName: c.institutionName,
                status: c.status,
                lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
              }))}
            />
          )}
          <BankStatementImportDialog />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {pending.map((tx) => {
          const ranked = rankInvoiceMatches(
            { amountCents: tx.amountCents, bookedAt: tx.bookedAt, label: tx.label, counterpartyName: tx.counterpartyName },
            invoiceCandidates
          );
          const suggestions = ranked.map((m) => {
            const inv = invoiceById.get(m.invoiceId)!;
            const paidCents = inv.payments.reduce((sum, p) => sum + p.amountCents, 0);
            return {
              id: inv.id,
              reference: inv.reference,
              contactName: `${inv.contact.firstName} ${inv.contact.lastName}`,
              remainingCents: inv.amountCents - paidCents,
              score: m.score,
              reasons: m.reasons,
            };
          });
          return (
            <BankTransactionReview
              key={tx.id}
              transactionId={tx.id}
              bookedAt={format(tx.bookedAt, "d MMM yyyy", { locale: fr })}
              amountCents={tx.amountCents}
              label={tx.label}
              suggestions={suggestions}
              confident={(ranked[0]?.score ?? 0) >= CONFIDENT_MATCH_THRESHOLD}
            />
          );
        })}
        {pending.length === 0 && (
          <div className="text-[12.5px] text-slate">Aucune transaction en attente — importez un relevé pour commencer.</div>
        )}
      </div>
    </div>
  );
}

async function QuotesTab({
  organizationId,
  canWrite,
  contacts,
  dossierOptions,
  statusFilter,
  orderBy,
  dateFrom,
  dateTo,
}: {
  organizationId: string;
  canWrite: boolean;
  contacts: { id: string; firstName: string; lastName: string }[];
  dossierOptions: { id: string; label: string }[];
  statusFilter?: DocStatus;
  orderBy: Prisma.QuoteOrderByWithRelationInput;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const quotes = await prisma.quote.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(dateFrom || dateTo ? { createdAt: { gte: dateFrom, lte: dateTo } } : {}),
    },
    include: { contact: true },
    orderBy,
  });

  return (
    <div className="flex flex-col gap-4">
      {canWrite && <NewQuoteForm contacts={contacts} dossiers={dossierOptions} />}
      <div className="flex flex-col gap-2">
        {quotes.map((q) => (
          <div key={q.id} className="bg-white border border-line rounded-card px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-ink truncate">{q.contact.firstName} {q.contact.lastName}</div>
              <div className="text-[12px] text-slate mt-1.5 truncate">
                {q.reference} · {formatAmount(q.amountCents)} · {format(q.createdAt, "d MMM yyyy", { locale: fr })}
              </div>
            </div>
            <div className="shrink-0">
              {canWrite ? <DocStatusSelect kind="quotes" id={q.id} status={q.status} /> : <Pill tone={STATUS_TONE[q.status]}>{statusLabels("quotes")[q.status]}</Pill>}
            </div>
          </div>
        ))}
        {quotes.length === 0 && <div className="text-[12.5px] text-slate">Aucun devis enregistré.</div>}
      </div>
    </div>
  );
}

async function InvoicesTab({
  organizationId,
  canWrite,
  contacts,
  dossierOptions,
  statusFilter,
  orderBy,
  dateFrom,
  dateTo,
}: {
  organizationId: string;
  canWrite: boolean;
  contacts: { id: string; firstName: string; lastName: string }[];
  dossierOptions: { id: string; label: string }[];
  statusFilter?: DocStatus;
  orderBy: Prisma.InvoiceOrderByWithRelationInput;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const [invoices, stripeConfigured] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        ...(dateFrom || dateTo ? { createdAt: { gte: dateFrom, lte: dateTo } } : {}),
        // "En retard" (from DocFilterBar or the dashboard's "Factures en
        // retard" card) means the same auto-detected set as
        // dashboardTasks.ts and the dashboard total, not a strict status
        // match — otherwise an invoice overdue by dueDate but still
        // status SENT would show in the dashboard count but vanish from
        // this filtered list.
        ...(statusFilter === "OVERDUE"
          ? { status: { notIn: ["PAID", "DRAFT"] }, OR: [{ status: "OVERDUE" }, { dueDate: { lt: new Date() } }] }
          : statusFilter
            ? { status: statusFilter }
            : {}),
      },
      include: { contact: true, payments: true },
      orderBy,
    }),
    isStripeConfigured(organizationId),
  ]);
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      {canWrite && <NewInvoiceForm contacts={contacts} dossiers={dossierOptions} />}
      <div className="flex flex-col gap-2">
        {invoices.map((inv) => {
          const totalPaidCents = inv.payments.reduce((sum, p) => sum + p.amountCents, 0);
          // Computed live so a passed due date reads as overdue immediately,
          // without staff needing to remember to flip status to OVERDUE by
          // hand — see dashboardTasks.ts, which now detects the same thing.
          const isOverdue = inv.status !== "PAID" && inv.status !== "DRAFT" && (inv.status === "OVERDUE" || (inv.dueDate !== null && inv.dueDate < now));
          return (
            <div key={inv.id} className="bg-white border border-line rounded-card px-5 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate">{inv.contact.firstName} {inv.contact.lastName}</div>
                  <div className="text-[12px] text-slate mt-1.5 truncate">
                    {inv.reference} · {formatAmount(inv.amountCents)}
                    {inv.dueDate && ` · éch. ${format(inv.dueDate, "d MMM yyyy", { locale: fr })}`}
                    {inv.einvoicingProvider && ` · ${inv.einvoicingProvider.toUpperCase()}`}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {isOverdue && inv.status !== "OVERDUE" && <Pill tone="danger">En retard</Pill>}
                  {canWrite ? <DocStatusSelect kind="invoices" id={inv.id} status={inv.status} /> : <Pill tone={STATUS_TONE[inv.status]}>{statusLabels("invoices")[inv.status]}</Pill>}
                </div>
              </div>
              {canWrite && inv.status !== "DRAFT" && (
                <div className="flex items-center gap-4 flex-wrap mt-2.5 pt-2.5 border-t border-line">
                  <RecordPaymentForm invoiceId={inv.id} amountCents={inv.amountCents} totalPaidCents={totalPaidCents} />
                  {stripeConfigured && inv.status !== "PAID" && <CreatePaymentLinkButton invoiceId={inv.id} />}
                </div>
              )}
            </div>
          );
        })}
        {invoices.length === 0 && <div className="text-[12.5px] text-slate">Aucune facture enregistrée.</div>}
      </div>
    </div>
  );
}
