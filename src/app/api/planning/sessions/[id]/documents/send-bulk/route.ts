import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { repartirEnvoi, CONCURRENCE_ENVOI } from "@/lib/bulkSendBatch";

// Bulk counterpart to /api/dossiers/[id]/documents/send — sends the SAME
// document to every selected learner enrolled in a session in one action
// (QW9: staff previously had to open each dossier and send one by one).
// The attachment (PDF or uploaded file) is generated/uploaded ONCE and
// reused for every recipient — a real efficiency win, and consistent with
// the single-send route's own behavior, where the PDF body is never
// per-recipient merged anyway (only the accompanying email message is,
// via [Prénom]-style MERGE_TAGS, which this route still personalizes per
// learner). No e-signature option here — requesting N signature flows at
// once from a single click is a different, riskier action than a bulk
// document drop.
//
// Audit S7, P1 n°7 — deux défauts corrigés ici, qui n'en faisaient qu'un
// à l'usage.
//
// L'envoi était une boucle séquentielle SANS maxDuration : la plateforme
// la coupait vers la quarantaine de destinataires. Rien ne le disait —
// l'appelant recevait une erreur réseau alors que trente-neuf documents
// étaient déjà partis. Et comme rien ne gardait trace de qui avait été
// servi, relancer renvoyait le document à tout le monde, y compris à ceux
// qui l'avaient déjà reçu. Un document parti ne se rattrape pas.
//
// Le remède tient en trois pièces : un budget de temps explicite, un
// plafond par passage qui tient DANS ce budget, et une clé de lot qui
// rend le rejeu convergent au lieu de duplicatif. La décision « qui
// sert-on à ce passage » vit dans lib/bulkSendBatch.ts, où elle est
// testée sans dépendre d'un fournisseur d'emails ni d'un stockage.
export const maxDuration = 60;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { course: true, dossiers: { include: { contact: true } } },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (!canManageSessionInvitations(auth.roles, auth.userId, session)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const mode = formData.get("mode")?.toString();
  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString() || "other";
  const messageHtmlRaw = formData.get("message")?.toString() ?? "";
  const dossierIds = formData.getAll("dossierIds").map((v) => v.toString());
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  if (mode !== "template" && mode !== "upload") return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  if (dossierIds.length === 0) return NextResponse.json({ error: "Aucun apprenant sélectionné." }, { status: 400 });

  const demandes = session.dossiers.filter((d) => dossierIds.includes(d.id));
  if (demandes.length === 0) return NextResponse.json({ error: "Aucun apprenant sélectionné." }, { status: 400 });

  // La clé de lot vient de l'appelant, posée UNE fois au premier clic et
  // rejouée à l'identique aux passages suivants. C'est elle qui distingue
  // « je reprends le lot interrompu » (on saute ceux qui ont déjà reçu) de
  // « je renvoie volontairement le document » (nouveau lot, tout repart).
  // Sans cette distinction, l'idempotence empêcherait un renvoi légitime.
  const batchId = formData.get("batchId")?.toString() || crypto.randomUUID();
  const dejaServis = new Set(
    (
      await prisma.document.findMany({
        where: { organizationId: auth.organizationId, batchId, dossierId: { in: demandes.map((d) => d.id) } },
        select: { dossierId: true },
      })
    )
      // dossierId est nullable sur Document (un document peut appartenir à
      // un prospect, un sous-traitant, un membre d'équipe) — ceux-là ne
      // peuvent pas être « déjà servis » pour un dossier.
      .flatMap((d) => (d.dossierId ? [d.dossierId] : []))
  );

  const { aServir: recipients, reste } = repartirEnvoi({ demandes, dejaServis });

  if (recipients.length === 0) {
    // Tout le lot est déjà parti : on le dit plutôt que de renvoyer.
    return NextResponse.json(
      { batchId, recipientCount: demandes.length, sentCount: 0, emailFailedCount: 0, dejaEnvoyes: dejaServis.size, reste: 0, echecs: [] },
      { status: 200 }
    );
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

  let templateOrigin: string | undefined;
  let resolvedCategory = category;
  let bodyHtml: string | undefined;
  if (mode === "template") {
    bodyHtml = sanitizeRichText(formData.get("bodyText")?.toString() ?? "");
    if (!richTextToPlainText(bodyHtml)) return NextResponse.json({ error: "Le contenu du document est vide." }, { status: 400 });
    const templateId = formData.get("templateId")?.toString() || null;
    const template = templateId
      ? await prisma.documentTemplate.findFirst({ where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] } })
      : null;
    templateOrigin = template?.title;
    resolvedCategory = template?.category ?? category;
  }

  let attachment: Awaited<ReturnType<typeof buildDocumentAttachment>>;
  try {
    attachment = await buildDocumentAttachment({
      mode,
      title,
      bodyHtml,
      file: mode === "upload" ? (formData.get("file") as File | null) ?? undefined : undefined,
      organizationId: auth.organizationId,
      ownerKey: `session-${session.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de la préparation du document." }, { status: 400 });
  }

  let sentCount = 0;
  let emailFailedCount = 0;
  const echecs: { nom: string; message: string }[] = [];

  // Rebindés en const : la fonction ci-dessous est imbriquée, et TypeScript
  // n'y reconduit pas les restrictions de type obtenues par les gardes du
  // dessus (auth et session y redeviennent nullables).
  const contexte = auth;
  const seance = session;
  const piece = attachment;
  const titre = title;

  async function servir(dossier: (typeof recipients)[number]) {
    // Le document est créé AVANT l'envoi, avec la clé de lot. C'est cette
    // ligne-là qui empêchera un rejeu de renvoyer à cette personne : même
    // si l'email échoue juste après, le document existe et lui est
    // rattaché — l'échec est nommé dans la réponse pour être traité à la
    // main, pas noyé dans un renvoi général.
    await prisma.document.create({
      data: {
        organizationId: contexte.organizationId,
        dossierId: dossier.id,
        batchId,
        title: titre,
        fileUrl: piece.fileUrl,
        templateOrigin,
        category: resolvedCategory,
        sentByUserId: contexte.userId,
        sentByName: contexte.name || contexte.email,
      },
    });
    // L'envoi groupé cochait l'étape « convention » du parcours mais pas
    // « convocation » — alors que convoquer huit personnes d'un coup est
    // précisément ce pour quoi cet écran existe. Sans ça, il fallait
    // rouvrir les huit dossiers un par un pour cocher à la main, ou passer
    // par le composeur de convocation huit fois.
    //
    // Effet de bord voulu : convocationSent est aussi la précondition des
    // rappels automatiques de session (cron automation-rules) — un envoi
    // groupé arme donc désormais les relances, comme un envoi unitaire.
    const parcoursStep =
      resolvedCategory === "convention"
        ? { contractSigned: true }
        : resolvedCategory === "convocation"
          ? { convocationSent: true }
          : null;
    if (parcoursStep) {
      await prisma.dossier.update({ where: { id: dossier.id }, data: parcoursStep });
    }

    const mergeCtx = {
      firstName: dossier.contact.firstName,
      lastName: dossier.contact.lastName,
      courseTitle: seance.course.title,
      sessionDateLabel:
        seance.mode === "ROLLING"
          ? "formation en continu"
          : seance.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      organizationName: organization.name,
    };
    const messageHtml = fillMergeTags(
      sanitizeRichText(messageHtmlRaw) || `<p>Bonjour ${dossier.contact.firstName},</p><p>Veuillez trouver ci-joint : ${titre}.</p>`,
      mergeCtx
    );

    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — ${titre}`,
        text: richTextToPlainText(messageHtml),
        html: messageHtml,
        senderName: organization.name,
        replyTo: contexte.email,
        attachment: { name: piece.fileName, contentBase64: piece.contentBase64 },
      });
      sentCount++;
    } catch (e) {
      emailFailedCount++;
      // Nommé, jamais résumé en « quelques erreurs » : sans le nom,
      // impossible de savoir à qui transmettre le document à la main.
      echecs.push({
        nom: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        message: e instanceof Error ? e.message : "Envoi refusé",
      });
    }
  }

  // File partagée + N ouvriers : la concurrence reste bornée quel que soit
  // le nombre de destinataires, et le passage tient dans son budget.
  const file = [...recipients];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCE_ENVOI, recipients.length) }, async () => {
      for (;;) {
        const suivant = file.shift();
        if (!suivant) return;
        await servir(suivant);
      }
    })
  );

  return NextResponse.json(
    {
      batchId,
      recipientCount: demandes.length,
      sentCount,
      emailFailedCount,
      echecs,
      dejaEnvoyes: dejaServis.size,
      // Ce qui n'a pas été tenté faute de place dans ce passage. L'appelant
      // relance avec le MÊME batchId et reprend exactement ici.
      reste,
    },
    { status: 201 }
  );
}
