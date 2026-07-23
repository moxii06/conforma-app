import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canWriteRgpd } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InboxMessageActions } from "@/components/InboxMessageActions";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { MailboxActions } from "@/components/MailboxActions";
import { MailboxFilterSelect } from "@/components/MailboxFilterSelect";
import { RgpdSuggestionActions } from "@/components/RgpdSuggestionActions";
import { Role } from "@prisma/client";

const RGPD_REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  erasure: "Effacement",
  portability: "Portabilité",
  rectification: "Rectification",
};

export default async function InboxPage({ searchParams }: { searchParams: { mailbox?: string } }) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "inbox") === "none") redirect("/dashboard");
  const canWrite = can(role, "inbox") !== "none";
  const canHandleRgpd = canWriteRgpd(role);

  const [connections, contacts, members] = await Promise.all([
    prisma.mailboxConnection.findMany({ where: { organizationId }, orderBy: { connectedAt: "asc" } }),
    prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId, status: "active", role: { not: Role.LEARNER } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const mailboxFilter =
    searchParams.mailbox && connections.some((c) => c.id === searchParams.mailbox) ? searchParams.mailbox : undefined;

  const [unsorted, suggested, rgpdSuggested] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { organizationId, contactId: null, ...(mailboxFilter ? { mailboxConnectionId: mailboxFilter } : {}) },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.emailMessage.findMany({
      where: {
        organizationId,
        contactId: { not: null },
        suggestedDossierId: { not: null },
        ...(mailboxFilter ? { mailboxConnectionId: mailboxFilter } : {}),
      },
      include: { contact: true },
      orderBy: { receivedAt: "desc" },
    }),
    canHandleRgpd
      ? prisma.emailMessage.findMany({
          where: { organizationId, rgpdSuggestedType: { not: null } },
          include: { contact: true },
          orderBy: { receivedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Boîte mail" subtitle="Triage des emails entrants" />
      <div className="p-8 flex flex-col gap-6 max-w-3xl">
        <div className="bg-white border border-line rounded-card p-4">
          <div className="text-[13px] font-semibold text-ink mb-2">Boîtes connectées</div>
          {connections.length === 0 ? (
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] text-slate">
                Aucune boîte connectée — les emails ci-dessous sont des données de démonstration. Connecte une
                messagerie depuis la page Intégrations pour trier de vrais emails.
              </div>
              <a
                href="/integrations"
                className="text-[12px] text-ink border border-line rounded-md px-3 py-1.5 hover:bg-[#E6E3DA] shrink-0 ml-3"
              >
                Aller aux Intégrations
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <div className="text-[12.5px] text-ink">
                    {c.provider} — {c.accountEmail}
                  </div>
                  {(c.provider === "gmail" || c.provider === "imap") && canWrite && (
                    <MailboxActions provider={c.provider} connectionId={c.id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canHandleRgpd && (
          <div className="bg-white border border-rust/30 rounded-card p-4">
            <div className="text-[13px] font-semibold text-ink mb-1">Suggestions RGPD ({rgpdSuggested.length})</div>
            <div className="text-[11.5px] text-slate mb-3">
              Détecté automatiquement par l&apos;IA à la synchronisation — vérifiez avant de confirmer, l&apos;échéance
              légale est d&apos;un mois.
            </div>
            {rgpdSuggested.map((m) => (
              <div key={m.id} className="py-3 border-t border-line first:border-t-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12.5px] text-ink font-medium">
                    {m.fromName ? `${m.fromName} — ${m.fromAddress}` : m.fromAddress}
                  </div>
                  <Pill tone="danger">{RGPD_REQUEST_TYPE_LABELS[m.rgpdSuggestedType!] ?? m.rgpdSuggestedType}</Pill>
                </div>
                <div className="text-[12.5px] text-ink mt-0.5">{m.subject}</div>
                {m.rgpdReasoning && <div className="text-[12px] text-slate mt-0.5">{m.rgpdReasoning}</div>}
                <RgpdSuggestionActions
                  messageId={m.id}
                  suggestedType={m.rgpdSuggestedType as "access" | "erasure" | "portability" | "rectification"}
                  defaultPersonLabel={m.contact ? `${m.contact.firstName} ${m.contact.lastName}` : m.fromName || m.fromAddress}
                />
              </div>
            ))}
            {rgpdSuggested.length === 0 && <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>}
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-[13px] font-semibold text-ink">À trier ({unsorted.length})</div>
            <MailboxFilterSelect connections={connections.map((c) => ({ id: c.id, provider: c.provider, accountEmail: c.accountEmail }))} />
          </div>
          {unsorted.map((m) => (
            <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12.5px] text-ink font-medium">
                  {m.fromName ? `${m.fromName} — ${m.fromAddress}` : m.fromAddress}
                </div>
                <div className="text-[11px] text-slate shrink-0">{format(m.receivedAt, "d MMM yyyy HH:mm", { locale: fr })}</div>
              </div>
              <div className="text-[12.5px] text-ink">{m.subject}</div>
              <div className="text-[12px] text-slate">{m.snippet}</div>
              <div className="flex items-center gap-2.5 flex-wrap">
                {canWrite && <InboxMessageActions messageId={m.id} contacts={contacts} fromName={m.fromName} />}
                {canWrite && (
                  <AssignEmailSelect messageId={m.id} members={members} assignedToUserId={m.assignedToUserId} />
                )}
              </div>
            </div>
          ))}
          {unsorted.length === 0 && <div className="text-[12.5px] text-slate">Rien à trier.</div>}
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="text-[13px] font-semibold text-ink mb-3">Suggestions de rattachement à un dossier</div>
          {suggested.map((m) => (
            <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[12.5px] text-ink font-medium">
                  {m.contact?.firstName} {m.contact?.lastName} — {m.subject}
                </div>
                <div className="text-[11.5px] text-slate mt-0.5">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
              </div>
              <div className="flex items-center gap-2.5">
                <Pill tone="neutral">{m.matchBasis === "thread" ? "Suggéré par fil de discussion" : "Suggéré par référence"}</Pill>
                {canWrite && (
                  <AssignEmailSelect messageId={m.id} members={members} assignedToUserId={m.assignedToUserId} />
                )}
              </div>
            </div>
          ))}
          {suggested.length === 0 && <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>}
        </div>
      </div>
    </>
  );
}
