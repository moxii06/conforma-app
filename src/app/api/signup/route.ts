import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/onboardingEmails";
import { resolveAppOrigin } from "@/lib/appUrl";
import { consumeRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";
import { platformContactEmail } from "@/lib/platformAdmin";

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
  // Unlike siret/billingAddress below, mandatory: Jalon needs a phone
  // contact for every customer from day one, not just those who volunteer
  // full billing details.
  phone: z.string().trim().min(1, "Le numéro de téléphone est requis."),
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
  // Unauthenticated endpoint: keyed on IP, the only stable identifier here.
  const gate = await consumeRateLimit(`signup:${clientIp(request.headers)}`, RATE_LIMITS.signup);
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds, "Trop de créations de compte depuis cette adresse. Réessayez dans une heure.");

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
        billingPhone: data.phone,
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
  const baseUrl = resolveAppOrigin(request);
  await sendWelcomeEmail(baseUrl, {
    email,
    name: `${data.firstName} ${data.lastName}`,
    orgName: data.organizationName,
  }).catch(() => {});

  // Prévient Jalon lui-même côté /plateforme : c'est le seul moment où un
  // nouvel essai existe sans qu'aucune notification n'arrive autrement (il
  // apparaît dans la liste, mais rien ne signale qu'il vient d'apparaître).
  // Non bloquant, comme l'email de bienvenue ci-dessus.
  const notifyEmail = platformContactEmail();
  if (notifyEmail && isBrevoConfigured()) {
    await sendTransactionalEmail({
      to: notifyEmail,
      toName: "Équipe Jalon",
      senderName: "Jalon",
      subject: `Nouvel essai : ${data.organizationName}`,
      text: [
        `Organisme : ${data.organizationName}`,
        `Formule choisie : ${data.plan}`,
        `Contact : ${data.firstName} ${data.lastName} (${email})`,
        `Téléphone : ${data.phone}`,
        data.siret ? `SIRET : ${data.siret}` : null,
        "",
        `Fiche : ${baseUrl}/plateforme`,
      ]
        .filter(Boolean)
        .join("\n"),
      replyTo: email,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
