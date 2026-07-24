import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { MEMBER_DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { uploadUserDocument } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const member = await prisma.user.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!member) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString();
  const file = formData.get("file");
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  if (!category || !(MEMBER_DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }

  let uploaded: { url: string };
  try {
    uploaded = await uploadUserDocument({ organizationId: session.organizationId, userId: member.id, file });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur d'upload." }, { status: 502 });
  }

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      userId: member.id,
      title,
      fileUrl: uploaded.url,
      category,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
