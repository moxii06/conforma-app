import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";

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
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { course: true, dossiers: { include: { contact: true } } },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (!canManageSessionInvitations(auth.role, auth.userId, session)) {
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

  const recipients = session.dossiers.filter((d) => dossierIds.includes(d.id));
  if (recipients.length === 0) return NextResponse.json({ error: "Aucun apprenant sélectionné." }, { status: 400 });

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

  let attachment;
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
  for (const dossier of recipients) {
    await prisma.document.create({
      data: {
        organizationId: auth.organizationId,
        dossierId: dossier.id,
        title,
        fileUrl: attachment.fileUrl,
        templateOrigin,
        category: resolvedCategory,
        sentByUserId: auth.userId,
        sentByName: auth.name || auth.email,
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
      courseTitle: session.course.title,
      sessionDateLabel:
        session.mode === "ROLLING"
          ? "formation en continu"
          : session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      organizationName: organization.name,
    };
    const messageHtml = fillMergeTags(
      sanitizeRichText(messageHtmlRaw) || `<p>Bonjour ${dossier.contact.firstName},</p><p>Veuillez trouver ci-joint : ${title}.</p>`,
      mergeCtx
    );

    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — ${title}`,
        text: richTextToPlainText(messageHtml),
        html: messageHtml,
        senderName: organization.name,
        replyTo: auth.email,
        attachment: { name: attachment.fileName, contentBase64: attachment.contentBase64 },
      });
      sentCount++;
    } catch {
      emailFailedCount++;
    }
  }

  return NextResponse.json({ recipientCount: recipients.length, sentCount, emailFailedCount }, { status: 201 });
}
