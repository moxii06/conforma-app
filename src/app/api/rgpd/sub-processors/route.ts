import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  location: z.string().min(1),
  dpaStatus: z.enum(["pending", "signed"]),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const subProcessor = await prisma.subProcessor.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(subProcessor, { status: 201 });
}
