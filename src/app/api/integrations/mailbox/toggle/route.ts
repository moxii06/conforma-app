import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ connectionId: z.string().min(1), enabled: z.boolean() });

// Met une boîte en pause, ou la relance (audit P1 : « prévoit ici la
// possibilité de synchroniser plusieurs boîtes mails, de les cocher et de
// les décocher »).
//
// Volontairement distinct de /disconnect : décocher arrête la
// synchronisation mais conserve les messages déjà importés, alors que
// déconnecter les efface. C'est toute la raison d'être de cette route.
// Commun aux deux fournisseurs — il n'y a rien de spécifique à Gmail ou
// IMAP dans le fait de mettre en pause.
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "integrations") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: parsed.data.connectionId, organizationId: session.organizationId },
  });
  if (!connection) return NextResponse.json({ error: "Boîte introuvable." }, { status: 404 });

  const updated = await prisma.mailboxConnection.update({
    where: { id: connection.id },
    data: { syncEnabled: parsed.data.enabled },
    select: { id: true, syncEnabled: true },
  });

  return NextResponse.json(updated);
}
