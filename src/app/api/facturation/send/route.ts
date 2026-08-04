import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { advanceOpportunityStage } from "@/lib/pipeline";
import { sendTransactionalEmail } from "@/lib/brevo";
import { buildFacturationPdf } from "@/lib/invoiceDocument";

// Envoyer réellement un devis ou une facture.
//
// « Envoyer » n'était jusqu'ici qu'une valeur dans un menu déroulant : le
// statut passait à SENT, l'étape du CRM avançait, et rien ne partait. Le
// libellé lui-même annonçait « Devis à envoyer » pour une action qui
// n'envoyait pas. L'organisme rouvrait son tableur ou son logiciel de
// compta pour faire le vrai travail.
//
// Une seule route pour les deux : le PDF, l'email, le statut et l'étape CRM
// sont la même mécanique, seul le libellé change.
const schema = z.object({ kind: z.enum(["invoice", "quote"]), id: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { kind, id } = parsed.data;

  const built = await buildFacturationPdf(kind, id, session.organizationId);
  if (!built) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!built.contactEmail) {
    return NextResponse.json({ error: "Ce client n'a pas d'adresse email." }, { status: 400 });
  }

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const libelle = kind === "invoice" ? "facture" : "devis";
  const sujet = `${kind === "invoice" ? "Facture" : "Devis"} ${built.reference} — ${org.name}`;

  // Ailleurs dans l'application, un échec d'email est non fatal : le
  // document existe, il a juste mal voyagé. Ici c'est l'inverse — le statut
  // « envoyé » EST la trace de l'envoi, et c'est lui qui déclenche le suivi
  // des impayés. Le laisser passer à SENT sur un email non parti ferait
  // relancer un client qui n'a jamais rien reçu.
  try {
    await sendTransactionalEmail({
      to: built.contactEmail,
      toName: built.contactName,
      subject: sujet,
      text:
        `Bonjour ${built.contactName},\n\n` +
        `Vous trouverez ci-joint notre ${libelle} ${built.reference}.\n\n` +
        `Cordialement,\n${org.name}`,
      senderName: org.name,
      replyTo: org.publicContactEmail ?? undefined,
      attachment: { name: built.fileName, contentBase64: built.pdf.toString("base64") },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "L'envoi de l'email a échoué.";
    return NextResponse.json({ error: `${message} Le statut n'a pas été modifié.` }, { status: 502 });
  }

  const contactId =
    kind === "invoice"
      ? (await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { contactId: true } })).contactId
      : (await prisma.quote.findUniqueOrThrow({ where: { id }, select: { contactId: true } })).contactId;

  if (kind === "invoice") {
    // Audit P1 : envoyer une facture ne déplace plus l'affaire dans le CRM
    // — le suivi « facturé / payé » vit en Facturation.
    await prisma.invoice.update({ where: { id }, data: { status: DocStatus.SENT } });
  } else {
    await prisma.quote.update({ where: { id }, data: { status: DocStatus.SENT } });
    await advanceOpportunityStage(session.organizationId, contactId, [PipelineStage.PROSPECT], PipelineStage.QUOTE_SENT);
  }

  return NextResponse.json({ sent: true, to: built.contactEmail }, { status: 201 });
}
