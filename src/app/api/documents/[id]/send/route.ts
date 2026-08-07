import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSessionContext, can } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sendTransactionalEmail } from "@/lib/brevo";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { fillMergeTags } from "@/lib/mergeTags";
import { planSend, invalidRecipients, type Recipient } from "@/lib/documentBatch";
import { scopeOfCategory } from "@/lib/documentScope";
import { isYousignConfigured, sendDocumentForSignature } from "@/lib/yousign";

// L'envoi unifié. C'est ici que le batchId est enfin rempli — le
// regroupement « 5/8 signés » de l'espace Documents en dépend.
//
// Un document finalisé sert de PATRON : il n'est jamais envoyé tel quel sur
// un document par apprenant. On en tire N exemplaires, chacun fusionné avec
// les données de son destinataire, chacun signable séparément. Le patron
// reste en base, inchangé, ce qui permet de renvoyer plus tard à un
// nouveau stagiaire sans tout refaire.

const schema = z.object({
  recipients: z
    .array(
      z.object({
        dossierId: z.string().nullable(),
        contactId: z.string().nullable(),
        name: z.string().min(1),
        email: z.string(),
      }),
    )
    .min(1)
    .max(200),
  // Généreux : un message enrichi (gras/italique/police) avec la signature
  // de l'expéditeur ajoutée en fin de corps dépasse vite le texte brut.
  message: z.string().max(20000).optional(),
  requestSignature: z.boolean().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { recipients, message, requestSignature } = parsed.data;
  // Assaini une seule fois — jamais le HTML brut envoyé par le client
  // directement dans un email. Fusionné par destinataire plus bas, comme le
  // corps du document juste en dessous.
  const messageHtml = sanitizeRichText(message ?? "");

  const patron = await prisma.document.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
  });
  if (!patron) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!patron.bodyText) {
    return NextResponse.json({ error: "Ce document n'a pas de contenu à envoyer." }, { status: 400 });
  }
  // Un brouillon n'est pas prêt à partir : c'est tout le sens de l'étape
  // « Finaliser », qui vérifie au passage qu'aucune balise ne traîne.
  if (patron.status !== "final") {
    return NextResponse.json({ error: "Finalisez le document avant de l'envoyer." }, { status: 409 });
  }

  const mauvaises = invalidRecipients(recipients as Recipient[]);
  if (mauvaises.length > 0) {
    return NextResponse.json(
      { error: `Adresse manquante ou invalide pour : ${mauvaises.map((r) => r.name).join(", ")}.` },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: auth.organizationId },
    include: { referentHandicapUser: { select: { name: true } } },
  });

  const plan = planSend(patron.category, recipients as Recipient[], randomBytes(12).toString("hex"));
  const expéditeur = auth.name || auth.email;
  // Une seule vérification pour tout le lot plutôt qu'une par exemplaire —
  // même config Yousign pour tous les destinataires d'un même envoi.
  const yousignConfigured = requestSignature ? await isYousignConfigured(auth.organizationId) : false;

  const créés: string[] = [];
  const échecs: { name: string; raison: string }[] = [];

  for (const prévu of plan.documents) {
    // Les données du destinataire, pour résoudre ses propres jetons.
    const dossier = prévu.recipient.dossierId
      ? await prisma.dossier.findFirst({
          where: { id: prévu.recipient.dossierId, organizationId: auth.organizationId },
          include: { contact: { include: { company: true } }, session: { include: { course: true } } },
        })
      : null;

    const corps =
      plan.scope === "per_learner" && dossier
        ? mergeTemplate(patron.bodyText, {
            contact: dossier.contact,
            organization: { ...organization, referentHandicapName: organization.referentHandicapUser?.name ?? null },
            session: {
              courseTitle: dossier.session.course.title,
              startsAt: dossier.session.startsAt,
              location: dossier.session.location,
            },
            course: dossier.session.course,
            company: dossier.contact.company
              ? {
                  name: dossier.contact.company.name,
                  siret: dossier.contact.company.siret,
                  address: dossier.contact.company.address,
                  legalRepresentativeName: dossier.contact.company.legalRepresentativeName,
                }
              : null,
          })
        : patron.bodyText;

    // Même logique que le corps juste au-dessus : les balises [Prénom] etc.
    // ne se résolvent que quand on a un dossier à qui les rattacher — en
    // scope "single" ou sans dossier, le message part tel quel.
    const messagePersonnalisé =
      plan.scope === "per_learner" && dossier
        ? fillMergeTags(messageHtml, {
            firstName: dossier.contact.firstName,
            lastName: dossier.contact.lastName,
            courseTitle: dossier.session.course.title,
            sessionDateLabel:
              dossier.session.mode === "ROLLING"
                ? "formation en continu"
                : dossier.session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
            organizationName: organization.name,
          })
        : messageHtml;

    const titre = `${patron.title}${prévu.titleSuffix}`;

    let pièce: Awaited<ReturnType<typeof buildDocumentAttachment>>;
    try {
      pièce = await buildDocumentAttachment({
        mode: "template",
        title: titre,
        bodyHtml: corps,
        organizationId: auth.organizationId,
        ownerKey: prévu.recipient.dossierId ?? `contact-${prévu.recipient.contactId ?? "inconnu"}`,
      });
    } catch (e) {
      // Le stockage n'est pas configuré, ou a refusé. On continue les
      // autres : sur huit contrats, échouer entièrement parce que le
      // troisième a un problème serait pire que d'en livrer sept et de le
      // dire.
      échecs.push({ name: prévu.recipient.name, raison: e instanceof Error ? e.message : "Échec de génération." });
      continue;
    }

    // Même repli que la fiche dossier : un exemplaire lié à un dossier peut
    // se signer depuis mon-espace si Yousign échoue ou n'est pas configuré
    // (stub) ; un destinataire sans dossier (autre contact, sous-traitant)
    // n'a pas cet accès, donc pas de repli — voir la tentative Yousign
    // ci-dessous, même logique que /api/dossiers/[id]/documents/send.
    const doc = await prisma.document.create({
      data: {
        organizationId: auth.organizationId,
        dossierId: prévu.recipient.dossierId,
        contactId: prévu.recipient.dossierId ? null : prévu.recipient.contactId,
        title: titre,
        bodyText: corps,
        fileUrl: pièce.fileUrl,
        category: patron.category,
        templateOrigin: patron.templateOrigin,
        // L'échéancier suit le document jusqu'au destinataire.
        //
        // Il restait sur le patron : les N exemplaires réellement envoyés
        // partaient sans, et materialiseScheduleFromSignedDocument — qui lit
        // Document.paymentSchedule sur le document SIGNÉ — ne trouvait rien.
        // Un contrat échelonné signé ne créait donc aucune facture, donc
        // aucune relance et aucun rapprochement bancaire possible. Chaque
        // exemplaire porte le même échéancier, ce qui est correct : c'est le
        // même montant dû par chaque apprenant, et la matérialisation est
        // idempotente par dossier.
        paymentSchedule: patron.paymentSchedule ?? Prisma.DbNull,
        status: "final",
        batchId: plan.batchId,
        sentByUserId: auth.userId,
        sentByName: expéditeur,
        signatureStatus: requestSignature && dossier ? "pending" : "none",
        signatureProvider: requestSignature && dossier ? "stub" : null,
      },
      select: { id: true },
    });
    créés.push(doc.id);

    // Le vrai envoi Yousign quand l'organisme a une clé configurée (la
    // sienne ou celle de la plateforme — lib/yousign.ts) ; `provider` est
    // alors "yousign_org" ou "yousign_platform", le vocabulaire que
    // lib/signatureQuota.ts compte réellement — jamais le littéral "yousign"
    // écrit ici avant, que le décompte de forfait ne reconnaissait pas.
    let sentViaYousign = false;
    if (requestSignature && yousignConfigured) {
      // Le dossier donne prénom/nom exacts ; un destinataire sans dossier
      // n'a qu'un nom affiché — même découpe au mieux que la route
      // sous-traitant (/api/subcontractors/[id]/documents/send).
      const [prénomDéduit, ...resteDéduit] = prévu.recipient.name.trim().split(/\s+/);
      const signerFirstName = dossier ? dossier.contact.firstName : prénomDéduit || prévu.recipient.name;
      const signerLastName = dossier ? dossier.contact.lastName : resteDéduit.join(" ") || signerFirstName;
      const signerEmail = dossier ? dossier.contact.email : prévu.recipient.email;
      try {
        const { signatureRequestId, provider } = await sendDocumentForSignature(auth.organizationId, {
          name: titre,
          pdf: Buffer.from(pièce.contentBase64, "base64"),
          filename: pièce.fileName,
          signerFirstName,
          signerLastName,
          signerEmail,
        });
        await prisma.document.update({
          where: { id: doc.id },
          data: { yousignSignatureRequestId: signatureRequestId, signatureProvider: provider, signatureStatus: "pending" },
        });
        sentViaYousign = true;
      } catch {
        // Repli sur le stub (dossier) ou sur rien (pas de dossier) — non
        // bloquant, comme partout ailleurs : le document part quand même.
      }
    }

    // Sans cette phrase, l'email partait avec le PDF mais sans aucune
    // mention de signature — cocher la case ne changeait rien pour le
    // destinataire, contrairement à l'envoi depuis la fiche dossier.
    const signatureNote = sentViaYousign
      ? `<p><br></p><p>Ce document attend votre signature électronique — vous allez recevoir un email séparé de Yousign avec le lien pour signer.</p>`
      : requestSignature && dossier
        ? `<p><br></p><p>Ce document attend votre signature électronique — rendez-vous dans votre espace personnel, onglet « Mes documents », pour le signer.</p>`
        : "";
    const messageFinal = messagePersonnalisé + signatureNote;

    const texteBrut =
      richTextToPlainText(messageFinal) ||
      `Bonjour,\n\nVous trouverez ci-joint : ${titre}.\n\nBien cordialement,\n${expéditeur}\n${organization.name}`;

    for (const destinataire of prévu.to) {
      try {
        await sendTransactionalEmail({
          to: destinataire.email,
          toName: destinataire.name,
          subject: titre,
          text: texteBrut,
          html: messageFinal || undefined,
          senderName: organization.name,
          replyTo: auth.email,
          attachment: { name: pièce.fileName, contentBase64: pièce.contentBase64 },
        });
      } catch (e) {
        // Le document EXISTE et reste dans « envoyés » : il a bien été
        // produit et déposé. Seul l'acheminement a échoué, et le dire
        // permet de relancer la bonne personne plutôt que tout refaire.
        échecs.push({ name: destinataire.name, raison: e instanceof Error ? e.message : "Échec de l'envoi." });
      }
    }
  }

  return NextResponse.json({
    created: créés.length,
    batchId: plan.batchId,
    scope: scopeOfCategory(patron.category),
    failures: échecs,
  });
}
