import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ published: z.boolean() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const indicator = await prisma.resultIndicator.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!indicator) return NextResponse.json({ error: "Indicateur introuvable." }, { status: 404 });

  const updated = await prisma.resultIndicator.update({ where: { id: indicator.id }, data: { published: parsed.data.published } });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const indicator = await prisma.resultIndicator.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!indicator) return NextResponse.json({ error: "Indicateur introuvable." }, { status: 404 });

  await prisma.resultIndicator.delete({ where: { id: indicator.id } });
  return NextResponse.json({ ok: true });
}
