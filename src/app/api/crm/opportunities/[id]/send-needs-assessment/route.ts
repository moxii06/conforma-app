import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { resolveAppOrigin } from "@/lib/appUrl";

/**
 * Le message d'accompagnement, optionnel, en TEXTE BRUT.
 *
 * Cet email n'a pas de partie HTML (voir l'envoi plus bas) : le composeur
 * aplatit donc son éditeur riche avant de poster. Le champ reste facultatif
 * parce que l'email par défaut se suffit à lui-même — et parce qu'un corps
 * absent doit continuer de fonctionner à l'identique.
 */
const schemaCorps = z.object({ message: z.string().max(10_000).optional() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  // Un corps absent est valide (`?? {}`) : la route a longtemps été appelée
  // sans aucun corps. Un corps PRÉSENT mais invalide est refusé plutôt
  // qu'ignoré — accepter en silence un message qu'on n'enverra pas est
  // exactement le défaut qu'on corrige ici.
  const corpsRequete = await request.json().catch(() => null);
  const corpsAnalyse = schemaCorps.safeParse(corpsRequete ?? {});
  if (!corpsAnalyse.success) {
    return NextResponse.json({ error: "Message d'accompagnement invalide ou trop long." }, { status: 400 });
  }
  const messagePersonnalise = (corpsAnalyse.data.message ?? "").trim();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.roles, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  // Prefer the org's own adapted template over the Jalon starter, if
  // they've forked one — same "org copy wins" logic as the library page.
  const template =
    (await prisma.documentTemplate.findFirst({
      where: { organizationId: session.organizationId, category: "needs_assessment" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: "needs_assessment" },
    }));

  if (!template) {
    return NextResponse.json({ error: "Aucun modèle de recueil des besoins disponible." }, { status: 400 });
  }

  const token = randomBytes(20).toString("hex");

  await prisma.needsAssessmentRequest.create({
    data: {
      organizationId: session.organizationId,
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
      token,
      templateBody: template.bodyText,
      sentByUserId: session.userId,
      sentByName: session.name || session.email,
    },
  });

  const formUrl = `${resolveAppOrigin(request)}/formulaire/${token}`;

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  // Le message rédigé dans « Contacter » remplace la seule ligne de
  // politesse d'ouverture, rien de plus. Ce qui suit — la phrase qui annonce
  // le lien, le lien, la signature de l'organisme — reste écrit ici et n'est
  // jamais délégué : un email de recueil dont le lien n'est pas annoncé n'a
  // plus d'objet, et rien ne garantit que l'utilisateur y pense.
  //
  // Sans message, le texte produit est mot pour mot celui d'avant : le
  // chemin nominal ne change pas.
  const ouverture = messagePersonnalise
    ? fillMergeTags(messagePersonnalise, {
        firstName: opportunity.contact.firstName,
        lastName: opportunity.contact.lastName,
        organizationName: organization.name,
      })
    : `Bonjour ${opportunity.contact.firstName},`;

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: opportunity.contact.email,
      toName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
      subject: `${organization.name} — test de positionnement`,
      text: `${ouverture}\n\nMerci de compléter le test de positionnement pour votre formation en suivant ce lien :\n${formUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Non-fatal — formUrl is still returned for manual relay.
  }

  return NextResponse.json({ formUrl, emailSent }, { status: 201 });
}
