import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(["formateur_externe", "sous_traitant_pedagogique", "prestataire_technique", "autre"]),
  siret: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  qualifications: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  qualificationExpiryDate: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const subcontractor = await prisma.subcontractor.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name,
      type: parsed.data.type,
      siret: parsed.data.siret || null,
      contactEmail: parsed.data.contactEmail || null,
      contactPhone: parsed.data.contactPhone || null,
      qualifications: parsed.data.qualifications || null,
      contractStartDate: parsed.data.contractStartDate ? new Date(parsed.data.contractStartDate) : null,
      contractEndDate: parsed.data.contractEndDate ? new Date(parsed.data.contractEndDate) : null,
      qualificationExpiryDate: parsed.data.qualificationExpiryDate ? new Date(parsed.data.qualificationExpiryDate) : null,
    },
  });

  return NextResponse.json(subcontractor, { status: 201 });
}
