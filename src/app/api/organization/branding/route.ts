import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";

const schema = z.object({
  brandColor: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")]).optional(),
});

// The color half of marque blanche — the logo lives at /api/organization/logo
// since it's a file upload, not a simple PATCH-able field.
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Couleur invalide." }, { status: 400 });

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: { brandColor: parsed.data.brandColor || null },
  });

  return NextResponse.json({ brandColor: updated.brandColor });
}
