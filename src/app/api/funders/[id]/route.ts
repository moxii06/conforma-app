import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(2).max(160).optional(),
  type: z.enum(["opco", "cpf", "france_travail", "agefice", "company", "individual", "public", "other"]).optional(),
  contactEmail: z.string().email().max(180).nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  archived: z.boolean().optional(),
});

async function authorize(funderId: string) {
  const session = await getSessionContext();
  if (!session) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  if (can(session.role, "invoicing") === "none") {
    return { error: NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 }) };
  }
  const funder = await prisma.funder.findFirst({
    where: { id: funderId, organizationId: session.organizationId },
  });
  if (!funder) return { error: NextResponse.json({ error: "Financeur introuvable." }, { status: 404 }) };
  return { session, funder };
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorize(params.id);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const d = parsed.data;

  if (d.name) {
    const clash = await prisma.funder.findFirst({
      where: { organizationId: auth.session.organizationId, name: d.name.trim(), id: { not: auth.funder.id } },
    });
    if (clash) return NextResponse.json({ error: "Un financeur porte déjà ce nom." }, { status: 409 });
  }

  const funder = await prisma.funder.update({
    where: { id: auth.funder.id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail || null } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      ...(d.archived !== undefined ? { archivedAt: d.archived ? new Date() : null } : {}),
    },
  });
  return NextResponse.json(funder);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorize(params.id);
  if ("error" in auth) return auth.error;

  // A funder attached to real commitments is archived, never deleted:
  // removing it would silently rewrite the funding history of dossiers that
  // have already been invoiced and, for some, audited. Archiving hides it
  // from the pickers while leaving those dossiers readable.
  const used = await prisma.fundingCommitment.count({ where: { funderId: auth.funder.id } });
  if (used > 0) {
    return NextResponse.json(
      {
        error: `Ce financeur est utilisé sur ${used} dossier${used > 1 ? "s" : ""} — il a été archivé plutôt que supprimé, pour ne pas réécrire leur historique.`,
        archived: true,
      },
      { status: 409 },
    );
  }

  await prisma.funder.delete({ where: { id: auth.funder.id } });
  return NextResponse.json({ ok: true });
}
