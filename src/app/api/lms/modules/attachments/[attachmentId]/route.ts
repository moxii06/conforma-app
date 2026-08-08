import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { deleteModuleFile } from "@/lib/storage";
import { streamStoredFile } from "@/lib/blobStream";

// Attachments are private blobs now, so reading one goes through here rather
// than through the raw blob URL. Any authenticated member of the owning
// organisation may read: an attachment is course material, and learners
// enrolled on the course need it — the tenant check is the boundary that
// matters, and it mirrors how the module player already lists them.
export async function GET(_request: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const attachment = await prisma.elearningModuleAttachment.findFirst({
    where: { id: params.attachmentId, module: { course: { organizationId: session.organizationId } } },
  });
  if (!attachment) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  return streamStoredFile(attachment.fileUrl, { downloadName: attachment.title });
}

export async function DELETE(_request: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const attachment = await prisma.elearningModuleAttachment.findFirst({
    where: { id: params.attachmentId, module: { course: { organizationId: session.organizationId } } },
  });
  if (!attachment) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  await prisma.elearningModuleAttachment.delete({ where: { id: attachment.id } });
  await deleteModuleFile(attachment.fileUrl);

  return NextResponse.json({ ok: true });
}
