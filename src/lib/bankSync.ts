import { prisma } from "@/lib/prisma";
import { fetchAccountTransactions } from "@/lib/bridge";

export type BankSyncResult = { accountsSynced: number; transactionsInserted: number; errors: string[] };

// Récupère les opérations fraîches de chaque BankAccount lié, puis enregistre
// les crédits nouveaux en BankTransaction « pending ». createMany +
// skipDuplicates fait la déduplication contre l'identifiant d'opération de
// Bridge en une seule requête par compte, même principe que le createMany de
// l'import CSV (voir /api/import/bank-transactions) : une resynchronisation
// ne compte jamais deux fois un paiement déjà vu.
//
// Deux appels seulement, et les surcharges ci-dessous n'en autorisent pas
// d'autre :
//   - sans argument : le cron quotidien (/api/cron/bank-sync) balaie toutes
//     les connexions liées de tous les organismes ;
//   - avec organizationId, éventuellement suivi de connectionId : l'appel
//     manuel. Le bouton « Synchroniser » de BankConnectionPanel est placé
//     sous une banque précise et transmet donc son identifiant de connexion,
//     pour qu'un clic ne resynchronise pas silencieusement les autres
//     banques. Il n'existe aujourd'hui aucun bouton « tout resynchroniser »
//     dans l'interface : l'appel organizationId seul reste possible et
//     balaierait toutes les connexions de l'organisme, mais personne ne
//     l'émet.
//
// Ce qui est fermé, en revanche : un connectionId sans organizationId. Le
// filtre porterait alors sur `id` sans aucune clause de cloisonnement, donc
// sur la connexion bancaire d'un autre organisme. Aucun appelant ne le fait,
// mais la signature l'autorisait ; les surcharges l'interdisent au typage et
// la garde ci-dessous au runtime (voir CLAUDE.md : le multi-tenant ne tient
// qu'au `where` applicatif).
export function syncBankTransactions(): Promise<BankSyncResult>;
export function syncBankTransactions(organizationId: string, connectionId?: string): Promise<BankSyncResult>;
export async function syncBankTransactions(organizationId?: string, connectionId?: string): Promise<BankSyncResult> {
  if (connectionId && !organizationId) {
    throw new Error(
      "syncBankTransactions : un connectionId sans organizationId synchroniserait la connexion bancaire d'un autre organisme."
    );
  }

  const connections = await prisma.bankConnection.findMany({
    where: { status: "linked", ...(organizationId ? { organizationId } : {}), ...(connectionId ? { id: connectionId } : {}) },
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
