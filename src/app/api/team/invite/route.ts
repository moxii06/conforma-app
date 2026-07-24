import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

// Creates a pending team member (status "invited", no password set yet) and
// an activation token for /activation/[token], where they set their own
// password. Sends the activation link by real email via Brevo when
// configured; either way the URL is also returned in the API response so
// the admin can relay it manually as a fallback (Brevo not configured, or
// the send failed) — same "try real delivery, always keep the manual path"
// pattern as the Gmail/IMAP reply flow.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Champs invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const activationToken = randomBytes(20).toString("hex");
  const member = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      role: parsed.data.role,
      status: "invited",
      activationToken,
    },
  });

  const activationUrl = `${new URL(request.url).origin}/activation/${activationToken}`;

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: member.email,
      toName: member.name,
      subject: `Invitation à rejoindre ${organization.name} sur Jalon`,
      text: `Bonjour ${member.name},\n\n${session.name || session.email} vous invite à rejoindre l'espace ${organization.name} sur Jalon.\n\nActivez votre compte ici : ${activationUrl}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Fall through — activationUrl is still returned below for manual relay.
  }

  return NextResponse.json(
    { id: member.id, email: member.email, status: member.status, activationUrl, emailSent },
    { status: 201 }
  );
}
