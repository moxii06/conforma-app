import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { DOCUMENT_CATEGORIES } from "@/lib/documentCategories";

const schema = z.object({ title: z.string().min(1), url: z.string().url(), category: z.enum(DOCUMENT_CATEGORIES).optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: parsed.data.title,
      fileUrl: parsed.data.url,
      category: parsed.data.category ?? "other",
    },
  });

  return NextResponse.json(document, { status: 201 });
}
