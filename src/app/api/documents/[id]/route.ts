import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { deleteModuleFile } from "@/lib/storage";

// Currently only wired for the two "Documents liés" panels that expose
// this (team member / subcontractor records — see /team/members/[id] and
// /team/subcontractors/[id]), hence the "team" permission check and the
// requirement that the document belong to a user or subcontractor. A
// dossier-owned document has no delete/archive UI yet, so it's deliberately
// out of scope here rather than silently allowed through a generic check.
async function loadTeamScopedDocument(id: string, organizationId: string) {
  const document = await prisma.document.findFirst({ where: { id, organizationId } });
  if (!document || (!document.userId && !document.subcontractorId)) return null;
  return document;
}

const patchSchema = z.object({ archived: z.boolean() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const document = await loadTeamScopedDocument(params.id, session.organizationId);
  if (!document) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const document = await loadTeamScopedDocument(params.id, session.organizationId);
  if (!document) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  await prisma.document.delete({ where: { id: document.id } });
  if (document.fileUrl) await deleteModuleFile(document.fileUrl);

  return NextResponse.json({ ok: true });
}
