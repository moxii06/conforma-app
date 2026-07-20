import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InboxMessageActions } from "@/components/InboxMessageActions";

export default async function InboxPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "inbox") === "none") redirect("/dashboard");
  const canWrite = can(role, "inbox") !== "none";

  const [connections, unsorted, suggested, contacts] = await Promise.all([
    prisma.mailboxConnection.findMany({ where: { organizationId } }),
    prisma.emailMessage.findMany({
      where: { organizationId, contactId: null },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.emailMessage.findMany({
      where: { organizationId, contactId: { not: null }, suggestedDossierId: { not: null } },
      include: { contact: true },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    }),
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
                Aucune boîte connectée — la connexion Gmail/Outlook (OAuth) n&apos;est pas encore branchée dans ce
                scaffold. Les emails ci-dessous sont des données de démonstration.
              </div>
              <button
                disabled
                title="Connexion OAuth non branchée"
                className="text-[12px] text-slate border border-line rounded-md px-3 py-1.5 cursor-not-allowed shrink-0 ml-3"
              >
                Connecter une boîte
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {connections.map((c) => (
                <div key={c.id} className="text-[12.5px] text-ink">
                  {c.provider} — {c.accountEmail}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="text-[13px] font-semibold text-ink mb-3">
            À trier ({unsorted.length})
          </div>
          {unsorted.map((m) => (
            <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12.5px] text-ink font-medium">{m.fromAddress}</div>
                <div className="text-[11px] text-slate shrink-0">{format(m.receivedAt, "d MMM yyyy HH:mm", { locale: fr })}</div>
              </div>
              <div className="text-[12.5px] text-ink">{m.subject}</div>
              <div className="text-[12px] text-slate">{m.snippet}</div>
              {canWrite && <InboxMessageActions messageId={m.id} contacts={contacts} />}
            </div>
          ))}
          {unsorted.length === 0 && <div className="text-[12.5px] text-slate">Rien à trier.</div>}
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="text-[13px] font-semibold text-ink mb-3">Suggestions de rattachement à un dossier</div>
          {suggested.map((m) => (
            <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex items-center justify-between gap-3">
              <div>
                <div className="text-[12.5px] text-ink font-medium">
                  {m.contact?.firstName} {m.contact?.lastName} — {m.subject}
                </div>
                <div className="text-[11.5px] text-slate mt-0.5">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
              </div>
              <Pill tone="neutral">{m.matchBasis === "thread" ? "Suggéré par fil de discussion" : "Suggéré par référence"}</Pill>
            </div>
          ))}
          {suggested.length === 0 && <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>}
        </div>
      </div>
    </>
  );
}
