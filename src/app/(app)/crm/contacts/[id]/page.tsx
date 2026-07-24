import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { PipelineStage, DocStatus, Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can, canAccessContact } from "@/lib/tenant";
import { IntentEmailComposer } from "@/components/IntentEmailComposer";
import { EmailReplyComposer } from "@/components/EmailReplyComposer";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { EditCompanyForm } from "@/components/EditCompanyForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Convention signée",
  SESSION_SCHEDULED: "Session planifiée",
  TO_INVOICE: "À facturer",
  INVOICED: "Facturé",
  PAID: "Payé",
};

const DOC_STATUS_TONE: Record<DocStatus, "good" | "warn" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SENT: "warn",
  SIGNED: "good",
  PAID: "good",
  OVERDUE: "danger",
};

const OUTREACH_LABELS: Record<string, string> = {
  contract: "Contrat",
  platform_access: "Accès plateforme",
  message: "Email",
  needs_assessment_reminder: "Rappel recueil des besoins (auto)",
};

function formatAmount(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const TABS = [
  { key: "info", label: "Info" },
  { key: "emails", label: "Emails" },
  { key: "documents", label: "Documents & envois" },
];

export default async function ContactRecordPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "crm") === "none") redirect("/dashboard");
  const activeTab = searchParams.tab ?? "info";

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId },
    include: {
      company: true,
      opportunities: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
      dossiers: { include: { session: { include: { course: true } } }, orderBy: { createdAt: "desc" } },
      clientOutreaches: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!contact) notFound();
  if (!canAccessContact(role, userId, contact.opportunities)) redirect("/crm");

  const canManageEmail = can(role, "inbox") !== "none";
  const canSeePayments = can(role, "invoicing") !== "none";
  const members = canManageEmail
    ? await prisma.user.findMany({
        where: { organizationId, status: "active", role: { not: Role.LEARNER } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const hasUnpaidInvoice = contact.invoices.some((i) => i.status === "SENT" || i.status === "OVERDUE");
  const hasQuote = contact.quotes.length > 0;
  const totalPaid = contact.invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.amountCents, 0);
  const totalDue = contact.invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((sum, i) => sum + i.amountCents, 0);

  return (
    <>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle={contact.company?.name ?? "Particulier"}
      />
      <Tabs basePath={`/crm/contacts/${contact.id}`} tabs={TABS} active={activeTab} />
      <div className="p-8 max-w-xl flex flex-col gap-4">
        {activeTab === "emails" ? (
          <EmailsTab contactId={contact.id} canManageEmail={canManageEmail} members={members} />
        ) : activeTab === "documents" ? (
          <DocumentsAndOutreachTab dossierIds={contact.dossiers.map((d) => d.id)} outreaches={contact.clientOutreaches} />
        ) : (
          <>
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3">Coordonnées</div>
              <div className="text-[13px] text-ink">{contact.email}</div>
              {contact.phone && <div className="text-[13px] text-ink mt-1">{contact.phone}</div>}
            </div>

            {contact.company && (
              <div className="bg-white border border-line rounded-card p-5">
                <div className="text-[13.5px] font-semibold text-ink mb-3">Société</div>
                <EditCompanyForm company={contact.company} />
              </div>
            )}

            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3">Opportunités</div>
              {contact.opportunities.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0">
                  <div className="text-[12.5px] text-ink">{o.label}</div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] text-slate">{formatAmount(o.amountCents)}</span>
                    <Pill tone="neutral">{STAGE_LABELS[o.stage]}</Pill>
                  </div>
                </div>
              ))}
              {contact.opportunities.length === 0 && <div className="text-[12.5px] text-slate">Aucune opportunité.</div>}
            </div>

            {canSeePayments && (
              <div className="bg-white border border-line rounded-card p-5">
                <div className="text-[13.5px] font-semibold text-ink mb-3">Paiement</div>
                <div className="flex gap-4 mb-3">
                  <div>
                    <div className="text-[11px] text-slate">Payé</div>
                    <div className="text-[15px] text-ink font-medium">{formatAmount(totalPaid)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate">En attente</div>
                    <div className="text-[15px] text-ink font-medium">{formatAmount(totalDue)}</div>
                  </div>
                </div>
                {contact.quotes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-line first:border-t-0 text-[12.5px]">
                    <div className="text-ink">Devis {q.reference} — {formatAmount(q.amountCents)}</div>
                    <Pill tone={DOC_STATUS_TONE[q.status]}>{q.status}</Pill>
                  </div>
                ))}
                {contact.invoices.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-line first:border-t-0 text-[12.5px]">
                    <div className="text-ink">Facture {i.reference} — {formatAmount(i.amountCents)}</div>
                    <Pill tone={DOC_STATUS_TONE[i.status]}>{i.status}</Pill>
                  </div>
                ))}
                {contact.quotes.length === 0 && contact.invoices.length === 0 && (
                  <div className="text-[12.5px] text-slate">Aucun devis ni facture.</div>
                )}
              </div>
            )}

            {contact.dossiers.length > 0 && (
              <div className="bg-white border border-line rounded-card p-5">
                <div className="text-[13.5px] font-semibold text-ink mb-3">Dossiers de formation</div>
                {contact.dossiers.map((d) => (
                  <Link
                    key={d.id}
                    href={`/dossiers/${d.id}`}
                    className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-[#EFEDE7] -mx-1 px-1 rounded"
                  >
                    <div className="text-[12.5px] text-ink">{d.session.course.title}</div>
                    <span className="text-[11.5px] text-slate underline decoration-line">Voir le dossier</span>
                  </Link>
                ))}
              </div>
            )}

            {can(role, "crm") !== "none" && (
              <div className="bg-white border border-line rounded-card p-5">
                <div className="text-[13.5px] font-semibold text-ink mb-3">Envoyer un message</div>
                <IntentEmailComposer contactId={contact.id} hasUnpaidInvoice={hasUnpaidInvoice} hasQuote={hasQuote} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

async function EmailsTab({
  contactId,
  canManageEmail,
  members,
}: {
  contactId: string;
  canManageEmail: boolean;
  members: { id: string; name: string }[];
}) {
  const emails = await prisma.emailMessage.findMany({ where: { contactId }, orderBy: { receivedAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Échanges par email</div>
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

async function DocumentsAndOutreachTab({
  dossierIds,
  outreaches,
}: {
  dossierIds: string[];
  outreaches: { id: string; type: string; status: string; sentAt: Date; sentByName: string }[];
}) {
  const documents = dossierIds.length
    ? await prisma.document.findMany({ where: { dossierId: { in: dossierIds } }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <>
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-3.5">Documents</div>
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-line first:border-t-0">
            <a
              href={d.bodyText ? `/api/documents/generated/${d.id}` : d.fileUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink"
            >
              {d.title}
            </a>
            {d.templateOrigin && <Pill tone="neutral">{d.templateOrigin}</Pill>}
          </div>
        ))}
        {documents.length === 0 && <div className="text-[12.5px] text-slate py-2">Aucun document.</div>}
      </div>

      <div className="bg-white border border-line rounded-card p-5 mt-4">
        <div className="text-[13.5px] font-semibold text-ink mb-3.5">Historique des envois</div>
        {outreaches.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 text-[12.5px]">
            <div className="text-ink">
              {OUTREACH_LABELS[o.type] ?? o.type} — {format(o.sentAt, "d MMM yyyy", { locale: fr })} par {o.sentByName}
            </div>
            <Pill tone={o.status === "acknowledged" ? "good" : "neutral"}>{o.status === "acknowledged" ? "Traité" : "En attente"}</Pill>
          </div>
        ))}
        {outreaches.length === 0 && <div className="text-[12.5px] text-slate">Aucun envoi.</div>}
      </div>
    </>
  );
}
