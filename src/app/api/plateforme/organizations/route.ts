import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";
import { resolveAppOrigin } from "@/lib/appUrl";

const schema = z.object({
  organizationName: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
  plan: z.enum(["solo", "team", "growth"]),
});

const TRIAL_DAYS = 14;

// Onboarding manuel d'un organisme par le propriétaire de la plateforme —
// même résultat que /api/signup (Organization + premier compte ADMIN_OF +
// Subscription "trialing"), mais sans mot de passe saisi par personne ici :
// Gu ne doit jamais connaître le mot de passe d'un client. Le compte est
// créé "invited" avec un activationToken, exactement comme une invitation
// d'équipe classique (/api/team/invite) — la personne choisit son propre
// mot de passe via /activation/[token].
export async function POST(request: Request) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Champs invalides.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const activationToken = randomBytes(20).toString("hex");
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000);

  const { organization, member } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: data.organizationName } });
    const member = await tx.user.create({
      data: {
        organizationId: organization.id,
        email,
        name: `${data.firstName} ${data.lastName}`,
        role: Role.ADMIN_OF,
        status: "invited",
        activationToken,
      },
    });
    await tx.subscription.create({
      data: { organizationId: organization.id, plan: data.plan, status: "trialing", trialEndsAt },
    });
    return { organization, member };
  });

  const activationUrl = `${resolveAppOrigin(request)}/activation/${activationToken}`;

  let emailSent = false;
  if (isBrevoConfigured()) {
    try {
      await sendTransactionalEmail({
        to: member.email,
        toName: member.name,
        subject: `Votre espace Jalon est prêt, ${data.firstName}`,
        text: `Bonjour ${data.firstName},\n\nVotre espace ${data.organizationName} a été créé sur Jalon.\n\nActivez votre compte et choisissez votre mot de passe ici : ${activationUrl}\n\nÀ bientôt,\nL'équipe Jalon`,
        senderName: "Jalon",
      });
      emailSent = true;
    } catch {
      // activationUrl est renvoyé ci-dessous pour un relais manuel — même
      // filet de sécurité que /api/team/invite.
    }
  }

  return NextResponse.json(
    { id: organization.id, name: organization.name, activationUrl, emailSent },
    { status: 201 },
  );
}
