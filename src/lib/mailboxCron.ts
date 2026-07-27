import { prisma } from "@/lib/prisma";
import { syncGmailMailbox } from "@/lib/gmailSync";
import { syncImapMailbox } from "@/lib/imapSync";

// Runs every MailboxConnection across every organization, dispatched by
// provider — the manual "Synchroniser maintenant" button (MailboxActions.tsx)
// is the only thing that ever ran this before, so a new prospect email or an
// RGPD-classification suggestion stayed invisible until someone opened
// /inbox and clicked it by hand (unlike bank sync, which already has a
// daily cron — see /api/cron/bank-sync). One failed connection (expired
// token, unreachable IMAP host) doesn't stop the others.
export async function syncAllMailboxConnections(): Promise<{ connectionsSynced: number; imported: number; errors: string[] }> {
  const connections = await prisma.mailboxConnection.findMany({
    select: { id: true, organizationId: true, provider: true, accountEmail: true },
  });

  let connectionsSynced = 0;
  let imported = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    try {
      const result =
        connection.provider === "imap"
          ? await syncImapMailbox(connection.organizationId, connection.id)
          : connection.provider === "gmail"
            ? await syncGmailMailbox(connection.organizationId, connection.id)
            : null;
      if (!result) {
        errors.push(`${connection.accountEmail} : fournisseur "${connection.provider}" non pris en charge par la synchro automatique.`);
        continue;
      }
      imported += result.imported;
      connectionsSynced++;
    } catch (e) {
      errors.push(`${connection.accountEmail} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  }

  return { connectionsSynced, imported, errors };
}
