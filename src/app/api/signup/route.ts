import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/onboardingEmails";

// Billing identity (SIRET + adresse) is intentionally OPTIONAL at signup:
// it's only needed once a trial converts to a paid Jalon subscription (not
// built yet — see Subscription's comment in schema.prisma), and requiring it
// up front is pure friction on a "no credit card" trial. Collected later,
// from /profil or at conversion. When provided, SIRET is still validated
// (14 digits) — an empty string is accepted and stored as null.
const optionalSiret = z
  .string()
  .regex(/^\d{14}$/, "Le SIRET doit contenir 14 chiffres.")
  .optional()
  .or(z.literal(""));

const schema = z.object({
  organizationName: z.string().min(1),
  siret: optionalSiret,
  billingAddress: z.string().optional(),
  billingPostalCode: z.string().optional(),
  billingCity: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "8 caractères minimum."),
  plan: z.enum(["solo", "team", "growth"]),
});

const TRIAL_DAYS = 14;

// Public — this is the account-creation endpoint reached from the
// marketing page's pricing cards, so no session exists yet. Per spec §8
// ("14-day trial, no credit card required"), this creates a live,
// immediately-usable account with Subscription.status = "trialing" and no
// Stripe customer/subscription id — nothing here processes a payment.
export async function POST(request: Request) {
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
    return NextResponse.json(
      { error: "Un compte existe déjà avec cet email. Connectez-vous plutôt." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.organizationName,
        siret: data.siret || null,
        billingAddress: data.billingAddress || null,
        billingPostalCode: data.billingPostalCode || null,
        billingCity: data.billingCity || null,
      },
    });
    await tx.user.create({
      data: {
        organizationId: org.id,
        email,
        name: `${data.firstName} ${data.lastName}`,
        role: Role.ADMIN_OF,
        passwordHash,
      },
    });
    await tx.subscription.create({
      data: {
        organizationId: org.id,
        plan: data.plan,
        status: "trialing",
        trialEndsAt,
      },
    });
  });

  // Email de bienvenue (J0 de la séquence d'onboarding) — non bloquant :
  // no-op si Brevo n'est pas configuré, et n'échoue jamais la création du
  // compte si l'envoi échoue. La suite de la séquence part du cron quotidien.
  const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  await sendWelcomeEmail(baseUrl, {
    email,
    name: `${data.firstName} ${data.lastName}`,
    orgName: data.organizationName,
  }).catch(() => {});

  return NextResponse.json({ ok: true }, { status: 201 });
}
