import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageSessionInvitations } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { createSessionInvitation } from "@/lib/sessionInvitations";

const schema = z.object({ type: z.enum(["contract", "convocation", "platform_access"]) });

// Single entry point for the three "send from the client record" actions
// the dossier's Info tab exposes (spec request: contract, convocation,
// platform access — the positioning test already has its own dedicated
// flow via NeedsAssessmentRequest/send-needs-assessment). No real email
// delivery in any branch — same constraint as the rest of this scaffold.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Type d'envoi invalide." }, { status: 400 });

  const sentByName = auth.name || auth.email;
  const origin = new URL(request.url).origin;

  if (parsed.data.type === "convocation") {
    if (!canManageSessionInvitations(auth.role, auth.userId, dossier.session)) {
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

  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
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
    });

    const document = await prisma.document.create({
      data: {
        organizationId: auth.organizationId,
        dossierId: dossier.id,
        title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
        bodyText: merged,
        templateOrigin: template.title,
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

    return NextResponse.json({ outreach, document }, { status: 201 });
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

  return NextResponse.json({ outreach, activationUrl, alreadyActive }, { status: 201 });
}
