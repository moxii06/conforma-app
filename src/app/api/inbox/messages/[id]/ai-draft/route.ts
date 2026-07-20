import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Rédaction assistée par IA (spec: "implanter de l'IA pour faciliter les
// réponses") needs a real LLM API key (Claude, Mistral, OpenAI...) — none is
// configured in this scaffold. Rather than silently returning a fake/canned
// draft, this returns a clear, actionable error so the UI can surface it —
// same "stubbed, not faked" pattern as the rest of the mailbox module.
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

  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId: session.organizationId, provider: "ai_provider" } },
  });
  if (!credential?.apiKey) {
    return NextResponse.json(
      { error: "Rédaction assistée par IA non configurée — ajoutez une clé API sur la page Intégrations pour l'activer." },
      { status: 501 }
    );
  }

  // A key is configured, but no LLM provider is actually wired up to call
  // yet in this scaffold — that's the next piece of real work, not this
  // stub's job to fake.
  return NextResponse.json(
    { error: "Une clé est configurée mais aucun fournisseur IA n'est encore branché dans ce scaffold." },
    { status: 501 }
  );
}
