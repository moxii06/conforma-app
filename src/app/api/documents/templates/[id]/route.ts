import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ title: z.string().min(1).optional(), bodyText: z.string().min(1).optional() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // organizationId must match — this also blocks editing a global starter
  // template (organizationId: null) in place, on purpose: the starter stays
  // a pristine reference and orgs edit their own fork instead (see /fork).
  const template = await prisma.documentTemplate.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const updated = await prisma.documentTemplate.update({
    where: { id: template.id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  await prisma.documentTemplate.delete({ where: { id: template.id } });
  return NextResponse.json({ ok: true });
}
