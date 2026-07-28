import { NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/bankSync";
import { assertCronRequest } from "@/lib/cronAuth";

export const maxDuration = 60;

// Runs daily (see vercel.json) across every org with a linked bank
// connection. Same CRON_SECRET gate as /api/cron/automation-rules — see
// assertCronRequest for why a missing secret now refuses instead of letting
// the route run open.
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;

  const result = await syncBankTransactions();
  return NextResponse.json(result);
}
