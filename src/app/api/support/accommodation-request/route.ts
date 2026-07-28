import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";

const schema = z.object({
  dossierId: z.string().min(1),
  description: z.string().min(1),
  requestedAccommodations: z.string().min(1),
});

// QW7 — the learner-facing counterpart to the staff-side AccommodationForm
// (dossier "Accessibilité" tab, /api/dossiers/[id]/accommodations) and the
// pre-enrollment needs-assessment flow (/api/public/needs-assessment):
// a logged-in learner whose accommodation need only becomes clear AFTER
// enrolling can now raise it themselves via the support dialog, instead of
// only by emailing the référent handicap directly (mon-espace's
// ReferentHandicapCard is read-only). Same confidentiality boundary as
// every other AccommodationRequest creation path — the row is only ever
// readable via canAccessAccommodations(), never surfaced back to the
// learner or to regular dossier-level staff.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.LEARNER) {
    return NextResponse.json({ error: "Réservé aux apprenants." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const created = await prisma.accommodationRequest.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      description: parsed.data.description,
      requestedAccommodations: parsed.data.requestedAccommodations,
      createdByName: session.name || session.email,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
