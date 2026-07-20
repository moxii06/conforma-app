import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  processingActivityId: z.string().min(1),
  subject: z.string().min(1),
  riskLevel: z.enum(["low", "moderate", "high"]),
  status: z.enum(["required", "in_progress", "validated", "not_required"]),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const activity = await prisma.processingActivity.findFirst({
    where: { id: parsed.data.processingActivityId, organizationId: session.organizationId },
  });
  if (!activity) return NextResponse.json({ error: "Traitement introuvable." }, { status: 404 });

  const record = await prisma.dPIARecord.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(record, { status: 201 });
}
