import { NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/bankSync";

export const maxDuration = 60;

// Runs daily (see vercel.json) across every org with a linked bank
// connection. Same CRON_SECRET gate as /api/cron/automation-rules —
// unreachable in production until that env var exists, matching the
// "prepared but not yet wired" stance of every stubbed integration here.
export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }
  }
  const result = await syncBankTransactions();
  return NextResponse.json(result);
}
