import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";

const schema = z.object({ email: z.string().email() });
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — see the User.passwordResetToken comment in schema.prisma

// Always responds the same way regardless of whether the email matches an
// account — an unauthenticated caller must not be able to use this to probe
// which emails have accounts. Only "invited" (never-activated) accounts are
// skipped: they don't have a password to reset yet, they need the original
// activation link instead.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.status === "active") {
    const token = randomBytes(20).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const organization = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    const resetUrl = `${new URL(request.url).origin}/reinitialiser-mot-de-passe/${token}`;
    try {
      await sendTransactionalEmail({
        to: user.email,
        toName: user.name,
        subject: "Réinitialisation de votre mot de passe Jalon",
        text: `Bonjour ${user.name},\n\nUne réinitialisation de mot de passe a été demandée pour votre compte. Ce lien est valable 1 heure :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
        senderName: organization?.name ?? "Jalon",
      });
    } catch {
      // Non-fatal — same generic response either way, see comment above.
    }
  }

  return NextResponse.json({ ok: true });
}
