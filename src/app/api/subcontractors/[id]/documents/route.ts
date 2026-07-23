import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ title: z.string().min(1), url: z.string().url() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      subcontractorId: subcontractor.id,
      title: parsed.data.title,
      fileUrl: parsed.data.url,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
