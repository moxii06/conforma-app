import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, can } from "@/lib/tenant";
import { syncGmailMailbox } from "@/lib/gmailSync";

// Extra headroom on plans that honor it (Hobby hard-caps at 10s
// regardless) — the sync itself now parallelizes its Gmail API calls
// (see gmailSync.ts) rather than relying on this alone.
export const maxDuration = 60;

const schema = z.object({ connectionId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Connexion invalide." }, { status: 400 });

  try {
    const result = await syncGmailMailbox(session.organizationId, parsed.data.connectionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur de synchronisation." }, { status: 400 });
  }
}
