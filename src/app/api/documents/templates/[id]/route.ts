import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ title: z.string().min(1).optional(), bodyText: z.string().min(1).optional() });

// Full content of one template, for the library panel: it lists templates
// without their paragraphs (see the collection route's comment) and only
// needs them when the user actually opens one to read or edit it.
//
// Readable scope is wider than writable: a Jalon starter template
// (organizationId: null) can be read here — that is how you preview one
// before adapting it — but PATCH below deliberately refuses it.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: params.id, OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  return NextResponse.json({
    id: template.id,
    title: template.title,
    category: template.category,
    bodyText: template.bodyText,
    origin: template.organizationId === null ? "jalon" : "organization",
    blocks: template.blocks.map((b) => ({ bodyText: b.bodyText, conditions: b.conditions })),
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
