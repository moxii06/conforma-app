import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({ password: z.string().min(8) });

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const user = await prisma.user.findUnique({ where: { passwordResetToken: params.token } });
  if (!user || !user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      // Invalidates every other session for this account — see
      // getSessionContext()'s freshness check in lib/tenant.ts. A reset
      // that leaves an attacker's existing session alive would defeat the
      // point of resetting in the first place.
      passwordChangedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
