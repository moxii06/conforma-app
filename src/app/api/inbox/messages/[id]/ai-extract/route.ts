import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { extractProspectInfo } from "@/lib/ai";

// AI-assisted pre-fill for the "Nouveau prospect" quick-create form —
// extracts firstName/lastName/phone/companyName from the email body
// (typically a signature block), which the non-AI heuristic
// (InboxMessageActions' splitName()) can't do since it only has the
// "From" header's display name to work with. Platform-level feature (see
// src/lib/ai.ts) — no per-organization key needed.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  try {
    const extraction = await extractProspectInfo(message.body ?? message.snippet);
    return NextResponse.json(extraction);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 501 });
  }
}
