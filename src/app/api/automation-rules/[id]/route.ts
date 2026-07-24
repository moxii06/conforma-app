import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  afterDays: z.number().int().positive().optional(),
  sendEmail: z.boolean().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!rule) return NextResponse.json({ error: "Règle introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.automationRule.update({ where: { id: rule.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!rule) return NextResponse.json({ error: "Règle introuvable." }, { status: 404 });

  await prisma.automationRule.delete({ where: { id: rule.id } });
  return NextResponse.json({ ok: true });
}
