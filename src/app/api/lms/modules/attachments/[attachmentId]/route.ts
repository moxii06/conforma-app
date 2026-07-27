import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { deleteModuleFile } from "@/lib/storage";

export async function DELETE(_request: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
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
