import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { syncBankTransactions } from "@/lib/bankSync";

export const maxDuration = 60;

// Manual "Synchroniser maintenant" — the daily cron (see
// /api/cron/bank-sync) covers most cases, this is for a staff member who
// doesn't want to wait until tomorrow morning right after connecting.
export async function POST() {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  const result = await syncBankTransactions(auth.organizationId);
  return NextResponse.json(result);
}
