import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";

const schema = z.object({
  withdrawalAccessPolicy: z.enum(["closed", "partial"]).optional(),
  // Percent, not a fraction — reused as-is in mergeTemplate.ts's
  // contract.cancellationFeePercent/Amount. Reciprocal by construction
  // (see the schema comment on Organization.cancellationFeePercent): there
  // is no separate "for the client" vs "for the OFP" value.
  cancellationFeePercent: z.union([z.number().int().min(0).max(100), z.null()]).optional(),
  regionPrefecture: z.string().trim().max(150).optional(),
  mediatorName: z.string().trim().max(200).optional(),
  mediatorContact: z.string().trim().max(300).optional(),
});

// Settings with no other home: read into every generated contract via
// organization.* merge fields (mergeTemplate.ts) and into the withdrawal
// content gate (lib/withdrawalGate.ts), but none of them describe an
// activity, a session or a document on their own — they belong to the
// organisation once, not to whichever record happens to need them first.
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const d = parsed.data;

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      ...(d.withdrawalAccessPolicy !== undefined ? { withdrawalAccessPolicy: d.withdrawalAccessPolicy } : {}),
      ...(d.cancellationFeePercent !== undefined ? { cancellationFeePercent: d.cancellationFeePercent } : {}),
      ...(d.regionPrefecture !== undefined ? { regionPrefecture: d.regionPrefecture || null } : {}),
      ...(d.mediatorName !== undefined ? { mediatorName: d.mediatorName || null } : {}),
      ...(d.mediatorContact !== undefined ? { mediatorContact: d.mediatorContact || null } : {}),
    },
  });

  return NextResponse.json(updated);
}
