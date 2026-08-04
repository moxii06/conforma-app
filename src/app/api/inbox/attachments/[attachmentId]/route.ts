import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { streamStoredFile } from "@/lib/blobStream";

// Same "authenticated route, never the raw blob URL" shape as the LMS
// module attachment route — the blob is private. Scoped by organizationId
// through the EmailMessage relation rather than a role check: an inbox
// attachment isn't sensitive by feature the way an RGPD-only field is,
// same boundary as InboxMessageActions already uses (can(role, "inbox")
// gates the /inbox page itself before this route is ever reachable).
export async function GET(_request: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const attachment = await prisma.emailAttachment.findFirst({
    where: { id: params.attachmentId, emailMessage: { organizationId: session.organizationId } },
  });
  if (!attachment) return NextResponse.json({ error: "Pièce jointe introuvable." }, { status: 404 });

  return streamStoredFile(attachment.fileUrl, { downloadName: attachment.fileName });
}
