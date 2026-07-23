import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canAccessAccommodations } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["pending", "granted", "declined"]),
  grantedAccommodations: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string; requestId: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  if (!canAccessAccommodations(session.role, session.userId, organization)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const accommodation = await prisma.accommodationRequest.findFirst({
    where: { id: params.requestId, dossierId: params.id, organizationId: session.organizationId },
  });
  if (!accommodation) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.accommodationRequest.update({
    where: { id: accommodation.id },
    data: {
      status: parsed.data.status,
      grantedAccommodations: parsed.data.grantedAccommodations,
      handledByUserId: session.userId,
      handledByName: session.name || session.email,
      handledAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
