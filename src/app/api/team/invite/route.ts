import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

// Creates a pending team member (status "invited", no password set yet) and
// an activation token for /activation/[token], where they set their own
// password. There's no email-delivery step here — spec §3 pencils in Brevo
// for transactional email, which isn't wired into this scaffold — so the
// activation link needs to be relayed to the invitee some other way for
// now (shown to the admin who sent the invite, same pattern as every other
// "no real delivery yet" flow in this app).
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
  return NextResponse.json({ id: member.id, email: member.email, status: member.status, activationUrl }, { status: 201 });
}
