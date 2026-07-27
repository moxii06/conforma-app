import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { listItems, getProviderName, fetchItemAccounts, ITEM_STATUS_OK } from "@/lib/bridge";

// Step 2: the browser lands back here after the staff member authenticated
// with their own bank on Bridge's hosted webview — same browser session, so
// the Jalon auth cookie is still present. `context` is the BankConnection id
// we handed Bridge when creating the connect session (see connect/route.ts);
// Bridge doesn't hand back which item was just created, so this looks up
// every item Bridge now knows about for this org's Bridge user and treats
// the newest one not already linked to a BankConnection as the new one —
// works whether the user just connected their first bank or added another.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectionId = url.searchParams.get("context");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  const auth = await getSessionContext();
  if (!auth || !connectionId) return redirectTo("/facturation?tab=a-valider&bank_error=1");

  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, organizationId: auth.organizationId } });
  if (!connection) return redirectTo("/facturation?tab=a-valider&bank_error=1");

  try {
    const knownItemIds = new Set(
      (await prisma.bankConnection.findMany({ where: { organizationId: auth.organizationId }, select: { externalConnectionId: true } }))
        .map((c) => c.externalConnectionId)
    );
    const items = await listItems(auth.organizationId);
    const newest = items
      .filter((item) => !knownItemIds.has(String(item.id)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!newest) {
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "pending" } });
      return redirectTo("/facturation?tab=a-valider&bank_pending=1");
    }
    if (newest.status !== ITEM_STATUS_OK) {
      // Mid-flow (otp_required, tos_to_validate...) or a genuine failure —
      // either way there are no accounts to read yet, so store nothing more.
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "pending" } });
      return redirectTo("/facturation?tab=a-valider&bank_pending=1");
    }

    const [institutionName, accounts] = await Promise.all([
      getProviderName(newest.providerId),
      fetchItemAccounts(auth.organizationId, newest.id),
    ]);

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { externalConnectionId: String(newest.id), institutionId: String(newest.providerId), institutionName, status: "linked" },
    });
    for (const account of accounts) {
      await prisma.bankAccount.upsert({
        where: { bankConnectionId_externalAccountId: { bankConnectionId: connection.id, externalAccountId: account.externalAccountId } },
        update: {},
        create: { bankConnectionId: connection.id, externalAccountId: account.externalAccountId, iban: account.iban, displayName: account.displayName },
      });
    }
    return redirectTo("/facturation?tab=a-valider&bank_connected=1");
  } catch (e) {
    console.error("Bridge callback error:", e);
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "error" } });
    return redirectTo("/facturation?tab=a-valider&bank_error=1");
  }
}
