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
        signatureStatus: requestSignature ? "pending" : "none",
        signatureProvider: requestSignature ? "yousign" : null,
      },
      select: { id: true },
    });
    créés.push(doc.id);

    const texteBrut =
      richTextToPlainText(messagePersonnalisé) ||
      `Bonjour,\n\nVous trouverez ci-joint : ${titre}.\n\nBien cordialement,\n${expéditeur}\n${organization.name}`;

    for (const destinataire of prévu.to) {
      try {
        await sendTransactionalEmail({
          to: destinataire.email,
          toName: destinataire.name,
          subject: titre,
          text: texteBrut,
          html: messagePersonnalisé || undefined,
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
