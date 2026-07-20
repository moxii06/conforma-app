import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizationName: z.string().min(1),
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
      data: { name: data.organizationName },
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

  return NextResponse.json({ ok: true }, { status: 201 });
}
