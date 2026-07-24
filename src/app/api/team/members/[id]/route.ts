import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const member = await prisma.user.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!member) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // The org's single ADMIN_OF ("owner") can't be reassigned to another role,
  // and no one else can be promoted into it — same restriction InviteMemberForm
  // already applies at invite time, enforced again here since role edits
  // bypass that form.
  if (parsed.data.role && parsed.data.role !== member.role) {
    if (member.role === Role.ADMIN_OF || parsed.data.role === Role.ADMIN_OF) {
      return NextResponse.json({ error: "Le rôle Admin OF ne peut pas être modifié." }, { status: 400 });
    }
  }

  if (parsed.data.email && parsed.data.email.toLowerCase() !== member.email) {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: member.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase(),
      role: parsed.data.role,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const member = await prisma.user.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!member) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (member.id === session.userId) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous supprimer vous-même." }, { status: 400 });
  }
  if (member.role === Role.ADMIN_OF) {
    return NextResponse.json({ error: "L'Admin OF ne peut pas être supprimé." }, { status: 400 });
  }

  // Every FK a User can be referenced by (Session.trainerId,
  // Dossier.learnerUserId, Organization.referentHandicapUserId,
  // Subcontractor.linkedUserId, Course.responsibleUsers) is set up ON
  // DELETE SET NULL or is an implicit many-to-many, so the delete itself
  // unassigns them cleanly — only their own Document rows need explicit
  // cleanup first so they don't end up orphaned with a null owner.
  await prisma.$transaction([
    prisma.document.deleteMany({ where: { userId: member.id } }),
    prisma.user.delete({ where: { id: member.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
