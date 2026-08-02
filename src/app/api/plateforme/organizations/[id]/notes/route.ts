import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";

const schema = z.object({
  note: z.string().trim().min(1).max(2000),
  // Absent = maintenant. Permet de noter un appel après coup avec sa vraie date.
  occurredAt: z.string().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const params = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Note invalide." }, { status: 400 });

  const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });

  let occurredAt: Date | undefined;
  if (parsed.data.occurredAt) {
    occurredAt = new Date(parsed.data.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const created = await prisma.platformContactNote.create({
    data: { organizationId: organization.id, note: parsed.data.note, ...(occurredAt ? { occurredAt } : {}) },
  });
  return NextResponse.json(created, { status: 201 });
}
