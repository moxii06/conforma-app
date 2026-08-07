import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Marquer un message lu — séparée du PATCH de triage à dessein : celle-ci se
// déclenche à chaque ouverture d'un message dans le volet de lecture, un
// geste fréquent et sans conséquence métier, pas une action de tri.
//
// À l'échelle de l'ORGANISME, pas par utilisateur : une boîte mail
// d'organisme est partagée, et « Marie l'a déjà lu » est précisément ce que
// l'équipe a besoin de savoir. Voir le commentaire du champ dans le schéma.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { id: true, readAt: true },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  // Déjà lu : rien à écrire. Épargne une frappe en base à chaque
  // sélection d'un message déjà ouvert par quelqu'un.
  if (message.readAt) return NextResponse.json({ ok: true, readAt: message.readAt });

  const updated = await prisma.emailMessage.update({
    where: { id: message.id },
    data: { readAt: new Date() },
    select: { readAt: true },
  });
  return NextResponse.json({ ok: true, readAt: updated.readAt });
}
