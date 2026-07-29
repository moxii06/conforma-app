import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, InfoRow } from "@/components/ui";
import { PipelineStage, DocStatus, Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can, canAccessContact } from "@/lib/tenant";
import { IntentEmailComposer } from "@/components/IntentEmailComposer";
import { EmailReplyComposer } from "@/components/EmailReplyComposer";
import { NewEmailComposer } from "@/components/NewEmailComposer";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { EditCompanyForm } from "@/components/EditCompanyForm";
import { EditContactForm } from "@/components/EditContactForm";
import { EditLearnerCategoryForm } from "@/components/EditLearnerCategoryForm";
import { LEARNER_CATEGORY_LABELS, LEARNER_CATEGORY_SINGULAR } from "@/lib/bpfCategories";
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
  contract_reminder: "Rappel convention (auto)",
  rolling_duration_reminder: "Rappel durée d'accès (auto)",
  satisfaction_reminder: "Rappel satisfaction (auto)",
  session_reminder: "Rappel de session (auto)",
  certificate_expiring: "Rappel de renouvellement (auto)",
};

function formatAmount(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const TABS = [
  { key: "info", label: "Info" },
  { key: "activite", label: "Activité" },
  { key: "emails", label: "Emails" },
  { key: "documents", label: "Documents & envois" },
];

export default async function ContactRecordPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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

  const initials = `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase();
  const latestOpportunity = contact.opportunities[0] ?? null;
  const categoryPill = contact.defaultLearnerCategory ? LEARNER_CATEGORY_SINGULAR[contact.defaultLearnerCategory] : null;

  return (
    <>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle={contact.company?.name ?? LEARNER_CATEGORY_LABELS[contact.defaultLearnerCategory ?? "unset"]}
      />
      <Tabs basePath={`/crm/contacts/${contact.id}`} tabs={TABS} active={activeTab} />
      <div className="p-8 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
          <div className="bg-white border border-line rounded-card p-5 lg:sticky lg:top-6">
            <Avatar initials={initials} />
            <div className="font-display text-[18px] text-ink mt-3">
              {contact.firstName} {contact.lastName}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {latestOpportunity && <Pill tone={latestOpportunity.stage === "PAID" ? "good" : "neutral"}>{STAGE_LABELS[latestOpportunity.stage]}</Pill>}
              {categoryPill && <Pill tone="neutral">{categoryPill}</Pill>}
            </div>
            {canSeePayments && (totalPaid > 0 || totalDue > 0) && (
              <div className="mt-4">
                <div className="text-[12px] text-slate mb-1">Total payé</div>
                <div className="text-2xl font-mono font-semibold tabular-nums text-ink">{formatAmount(totalPaid)}</div>
                {totalDue > 0 && <div className="text-[11.5px] text-slate mt-1">{formatAmount(totalDue)} en attente de paiement</div>}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-line flex flex-col gap-2.5">
              {contact.company && <InfoRow label="Entreprise">{contact.company.name}</InfoRow>}
              {contact.phone && <InfoRow label="Téléphone">{contact.phone}</InfoRow>}
              <InfoRow label="Email">
                <span className="break-all">{contact.email}</span>
              </InfoRow>
              <InfoRow label="Opportunités">{contact.opportunities.length}</InfoRow>
              <InfoRow label="Formations">
                {contact.dossiers.length > 0 ? (
                  <Link href={`/dossiers/${contact.dossiers[0].id}`} className="underline decoration-line hover:decoration-ink">
                    {contact.dossiers.length} dossier{contact.dossiers.length > 1 ? "s" : ""}
                  </Link>
                ) : (
                  "Aucune"
                )}
              </InfoRow>
            </div>
          </div>

          <div className="flex flex-col gap-4">
        {activeTab === "emails" ? (
          <EmailsTab contactId={contact.id} canManageEmail={canManageEmail} members={members} />
        ) : activeTab === "documents" ? (
          <DocumentsAndOutreachTab dossierIds={contact.dossiers.map((d) => d.id)} outreaches={contact.clientOutreaches} />
        ) : activeTab === "activite" ? (
          <ActivityTab contact={contact} canSeePayments={canSeePayments} />
        ) : (
          <>
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3">Coordonnées</div>
              <EditContactForm contact={{ id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, address: contact.address }} />
            </div>

            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3">Catégorie apprenant (BPF)</div>
              <EditLearnerCategoryForm contactId={contact.id} learnerCategory={contact.defaultLearnerCategory} company={contact.company} />
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
                    className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
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
        </div>
      </div>
    </>
  );
}

// Chronological feed built entirely from records that already exist
// (outreaches, emails, documents, quotes/invoices, enrollments) — no
// separate activity-log model to keep in sync.
async function ActivityTab({
  contact,
  canSeePayments,
}: {
  contact: {
    id: string;
    firstName: string;
    clientOutreaches: { id: string; type: string; status: string; sentAt: Date; sentByName: string }[];
    quotes: { id: string; reference: string; amountCents: number; status: DocStatus; createdAt: Date }[];
    invoices: { id: string; reference: string; amountCents: number; status: DocStatus; createdAt: Date }[];
    dossiers: { id: string; createdAt: Date; session: { course: { title: string } } }[];
  };
  canSeePayments: boolean;
}) {
  const emails = await prisma.emailMessage.findMany({
    where: { contactId: contact.id },
    orderBy: { receivedAt: "desc" },
    select: { id: true, subject: true, direction: true, receivedAt: true },
    take: 50,
  });

  type Event = { id: string; at: Date; text: string; meta: string; dot: "sage" | "seal" | "slate" };
  const events: Event[] = [
    ...contact.clientOutreaches.map((o): Event => ({
      id: `o-${o.id}`,
      at: o.sentAt,
      text: `${OUTREACH_LABELS[o.type] ?? o.type} envoyé`,
      meta: `${o.sentByName} · ${format(o.sentAt, "d MMM yyyy, HH:mm", { locale: fr })}`,
      dot: o.status === "acknowledged" ? "sage" : "seal",
    })),
    ...emails.map((m): Event => ({
      id: `m-${m.id}`,
      at: m.receivedAt,
      text: m.direction === "in" ? `Email reçu — « ${m.subject} »` : `Email envoyé — « ${m.subject} »`,
      meta: format(m.receivedAt, "d MMM yyyy, HH:mm", { locale: fr }),
      dot: "slate",
    })),
    ...contact.dossiers.map((d): Event => ({
      id: `d-${d.id}`,
      at: d.createdAt,
      text: `Inscrit à la formation « ${d.session.course.title} »`,
      meta: format(d.createdAt, "d MMM yyyy", { locale: fr }),
      dot: "sage",
    })),
    ...(canSeePayments
      ? [
          ...contact.quotes.map((q): Event => ({
            id: `q-${q.id}`,
            at: q.createdAt,
            text: `Devis ${q.reference} — ${formatAmount(q.amountCents)}`,
            meta: format(q.createdAt, "d MMM yyyy", { locale: fr }),
            dot: "seal",
          })),
          ...contact.invoices.map((i): Event => ({
            id: `i-${i.id}`,
            at: i.createdAt,
            text: `Facture ${i.reference} — ${formatAmount(i.amountCents)}${i.status === "PAID" ? " (payée)" : ""}`,
            meta: format(i.createdAt, "d MMM yyyy", { locale: fr }),
            dot: i.status === "PAID" ? "sage" : "seal",
          })),
        ]
      : []),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const DOT_CLASSES: Record<Event["dot"], string> = {
    sage: "bg-sage",
    seal: "bg-seal-light",
    slate: "bg-ash",
  };

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[13.5px] font-semibold text-ink">Activité</div>
        <div className="text-[12px] text-slate">{events.length} événement{events.length > 1 ? "s" : ""}</div>
      </div>
      <div className="flex flex-col">
        {events.map((e, i) => (
          <div key={e.id} className="flex gap-3 pb-4 relative">
            {i < events.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" />}
            <span className={`w-[11px] h-[11px] rounded-full mt-0.5 shrink-0 z-10 ${DOT_CLASSES[e.dot]}`} />
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink leading-snug">{e.text}</div>
              <div className="text-[11px] text-slate mt-0.5">{e.meta}</div>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="text-[12.5px] text-slate">Aucune activité pour l&apos;instant — les envois, emails et inscriptions de {contact.firstName} apparaîtront ici.</div>
        )}
      </div>
    </div>
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
      {canManageEmail && <NewEmailComposer contactId={contactId} />}
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
