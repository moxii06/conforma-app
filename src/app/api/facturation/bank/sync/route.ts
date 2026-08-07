import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { syncBankTransactions } from "@/lib/bankSync";

export const maxDuration = 60;

// Manual "Synchroniser maintenant" — the daily cron (see
// /api/cron/bank-sync) covers most cases, this is for a staff member who
// doesn't want to wait until tomorrow morning right after connecting.
//
// An optional `connectionId` in the body narrows the run to the one bank
// connection the staff member actually clicked — see BankConnectionPanel.
// Without it, every linked connection of the org is resynced (used to be
// the only behaviour, silently, even when the button was under a single
// bank). organizationId stays in the where clause either way, so a
// connectionId from another org just matches nothing rather than leaking.
export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : undefined;
  const result = await syncBankTransactions(auth.organizationId, connectionId);
  return NextResponse.json(result);
}
