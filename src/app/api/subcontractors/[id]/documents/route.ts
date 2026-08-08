import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { SUBCONTRACTOR_DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { uploadSubcontractorDocument } from "@/lib/storage";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  // Deux dépositaires légitimes, et un seul chemin d'écriture pour les deux.
  //
  // L'organisme, comme avant. Et l'intervenant lui-même quand il a un compte
  // (Subcontractor.linkedUserId), qui dépose ses propres pièces depuis
  // /team/mes-pieces : c'est LUI qui détient son attestation URSSAF, et la
  // lui réclamer par email pour la téléverser à sa place était le trajet le
  // plus long possible.
  //
  // Le rattachement est relu depuis la base, jamais déduit d'un identifiant
  // envoyé par le client : `linkedUserId` doit être exactement la session en
  // cours, sans quoi n'importe quel formateur de l'organisme pourrait
  // déposer sur la fiche d'un autre.
  const estLeSousTraitant = subcontractor.linkedUserId !== null && subcontractor.linkedUserId === session.userId;
  if (can(session.roles, "team") !== "full" && !estLeSousTraitant) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString();
  const file = formData.get("file");
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  if (!category || !(SUBCONTRACTOR_DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }

  let uploaded: { url: string };
  try {
    uploaded = await uploadSubcontractorDocument({ organizationId: session.organizationId, subcontractorId: subcontractor.id, file });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur d'upload." }, { status: 502 });
  }

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      subcontractorId: subcontractor.id,
      title,
      fileUrl: uploaded.url,
      category,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
