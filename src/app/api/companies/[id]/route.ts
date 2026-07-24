import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1),
  siret: z.string().optional(),
  address: z.string().optional(),
  responsableFirstName: z.string().optional(),
  responsableLastName: z.string().optional(),
  responsableEmail: z.string().email().optional().or(z.literal("")),
  responsablePhone: z.string().optional(),
});

// Client feedback: staff need to correct/complete a company's info (and its
// named responsable) after the fact, not only capture it once at enrollment
// — same record used across every learner from that company.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const company = await prisma.company.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: parsed.data.name,
      siret: parsed.data.siret || null,
      address: parsed.data.address || null,
      responsableFirstName: parsed.data.responsableFirstName || null,
      responsableLastName: parsed.data.responsableLastName || null,
      responsableEmail: parsed.data.responsableEmail || null,
      responsablePhone: parsed.data.responsablePhone || null,
    },
  });

  return NextResponse.json(updated);
}
