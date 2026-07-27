import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { getRequisition, getAccountDetails } from "@/lib/gocardless";

// Step 2: the browser lands back here after the staff member authenticated
// with their own bank on GoCardless's hosted page — same browser session,
// so the Jalon auth cookie is still present. Fetches which accounts got
// linked and stores them (no transactions yet — that's /api/cron/bank-sync,
// so this redirect stays fast instead of pulling months of history inline).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  const auth = await getSessionContext();
  if (!auth || !connectionId) return redirectTo("/facturation?tab=a-valider&bank_error=1");

  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, organizationId: auth.organizationId } });
  if (!connection) return redirectTo("/facturation?tab=a-valider&bank_error=1");

  try {
    const { status, accountIds } = await getRequisition(connection.requisitionId);
    // GoCardless requisition statuses: CR (created) / GC (giving consent) /
    // UA (undergoing authentication) / GA (granted) / LN (linked) /
    // EX (expired) / RJ (rejected/error). Only LN means real accounts are
    // actually available to read from.
    if (status !== "LN" || accountIds.length === 0) {
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: status === "RJ" || status === "EX" ? "error" : "pending" } });
      return redirectTo("/facturation?tab=a-valider&bank_pending=1");
    }

    for (const accountId of accountIds) {
      const details = await getAccountDetails(accountId).catch(() => ({ iban: null, displayName: null }));
      await prisma.bankAccount.upsert({
        where: { bankConnectionId_externalAccountId: { bankConnectionId: connection.id, externalAccountId: accountId } },
        update: {},
        create: { bankConnectionId: connection.id, externalAccountId: accountId, iban: details.iban, displayName: details.displayName },
      });
    }
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "linked" } });
    return redirectTo("/facturation?tab=a-valider&bank_connected=1");
  } catch (e) {
    console.error("GoCardless callback error:", e);
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "error" } });
    return redirectTo("/facturation?tab=a-valider&bank_error=1");
  }
}
