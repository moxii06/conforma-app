import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";

const schema = z.object({ role: z.nativeEnum(Role).default(Role.TRAINER) });

// Client feedback: flagging a subcontractor as a formateur should let them
// become assignable to a session like any other trainer. Rather than
// teaching every trainer-picker in the app about a second "or a
// subcontractor" source, this creates a real platform User — same flow as
// /api/team/invite — and links it back via Subcontractor.linkedUserId.
// Once linked, they show up in every existing TRAINER query immediately
// (status "invited" is enough; they don't need to have logged in yet).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (subcontractor.linkedUserId) return NextResponse.json({ error: "Ce prestataire a déjà un compte." }, { status: 409 });
  if (!subcontractor.contactEmail) return NextResponse.json({ error: "Renseignez d'abord un email de contact." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

  const email = subcontractor.contactEmail.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });

  const activationToken = randomBytes(20).toString("hex");
  const member = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      name: subcontractor.name,
      email,
      role: parsed.data.role,
      status: "invited",
      activationToken,
    },
  });

  await prisma.subcontractor.update({ where: { id: subcontractor.id }, data: { linkedUserId: member.id } });

  const activationUrl = `${new URL(request.url).origin}/activation/${activationToken}`;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: member.email,
      toName: member.name,
      subject: `Invitation à rejoindre ${organization.name} sur Conforma`,
      text: `Bonjour ${member.name},\n\n${session.name || session.email} vous invite à rejoindre l'espace ${organization.name} sur Conforma.\n\nActivez votre compte ici : ${activationUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Fall through — activationUrl is still returned below for manual relay.
  }

  return NextResponse.json({ id: member.id, email: member.email, activationUrl, emailSent }, { status: 201 });
}
