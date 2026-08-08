import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageSessionInvitations } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { createSessionInvitation } from "@/lib/sessionInvitations";
import { sendTransactionalEmail } from "@/lib/brevo";
import { resolveAppOrigin } from "@/lib/appUrl";
import { issueCertificate } from "@/lib/certificateIssue";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";

const schema = z.object({
  type: z.enum(["contract", "convocation", "platform_access", "certificate", "learner_nudge"]),
});

// Single entry point for the "send from the client record" actions the
// dossier's Info tab exposes (spec request: contract, convocation, platform
// access — the positioning test already has its own dedicated flow via
// NeedsAssessmentRequest/send-needs-assessment). Convocation goes through
// createSessionInvitation, which sends its own real email; the others send
// here directly (best-effort — a failed send doesn't block the record/link
// from being created).
//
// Deux types ajoutés pour les tâches « À faire » du tableau de bord, qui
// atterrissent ici plutôt que dans une route à part : c'est le même geste
// (écrire à l'apprenant d'un dossier, et le tracer dans ClientOutreach), et
// une seconde route aurait fini par tracer autrement.
//
//   certificate   — l'attestation, une fois la formation terminée.
//   learner_nudge — la relance d'un apprenant décroché ou dont la durée
//                   d'accès s'épuise. Elle n'envoie aucun document : elle
//                   ramène vers l'espace apprenant, rien de plus.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  // Borne calculée sur les rôles effectifs — voir lib/proprieteRoles.ts.
  if (borneAuxSiennesDuFormateur(auth.roles) && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Type d'envoi invalide." }, { status: 400 });

  const sentByName = auth.name || auth.email;
  const origin = resolveAppOrigin(request);

  if (parsed.data.type === "convocation") {
    if (!canManageSessionInvitations(auth.roles, auth.userId, dossier.session)) {
      return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
    }
    try {
      const { meetingLink } = await createSessionInvitation({
        session: dossier.session,
        dossier,
        sentByUserId: auth.userId,
        sentByName,
      });
      return NextResponse.json({ meetingLink }, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 400 });
    }
  }

  if (can(auth.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  if (parsed.data.type === "certificate") {
    const issued = await issueCertificate(dossier.id, auth.organizationId);
    if (!issued.ok) return NextResponse.json({ error: issued.reason }, { status: issued.status });

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
    const outreach = await prisma.clientOutreach.create({
      data: {
        organizationId: auth.organizationId,
        contactId: dossier.contactId,
        dossierId: dossier.id,
        type: "certificate",
        sentByUserId: auth.userId,
        sentByName,
      },
    });

    const documentUrl = `${origin}/api/documents/generated/${issued.document.id}`;
    let emailSent = false;
    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — votre attestation de formation`,
        text:
          `Bonjour ${dossier.contact.firstName},\n\n` +
          `Votre attestation pour la formation « ${dossier.session.course.title} » est disponible ici :\n${documentUrl}\n\n` +
          `Conservez-la : elle peut vous être demandée par votre employeur ou votre financeur.\n\n` +
          `À bientôt,\nL'équipe ${organization.name}`,
        senderName: organization.name,
        replyTo: auth.email,
      });
      emailSent = true;
    } catch {
      // Non fatal — l'attestation existe, elle reste téléchargeable depuis
      // le dossier même si l'email n'est pas parti.
    }

    return NextResponse.json({ outreach, document: issued.document, emailSent }, { status: 201 });
  }

  if (parsed.data.type === "learner_nudge") {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

    // La date de dernière activité, calculée comme le tableau de bord la
    // calcule : le plus récent des événements enregistrés, à défaut le
    // premier accès. On ne l'annonce que si on la connaît — une relance qui
    // se tromperait de date perdrait toute crédibilité auprès de
    // l'apprenant, et il n'y a rien à gagner à meubler.
    const progress = await prisma.elearningProgress.findMany({
      where: { dossierId: dossier.id },
      select: { lastEventAt: true, assignedAt: true },
    });
    const derniereActivite = progress.reduce<Date | null>((latest, p) => {
      const candidate = p.lastEventAt ?? p.assignedAt;
      return !latest || candidate > latest ? candidate : latest;
    }, dossier.firstAccessedAt);
    const rappelActivite = derniereActivite
      ? `Votre dernière activité enregistrée remonte au ${derniereActivite.toLocaleDateString("fr-FR")}.\n\n`
      : "";

    const outreach = await prisma.clientOutreach.create({
      data: {
        organizationId: auth.organizationId,
        contactId: dossier.contactId,
        dossierId: dossier.id,
        type: "learner_nudge",
        sentByUserId: auth.userId,
        sentByName,
      },
    });

    let emailSent = false;
    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — reprenons votre formation « ${dossier.session.course.title} »`,
        text:
          `Bonjour ${dossier.contact.firstName},\n\n` +
          `Vous êtes inscrit à la formation « ${dossier.session.course.title} » et votre parcours est en cours.\n\n` +
          rappelActivite +
          `Vous pouvez le reprendre où vous l'aviez laissé depuis votre espace :\n${origin}/mon-espace\n\n` +
          `Si vous rencontrez une difficulté, répondez simplement à ce message.\n\n` +
          `À bientôt,\nL'équipe ${organization.name}`,
        senderName: organization.name,
        replyTo: auth.email,
      });
      emailSent = true;
    } catch {
      // Non fatal — la relance reste tracée dans l'historique du dossier.
    }

    return NextResponse.json({ outreach, emailSent }, { status: 201 });
  }

  if (parsed.data.type === "contract") {
    const template =
      (await prisma.documentTemplate.findFirst({
        where: { organizationId: auth.organizationId, category: "convention" },
        orderBy: { createdAt: "desc" },
      })) ?? (await prisma.documentTemplate.findFirst({ where: { organizationId: null, category: "convention" } }));
    if (!template) return NextResponse.json({ error: "Aucun modèle de convention disponible." }, { status: 400 });

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
    const merged = mergeTemplate(template.bodyText, {
      contact: dossier.contact,
      organization,
      session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
      dossier: { retentionUntil: dossier.retentionUntil },
      course: dossier.session.course,
    });

    const document = await prisma.document.create({
      data: {
        organizationId: auth.organizationId,
        dossierId: dossier.id,
        title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
        bodyText: merged,
        templateOrigin: template.title,
        category: template.category,
      },
    });

    const outreach = await prisma.clientOutreach.create({
      data: {
        organizationId: auth.organizationId,
        contactId: dossier.contactId,
        dossierId: dossier.id,
        type: "contract",
        sentByUserId: auth.userId,
        sentByName,
      },
    });

    const documentUrl = `${origin}/api/documents/generated/${document.id}`;
    let emailSent = false;
    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — votre convention de formation`,
        text: `Bonjour ${dossier.contact.firstName},\n\nVeuillez trouver votre convention de formation via ce lien :\n${documentUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
        senderName: organization.name,
        replyTo: auth.email,
      });
      emailSent = true;
    } catch {
      // Non-fatal — document and outreach record still exist.
    }

    return NextResponse.json({ outreach, document, emailSent }, { status: 201 });
  }

  // platform_access
  let learner = dossier.learnerUserId ? await prisma.user.findUnique({ where: { id: dossier.learnerUserId } }) : null;

  if (!learner) {
    const existing = await prisma.user.findUnique({ where: { email: dossier.contact.email.toLowerCase() } });
    if (existing && existing.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email sur une autre organisation." },
        { status: 409 }
      );
    }
    learner = existing;
  }

  let activationUrl: string | null = null;
  if (!learner) {
    const token = randomBytes(20).toString("hex");
    learner = await prisma.user.create({
      data: {
        organizationId: auth.organizationId,
        email: dossier.contact.email.toLowerCase(),
        name: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        role: Role.LEARNER,
        status: "invited",
        activationToken: token,
      },
    });
    activationUrl = `${origin}/activation/${token}`;
  } else if (learner.status === "invited") {
    const token = learner.activationToken ?? randomBytes(20).toString("hex");
    if (!learner.activationToken) {
      learner = await prisma.user.update({ where: { id: learner.id }, data: { activationToken: token } });
    }
    activationUrl = `${origin}/activation/${token}`;
  }

  await prisma.dossier.update({ where: { id: dossier.id }, data: { learnerUserId: learner.id } });

  // If the account was already active before this call, there's nothing
  // left to wait on — record it as acknowledged immediately rather than
  // leaving it stuck showing "en attente" in the Communications history.
  const alreadyActive = learner.status === "active";
  const outreach = await prisma.clientOutreach.create({
    data: {
      organizationId: auth.organizationId,
      contactId: dossier.contactId,
      dossierId: dossier.id,
      type: "platform_access",
      sentByUserId: auth.userId,
      sentByName,
      ...(alreadyActive ? { status: "acknowledged", acknowledgedAt: new Date() } : {}),
    },
  });

  let emailSent = false;
  if (activationUrl) {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
    try {
      await sendTransactionalEmail({
        to: dossier.contact.email,
        toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
        subject: `${organization.name} — accès à votre espace de formation`,
        text: `Bonjour ${dossier.contact.firstName},\n\nVotre accès à l'espace apprenant est prêt. Activez-le en définissant votre mot de passe ici :\n${activationUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
        senderName: organization.name,
        replyTo: auth.email,
      });
      emailSent = true;
    } catch {
      // Non-fatal — activationUrl is still returned for manual relay.
    }
  }

  return NextResponse.json({ outreach, activationUrl, alreadyActive, emailSent }, { status: 201 });
}
