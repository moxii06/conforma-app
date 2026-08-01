import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sendTransactionalEmail } from "@/lib/brevo";
import { mergeTemplate } from "@/lib/mergeTemplate";
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
  message: z.string().max(5000).optional(),
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

    for (const destinataire of prévu.to) {
      try {
        await sendTransactionalEmail({
          to: destinataire.email,
          toName: destinataire.name,
          subject: titre,
          text: message?.trim() || `Bonjour,\n\nVous trouverez ci-joint : ${titre}.\n\nBien cordialement,\n${expéditeur}\n${organization.name}`,
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
