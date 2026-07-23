import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ connectionId: z.string().min(1) });

// Deletes the connection AND every EmailMessage that came from it — an
// earlier version only deleted the connection, leaving already-synced
// emails behind even though there was no way left to view/manage them.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Connexion invalide." }, { status: 400 });

  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: parsed.data.connectionId, organizationId: session.organizationId, provider: "imap" },
  });
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  await prisma.$transaction([
    prisma.emailMessage.deleteMany({ where: { mailboxConnectionId: connection.id } }),
    prisma.mailboxConnection.delete({ where: { id: connection.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
