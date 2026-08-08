import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Backs the reply dialog's "Documents existants" attachment picker — every
// Document already on file for this message's contact (sent contracts,
// convocations, uploads), so replying can re-attach one without generating
// anything new. Empty when the message has no contact yet.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { contactId: true },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!message.contactId) return NextResponse.json({ documents: [] });

  const documents = await prisma.document.findMany({
    where: { contactId: message.contactId, organizationId: session.organizationId, archivedAt: null },
    select: { id: true, title: true, category: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}
