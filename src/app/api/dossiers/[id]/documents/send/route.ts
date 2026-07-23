import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { uploadDossierDocument } from "@/lib/storage";
import { sendTransactionalEmail } from "@/lib/brevo";

// Client feedback: sending a document (from the toolkit library, or one
// picked from the OF's own computer) should be a single action — pick it,
// review/edit the pre-filled text, send — rather than "generate a
// document" and "notify the client" being two separate, disconnected
// steps. Reused by both the Documents tab and the Info tab's Communications
// panel (SendDocumentDialog). Unlike the fixed contract/convocation/
// platform_access flows in outreach/route.ts, this doesn't create a
// ClientOutreach row — that model's ack-tracking (signed/activated) is
// specific to those three, not a generic "here's a file" send.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const mode = formData.get("mode")?.toString();
  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString() || "other";
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

  let document;
  if (mode === "template") {
    const bodyText = formData.get("bodyText")?.toString() ?? "";
    if (!bodyText.trim()) return NextResponse.json({ error: "Le contenu du document est vide." }, { status: 400 });
    const templateId = formData.get("templateId")?.toString() || null;
    const template = templateId
      ? await prisma.documentTemplate.findFirst({ where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] } })
      : null;
    document = await prisma.document.create({
      data: {
        organizationId: auth.organizationId,
        dossierId: dossier.id,
        title,
        bodyText,
        templateOrigin: template?.title,
        category: template?.category ?? category,
      },
    });
  } else if (mode === "upload") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    try {
      const uploaded = await uploadDossierDocument({ organizationId: auth.organizationId, dossierId: dossier.id, file });
      document = await prisma.document.create({
        data: { organizationId: auth.organizationId, dossierId: dossier.id, title, fileUrl: uploaded.url, category },
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de l'upload." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const documentUrl = document.bodyText ? `${origin}/api/documents/generated/${document.id}` : document.fileUrl!;

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: dossier.contact.email,
      toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
      subject: `${organization.name} — ${title}`,
      text: `Bonjour ${dossier.contact.firstName},\n\nVeuillez trouver le document « ${title} » via ce lien :\n${documentUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: auth.email,
    });
    emailSent = true;
  } catch {
    // Non-fatal — the document record still exists and can be shared manually.
  }

  return NextResponse.json({ document, emailSent, documentUrl }, { status: 201 });
}
