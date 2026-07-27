import { prisma } from "@/lib/prisma";
import { fetchAccountTransactions } from "@/lib/bridge";

// Pulls fresh transactions for every linked BankAccount of one org (or, with
// no argument, every org that has one — see /api/cron/bank-sync) and stores
// new credits as pending BankTransaction rows. createMany + skipDuplicates
// does the dedup against Bridge's own transaction id in one query per
// account, same idea as the CSV import's createMany (see
// /api/import/bank-transactions) — re-syncing never double-counts a
// payment already seen.
export async function syncBankTransactions(organizationId?: string): Promise<{ accountsSynced: number; transactionsInserted: number; errors: string[] }> {
  const connections = await prisma.bankConnection.findMany({
    where: { status: "linked", ...(organizationId ? { organizationId } : {}) },
    include: { accounts: true },
  });

  let accountsSynced = 0;
  let transactionsInserted = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    for (const account of connection.accounts) {
      try {
        const remote = await fetchAccountTransactions(connection.organizationId, account.externalAccountId);
        if (remote.length > 0) {
          const { count } = await prisma.bankTransaction.createMany({
            data: remote.map((t) => ({
              organizationId: connection.organizationId,
              bankAccountId: account.id,
              source: "bridge",
              externalId: t.externalId,
              bookedAt: t.bookedAt,
              amountCents: t.amountCents,
              label: t.label,
            })),
            skipDuplicates: true,
          });
          transactionsInserted += count;
        }
        accountsSynced++;
      } catch (e) {
        errors.push(`${connection.institutionName} (${account.displayName ?? account.externalAccountId}) : ${e instanceof Error ? e.message : "erreur inconnue"}`);
      }
    }
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
  }

  return { accountsSynced, transactionsInserted, errors };
}
