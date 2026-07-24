import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { draftEmailReply } from "@/lib/ai";

// Rédaction assistée par IA — appel réel à OpenAI (src/lib/ai.ts), fonctionnalité
// intégrée à la plateforme (clé Jalon, pas une clé par organisation).
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

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  try {
    const draft = await draftEmailReply({
      fromName: message.fromName,
      fromAddress: message.fromAddress,
      subject: message.subject,
      body: message.body ?? message.snippet,
      organizationName: organization.name,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 501 });
  }
}
