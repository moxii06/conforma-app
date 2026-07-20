import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const source = await prisma.documentTemplate.findFirst({
    where: { id: params.id, organizationId: null },
  });
  if (!source) return NextResponse.json({ error: "Modèle de référence introuvable." }, { status: 404 });

  // Idempotent: forking the same starter template twice (e.g. a double
  // click before the button's disabled state kicks in) returns the
  // existing copy instead of creating a duplicate to edit.
  const existingFork = await prisma.documentTemplate.findFirst({
    where: { organizationId: session.organizationId, forkedFromId: source.id },
  });
  if (existingFork) return NextResponse.json(existingFork, { status: 200 });

  const fork = await prisma.documentTemplate.create({
    data: {
      organizationId: session.organizationId,
      category: source.category,
      title: source.title,
      bodyText: source.bodyText,
      forkedFromId: source.id,
    },
  });

  return NextResponse.json(fork, { status: 201 });
}
