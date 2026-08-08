import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { SUBCONTRACTOR_DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { materialiserExigences } from "@/lib/subcontractorRequirements";

// Les pièces attendues par type de sous-traitant, réglées par l'organisme.
//
// Les deux verbes travaillent sur la CLÉ NATURELLE (type + catégorie) et
// non sur l'identifiant de ligne, parce que l'écran peut afficher des
// exigences qui n'existent pas encore en base : tant qu'un organisme n'a
// rien réglé, ce qu'il voit vient de la liste par défaut du code (voir
// chargerExigences). Passer par l'id aurait obligé l'écran à distinguer
// deux cas ; matérialiser d'abord, agir ensuite, n'en laisse qu'un.

const TYPES = ["formateur_externe", "sous_traitant_pedagogique", "prestataire_technique", "autre"] as const;

const schemaCreation = z.object({
  subcontractorType: z.enum(TYPES),
  documentCategory: z.enum(SUBCONTRACTOR_DOCUMENT_CATEGORIES),
  label: z.string().min(1).max(120),
  required: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schemaCreation.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { subcontractorType, documentCategory, label, required } = parsed.data;

  await materialiserExigences(session.organizationId);

  // Le dernier rang du type, pour que l'ajout se pose en bas de sa liste
  // plutôt qu'au milieu — l'ordre affiché est celui que l'organisme voit
  // dans la checklist de chaque intervenant.
  const dernier = await prisma.subcontractorDocumentRequirement.findFirst({
    where: { organizationId: session.organizationId, subcontractorType },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  // Upsert sur la clé unique du schéma : rajouter une catégorie déjà
  // attendue doit corriger son libellé, pas échouer sur une contrainte.
  const ligne = await prisma.subcontractorDocumentRequirement.upsert({
    where: {
      organizationId_subcontractorType_documentCategory: {
        organizationId: session.organizationId,
        subcontractorType,
        documentCategory,
      },
    },
    update: { label, required },
    create: {
      organizationId: session.organizationId,
      subcontractorType,
      documentCategory,
      label,
      required,
      isDefault: false,
      order: (dernier?.order ?? 0) + 1,
    },
  });

  return NextResponse.json(ligne, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = z
    .object({ subcontractorType: z.enum(TYPES), documentCategory: z.enum(SUBCONTRACTOR_DOCUMENT_CATEGORIES) })
    .safeParse({
      subcontractorType: url.searchParams.get("type"),
      documentCategory: url.searchParams.get("category"),
    });
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

  // Matérialiser AVANT de supprimer : sans ça, retirer une pièce d'une
  // liste encore virtuelle ne supprimerait rien et la ligne reviendrait au
  // rechargement, ce qui se lit comme un bouton cassé.
  await materialiserExigences(session.organizationId);

  const { count } = await prisma.subcontractorDocumentRequirement.deleteMany({
    where: {
      organizationId: session.organizationId,
      subcontractorType: parsed.data.subcontractorType,
      documentCategory: parsed.data.documentCategory,
    },
  });

  return NextResponse.json({ ok: true, supprimees: count });
}
