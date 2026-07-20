import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const schema = z.object({ password: z.string().min(8) });

// Consumes an activation token (issued either by a team invite or by
// "Envoyer l'accès plateforme" on a dossier) to let the account holder set
// their own password and become able to sign in — no session required,
// the token itself is the access control, same pattern as the public
// needs-assessment form.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const user = await prisma.user.findUnique({ where: { activationToken: params.token } });
  if (!user || user.status !== "invited") {
    return NextResponse.json({ error: "Lien d'activation invalide ou déjà utilisé." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "active", activationToken: null },
  });

  // If this activation closes out a "platform_access" outreach (learner
  // role, linked to a dossier), mark it acknowledged so the dossier's
  // Communications history and the dashboard's "relances à faire" stop
  // treating it as pending.
  if (user.role === "LEARNER") {
    const dossiers = await prisma.dossier.findMany({ where: { learnerUserId: user.id }, select: { id: true } });
    if (dossiers.length > 0) {
      await prisma.clientOutreach.updateMany({
        where: { dossierId: { in: dossiers.map((d) => d.id) }, type: "platform_access", status: "sent" },
        data: { status: "acknowledged", acknowledgedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
