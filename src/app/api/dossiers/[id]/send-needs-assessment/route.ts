import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { resolveAppOrigin } from "@/lib/appUrl";

// Envoyer le recueil des besoins depuis un dossier.
//
// Il n'existait que la version « opportunité », scopée sur une vente en
// cours. Or la tâche « Recueil des besoins manquant » du tableau de bord
// porte un dossierId, pas un opportunityId : elle était donc la seule des
// quatre tâches de dossier à ne pas pouvoir gagner de bouton d'action.
//
// Le lien produit est rattaché au dossier, ce qui rend la complétion
// précise au lieu d'approximative — voir la route publique.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: true, session: { select: { trainerId: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  // Même filtre d'appartenance que le reste de /dossiers : un formateur ne
  // touche qu'aux dossiers de ses propres sessions.
  if (session.role === Role.TRAINER && dossier.session.trainerId !== session.userId) {
    return NextResponse.json({ error: "Ce dossier appartient à une autre session." }, { status: 403 });
  }

  // Le modèle adapté par l'organisme prime sur celui de Jalon, comme
  // partout ailleurs dans la bibliothèque.
  const template =
    (await prisma.documentTemplate.findFirst({
      where: { organizationId: session.organizationId, category: "needs_assessment" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.documentTemplate.findFirst({ where: { organizationId: null, category: "needs_assessment" } }));
  if (!template) {
    return NextResponse.json({ error: "Aucun modèle de recueil des besoins disponible." }, { status: 400 });
  }

  const token = randomBytes(20).toString("hex");
  await prisma.needsAssessmentRequest.create({
    data: {
      organizationId: session.organizationId,
      contactId: dossier.contactId,
      dossierId: dossier.id,
      token,
      templateBody: template.bodyText,
      sentByUserId: session.userId,
      sentByName: session.name || session.email,
    },
  });

  const formUrl = `${resolveAppOrigin(request)}/formulaire/${token}`;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: dossier.contact.email,
      toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
      subject: `${organization.name} — recueil des besoins`,
      text: `Bonjour ${dossier.contact.firstName},\n\nMerci de compléter le recueil des besoins pour votre formation en suivant ce lien :\n${formUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Non fatal : le lien est renvoyé pour un relais manuel. Contrairement
    // à une facture, rien ici ne dépend d'un statut « envoyé » — le recueil
    // reste « à faire » tant qu'il n'est pas complété, email ou pas.
  }

  return NextResponse.json({ formUrl, emailSent }, { status: 201 });
}
