import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const source = await prisma.documentTemplate.findFirst({
    where: { id: params.id, organizationId: null },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Modèle de référence introuvable." }, { status: 404 });

  // Idempotent: forking the same starter template twice (e.g. a double
  // click before the button's disabled state kicks in) returns the
  // existing copy instead of creating a duplicate to edit.
  const existingFork = await prisma.documentTemplate.findFirst({
    where: { organizationId: session.organizationId, forkedFromId: source.id },
  });
  if (existingFork) return NextResponse.json(existingFork, { status: 200 });

  // The conditional paragraphs come along, and they have to: for a
  // blocks-based template the bodyText is only a placeholder line ("assemblé
  // automatiquement à partir des paragraphes ci-dessous"), so copying it
  // alone would hand the org an empty shell pointing at clauses that don't
  // exist — and the library would render it as a flat template, offering to
  // "activate" blocks whose only content would be that placeholder.
  const fork = await prisma.documentTemplate.create({
    data: {
      organizationId: session.organizationId,
      category: source.category,
      title: source.title,
      bodyText: source.bodyText,
      forkedFromId: source.id,
      blocks: {
        create: source.blocks.map((b) => ({
          order: b.order,
          bodyText: b.bodyText,
          // Json? — `undefined` would drop the column, which for a block
          // means "no conditions, always included". Only a real null does
          // that; pass the value through untouched otherwise.
          conditions: b.conditions === null ? Prisma.JsonNull : b.conditions,
        })),
      },
    },
  });

  return NextResponse.json(fork, { status: 201 });
}
