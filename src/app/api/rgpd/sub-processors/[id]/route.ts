import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  dpaStatus: z.enum(["pending", "signed"]).optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.subProcessor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Sous-traitant introuvable." }, { status: 404 });

  const updated = await prisma.subProcessor.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
      ...(parsed.data.dpaStatus !== undefined ? { dpaStatus: parsed.data.dpaStatus } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.subProcessor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Sous-traitant introuvable." }, { status: 404 });

  // Rien ne référence SubProcessor ailleurs dans le schéma (contrairement à
  // ProcessingActivity avec DPIARecord) : pas de vérification de dépendants
  // nécessaire avant suppression.
  await prisma.subProcessor.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
