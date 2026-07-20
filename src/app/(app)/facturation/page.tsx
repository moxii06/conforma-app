import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewQuoteForm } from "@/components/NewQuoteForm";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import { DocStatusSelect } from "@/components/DocStatusSelect";
import { DocStatus } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const TABS = [
  { key: "devis", label: "Devis" },
  { key: "factures", label: "Factures" },
];

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

export default async function FacturationPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "invoicing") === "none") redirect("/dashboard");
  const canWrite = can(role, "invoicing") !== "none";
  const activeTab = searchParams.tab ?? "devis";

  const [contacts, dossiers] = await Promise.all([
    prisma.contact.findMany({ where: { organizationId }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }),
    prisma.dossier.findMany({
      where: { organizationId },
      include: { contact: true, session: { include: { course: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    label: `${d.contact.firstName} ${d.contact.lastName} — ${d.session.course.title}`,
  }));

  return (
    <>
      <PageHeader title="Facturation" subtitle="Devis et factures, transmission via le portail public par défaut" />
      <Tabs basePath="/facturation" tabs={TABS} active={activeTab} />
      <div className="p-8">
        {activeTab === "factures" ? (
          <InvoicesTab organizationId={organizationId} canWrite={canWrite} contacts={contacts} dossierOptions={dossierOptions} />
        ) : (
          <QuotesTab organizationId={organizationId} canWrite={canWrite} contacts={contacts} dossierOptions={dossierOptions} />
        )}
      </div>
    </>
  );
}

async function QuotesTab({
  organizationId,
  canWrite,
  contacts,
  dossierOptions,
}: {
  organizationId: string;
  canWrite: boolean;
  contacts: { id: string; firstName: string; lastName: string }[];
  dossierOptions: { id: string; label: string }[];
}) {
  const quotes = await prisma.quote.findMany({
    where: { organizationId },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      {canWrite && <NewQuoteForm contacts={contacts} dossiers={dossierOptions} />}
      <div className="bg-white border border-line rounded-card p-5">
        <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
          <div className="flex-1">Référence</div>
          <div className="flex-[1.4]">Contact</div>
          <div className="flex-1">Montant</div>
          <div className="flex-1">Date</div>
          <div className="flex-[0.8]">Statut</div>
        </div>
        {quotes.map((q) => (
          <div key={q.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
            <div className="flex-1">{q.reference}</div>
            <div className="flex-[1.4] text-slate">{q.contact.firstName} {q.contact.lastName}</div>
            <div className="flex-1">{formatAmount(q.amountCents)}</div>
            <div className="flex-1 text-slate">{format(q.createdAt, "d MMM yyyy", { locale: fr })}</div>
            <div className="flex-[0.8]">
              {canWrite ? <DocStatusSelect kind="quotes" id={q.id} status={q.status} /> : <Pill tone={STATUS_TONE[q.status]}>{q.status}</Pill>}
            </div>
          </div>
        ))}
        {quotes.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun devis enregistré.</div>}
      </div>
    </div>
  );
}

async function InvoicesTab({
  organizationId,
  canWrite,
  contacts,
  dossierOptions,
}: {
  organizationId: string;
  canWrite: boolean;
  contacts: { id: string; firstName: string; lastName: string }[];
  dossierOptions: { id: string; label: string }[];
}) {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      {canWrite && <NewInvoiceForm contacts={contacts} dossiers={dossierOptions} />}
      <div className="bg-white border border-line rounded-card p-5">
        <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
          <div className="flex-1">Référence</div>
          <div className="flex-[1.4]">Contact</div>
          <div className="flex-1">Montant</div>
          <div className="flex-1">Transmission</div>
          <div className="flex-[0.8]">Statut</div>
        </div>
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
            <div className="flex-1">{inv.reference}</div>
            <div className="flex-[1.4] text-slate">{inv.contact.firstName} {inv.contact.lastName}</div>
            <div className="flex-1">{formatAmount(inv.amountCents)}</div>
            <div className="flex-1 text-slate uppercase">{inv.einvoicingProvider ?? "—"}</div>
            <div className="flex-[0.8]">
              {canWrite ? <DocStatusSelect kind="invoices" id={inv.id} status={inv.status} /> : <Pill tone={STATUS_TONE[inv.status]}>{inv.status}</Pill>}
            </div>
          </div>
        ))}
        {invoices.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune facture enregistrée.</div>}
      </div>
    </div>
  );
}
