import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { syncImapMailbox } from "@/lib/imapSync";

export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  try {
    const result = await syncImapMailbox(session.organizationId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur de synchronisation." }, { status: 400 });
  }
}
