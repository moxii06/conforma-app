import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["active", "expired", "terminated"]).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(["formateur_externe", "sous_traitant_pedagogique", "prestataire_technique", "autre"]).optional(),
  isIndividual: z.boolean().optional(),
  legalForm: z.string().nullable().optional(),
  siret: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().nullable().optional(),
  qualifications: z.string().nullable().optional(),
  contractStartDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  qualificationExpiryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Single PATCH for both the quick status dropdown and full field edits
// (client feedback: there was no way to fix a typo or update a
// subcontractor's info after creation) — same pattern as the session/course
// PATCH routes.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const updated = await prisma.subcontractor.update({
    where: { id: subcontractor.id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.isIndividual !== undefined ? { isIndividual: data.isIndividual } : {}),
      ...(data.legalForm !== undefined ? { legalForm: data.legalForm || null } : {}),
      ...(data.siret !== undefined ? { siret: data.siret || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail || null } : {}),
      ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone || null } : {}),
      ...(data.qualifications !== undefined ? { qualifications: data.qualifications || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.contractStartDate !== undefined ? { contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null } : {}),
      ...(data.contractEndDate !== undefined ? { contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null } : {}),
      ...(data.qualificationExpiryDate !== undefined
        ? { qualificationExpiryDate: data.qualificationExpiryDate ? new Date(data.qualificationExpiryDate) : null }
        : {}),
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

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  // Only removes the Subcontractor record and its tracked documents — a
  // linked platform account (User), if any, stays untouched: it was created
  // via InviteSubcontractorButton as its own login and shouldn't disappear
  // just because the tracking record does.
  await prisma.$transaction([
    prisma.document.deleteMany({ where: { subcontractorId: subcontractor.id } }),
    prisma.subcontractor.delete({ where: { id: subcontractor.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
