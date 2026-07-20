import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1),
  legalBasis: z.string().min(1),
  retentionPeriod: z.string().min(1),
  riskFlag: z.enum(["ok", "to_review"]),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const activity = await prisma.processingActivity.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(activity, { status: 201 });
}
