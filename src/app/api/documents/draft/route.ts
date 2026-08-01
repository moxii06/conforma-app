import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { scopeOfCategory, unresolvedTags } from "@/lib/documentScope";

// Enregistrer un brouillon, ou le finaliser.
//
// Un seul point d'entrée pour les deux : « finaliser » n'est rien d'autre
// qu'un enregistrement avec status "final". Les séparer aurait laissé deux
// chemins d'écriture sur le même document, et deux occasions de diverger.
//
// Rien n'est envoyé ici : c'est le lot 3 qui produira les N exemplaires et
// les expédiera. Un brouillon reste donc un document unique, même quand sa
// catégorie annonce « un par apprenant » — la multiplication a lieu à
// l'envoi, pas avant, sinon corriger une virgule demanderait de régénérer
// huit fichiers.

const schema = z.object({
  documentId: z.string().optional(),
  templateId: z.string(),
  sessionId: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  bodyText: z.string().min(1).max(200_000),
  category: z.string().min(1).max(60),
  finalize: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none" && can(auth.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { documentId, sessionId, title, bodyText, category, finalize } = parsed.data;

  // Un document qui part avec « [Nom apprenant] » en toutes lettres est un
  // document raté chez un client. On ne bloque pas le brouillon — c'est
  // justement le moment où le texte est incomplet — mais on refuse de le
  // déclarer fini.
  if (finalize) {
    const restantes = unresolvedTags(bodyText, scopeOfCategory(category));
    if (restantes.length > 0) {
      return NextResponse.json(
        {
          error: `Ce document contient ${restantes.length} balise${restantes.length > 1 ? "s" : ""} non remplie${
            restantes.length > 1 ? "s" : ""
          } : ${restantes.join(", ")}. Complétez-les ou choisissez une formation avant de finaliser.`,
          remainingTags: restantes,
        },
        { status: 400 },
      );
    }
  }

  const dossierId = sessionId
    ? (
        await prisma.dossier.findFirst({
          where: { sessionId, organizationId: auth.organizationId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  if (documentId) {
    const existant = await prisma.document.findFirst({
      where: { id: documentId, organizationId: auth.organizationId },
      select: { id: true, status: true, sentByUserId: true },
    });
    if (!existant) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    // Un document finalisé n'est plus modifiable, sinon « finalisé » ne
    // veut rien dire — et un contrat déjà parti pourrait être réécrit
    // après signature. Pour corriger : dupliquer, ce qui laisse une trace.
    if (existant.status === "final" || existant.sentByUserId) {
      return NextResponse.json(
        { error: "Ce document est finalisé et n'est plus modifiable. Dupliquez-le pour en créer une nouvelle version." },
        { status: 409 },
      );
    }
    const maj = await prisma.document.update({
      where: { id: existant.id },
      data: { title, bodyText, category, dossierId, status: finalize ? "final" : "draft" },
      select: { id: true, status: true },
    });
    return NextResponse.json(maj);
  }

  const créé = await prisma.document.create({
    data: {
      organizationId: auth.organizationId,
      dossierId,
      title,
      bodyText,
      category,
      status: finalize ? "final" : "draft",
      templateOrigin: parsed.data.templateId,
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(créé, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });

  const doc = await prisma.document.findFirst({
    where: { id, organizationId: auth.organizationId },
    select: { id: true, status: true, sentByUserId: true },
  });
  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  // Seul un brouillon jamais parti se supprime vraiment. Un document
  // envoyé est une trace : il s'archive, il ne s'efface pas.
  if (doc.status !== "draft" || doc.sentByUserId) {
    return NextResponse.json({ error: "Seul un brouillon peut être supprimé." }, { status: 409 });
  }
  await prisma.document.delete({ where: { id: doc.id } });
  return NextResponse.json({ ok: true });
}
