import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, initialsOf, Button } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
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

export default async function InboxPage(props: { searchParams: Promise<{ mailbox?: string; tab?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "inbox") === "none") redirect("/dashboard");
  const canWrite = can(role, "inbox") !== "none";
  const canHandleRgpd = canWriteRgpd(role);
  const activeTab = searchParams.tab ?? "a-trier";
  if (activeTab === "rgpd" && !canHandleRgpd) redirect("/inbox");

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

  const tabs = [
    { key: "a-trier", label: `À trier (${unsorted.length})` },
    ...(canHandleRgpd ? [{ key: "rgpd", label: `RGPD (${rgpdSuggested.length})` }] : []),
    { key: "rattachements", label: `Rattachements (${suggested.length})` },
  ];

  // Sans boîte connectée ET sans le moindre email, l'écran de triage est une
  // pièce vide : trois onglets à zéro, un filtre par boîte qui n'a rien à
  // filtrer, et un bandeau qui annonçait des « emails de démonstration
  // ci-dessous » qu'un organisme réel n'a jamais eus. On explique plutôt ce
  // que la connexion apporte, une fois. Le jeu de démo, lui, a des emails
  // sans connexion : il continue de montrer le triage, ce qui est le but.
  if (connections.length === 0 && unsorted.length + suggested.length + rgpdSuggested.length === 0) {
    const peutConnecter = can(role, "integrations") === "full";
    return (
      <>
        <PageHeader title="Boîte mail" subtitle="Triage des emails entrants" />
        <div className="p-8 max-w-xl">
          <div className="bg-white border border-line rounded-card p-6 flex flex-col gap-4">
            <div>
              <div className="text-[14px] font-semibold text-ink mb-1">Aucune boîte mail connectée</div>
              <div className="text-[12.5px] text-slate leading-relaxed">
                Jalon ne lit rien tant que vous n&apos;avez pas connecté une adresse. Une fois connectée, chaque email
                entrant est rapproché du bon dossier, et vous répondez sans quitter la fiche du client.
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink">
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Les échanges se rangent tout seuls dans le dossier de l&apos;apprenant — c&apos;est la trace qu&apos;un
                auditeur demande.
              </li>
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Une demande RGPD noyée dans le flot est repérée à l&apos;arrivée : le délai légal est d&apos;un mois, et
                il court à partir de la réception, pas de la découverte.
              </li>
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Gmail, ou n&apos;importe quelle adresse en IMAP/SMTP — y compris celle de votre nom de domaine.
              </li>
            </ul>
            {peutConnecter ? (
              <Button href="/integrations" className="self-start">
                Connecter une boîte mail
              </Button>
            ) : (
              <div className="text-[12px] text-slate border-t border-line pt-3">
                Seul le titulaire du compte peut connecter une boîte mail, depuis Intégrations.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Boîte mail" subtitle="Triage des emails entrants" />
      <Tabs basePath="/inbox" tabs={tabs} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-3xl">
        <div className="pb-4 border-b border-line">
          {connections.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-ash shrink-0" />
              <span className="text-slate">
                Aucune boîte connectée — les emails ci-dessous ne se mettront plus à jour.
              </span>
              <Link href="/integrations" className="text-ink font-medium underline decoration-line hover:decoration-ink">
                Connecter une boîte →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
                  <span className="text-ink font-medium">
                    {c.provider} — {c.accountEmail}
                  </span>
                  {(c.provider === "gmail" || c.provider === "imap") && canWrite && (
                    <MailboxActions provider={c.provider} connectionId={c.id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTab === "rgpd" && canHandleRgpd ? (
          <>
            <div className="text-[11.5px] text-slate">
              Détecté automatiquement par l&apos;IA à la synchronisation — vérifiez avant de confirmer, l&apos;échéance
              légale est d&apos;un mois.
            </div>
            {rgpdSuggested.length > 0 ? (
              <div className="bg-white border border-rust/30 rounded-card p-4">
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
              </div>
            ) : (
              <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>
            )}
          </>
        ) : activeTab === "rattachements" ? (
          suggested.length > 0 ? (
            <div className="bg-white border border-line rounded-card p-4">
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
            </div>
          ) : (
            <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>
          )
        ) : (
          <>
            <div className="flex justify-end">
              <MailboxFilterSelect connections={connections.map((c) => ({ id: c.id, provider: c.provider, accountEmail: c.accountEmail }))} />
            </div>
            {unsorted.length > 0 ? (
              <div className="bg-white border border-line rounded-card p-4">
                {unsorted.map((m) => {
                  const initials = initialsOf(m.fromName ?? m.fromAddress);
                  return (
                    <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex gap-3">
                      <Avatar initials={initials} />
                      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[12.5px] text-ink font-medium truncate">
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12.5px] text-slate">Rien à trier.</div>
            )}
          </>
        )}
      </div>
    </>
  );
}
