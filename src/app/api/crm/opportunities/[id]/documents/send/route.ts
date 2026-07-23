import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";
import { uploadDossierDocument } from "@/lib/storage";
import { sendTransactionalEmail } from "@/lib/brevo";

// Opportunity-level counterpart to /api/dossiers/[id]/documents/send —
// client feedback: the CRM's "Envoyer le recueil des besoins" action should
// be a general "Envoyer" that can send any document to a prospect, not just
// the positioning test. Reuses uploadDossierDocument's storage helper
// (namespaced by dossierId normally, but a prospect has none — the
// opportunityId stands in for that path segment) since the mechanics are
// identical.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const mode = formData.get("mode")?.toString();
  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString() || "other";
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  let document;
  if (mode === "template") {
    const bodyText = formData.get("bodyText")?.toString() ?? "";
    if (!bodyText.trim()) return NextResponse.json({ error: "Le contenu du document est vide." }, { status: 400 });
    const templateId = formData.get("templateId")?.toString() || null;
    const template = templateId
      ? await prisma.documentTemplate.findFirst({ where: { id: templateId, OR: [{ organizationId: session.organizationId }, { organizationId: null }] } })
      : null;
    document = await prisma.document.create({
      data: {
        organizationId: session.organizationId,
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
      const uploaded = await uploadDossierDocument({ organizationId: session.organizationId, dossierId: `opportunity-${opportunity.id}`, file });
      document = await prisma.document.create({
        data: { organizationId: session.organizationId, title, fileUrl: uploaded.url, category },
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
      to: opportunity.contact.email,
      toName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
      subject: `${organization.name} — ${title}`,
      text: `Bonjour ${opportunity.contact.firstName},\n\nVeuillez trouver le document « ${title} » via ce lien :\n${documentUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Non-fatal — the document record still exists and can be shared manually.
  }

  return NextResponse.json({ document, emailSent, documentUrl }, { status: 201 });
}
