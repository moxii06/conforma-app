import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";

const schema = z.object({
  legalForm: z.string().trim().max(100).optional(),
  shareCapital: z.string().trim().max(100).optional(),
  legalAddress: z.string().trim().max(300).optional(),
  rcsCity: z.string().trim().max(100).optional(),
  rcsNumber: z.string().trim().max(100).optional(),
  legalRepresentativeName: z.string().trim().max(150).optional(),
  activityDeclarationNumber: z.string().trim().max(100).optional(),
  // Régime de TVA : il détermine la mention portée sur chaque facture émise.
  // Jamais deviné — voir le commentaire d'Organization.vatRegime.
  vatRegime: z.enum(["exempt", "standard"]).optional(),
  vatRatePercent: z.number().min(0).max(100).nullable().optional(),
  vatNumber: z.string().trim().max(30).optional(),
});

// Mentions légales printed on documents the OFP sends to its own clients —
// see mergeTemplate.ts's organization.* fields. Restricted to ADMIN_OF since
// these carry legal weight (RCS, capital social, représentant légal).
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // Les chaînes vides deviennent null ; vatRatePercent est un nombre et
  // vatRegime a une valeur par défaut en base, donc ni l'un ni l'autre ne
  // passe par cette normalisation — sinon un taux de 0 serait effacé.
  const data = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) =>
      typeof value === "string" ? [key, value || null] : [key, value],
    ),
  );

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data,
  });

  return NextResponse.json(updated);
}
