import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";

const schema = z.object({
  requestType: z.enum(["access", "erasure", "portability", "rectification"]),
  details: z.string().optional(),
});

function oneMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

// Self-service counterpart to /api/dossiers/[id]/rights-request (which stays
// staff-only, initiated from a dossier) — filed by the learner themselves via
// the unified support dialog. Creates a real RightsRequest so it shows up in
// the RGPD registry (/rgpd?tab=droits) with its legal 1-month deadline
// tracked automatically, same as a staff-created one.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== "LEARNER") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const rightsRequest = await prisma.rightsRequest.create({
    data: {
      organizationId: session.organizationId,
      requestType: parsed.data.requestType,
      personLabel: session.name || session.email,
      details: parsed.data.details || null,
      submittedByUserId: session.userId,
      deadline: oneMonthFromNow(),
      status: "open",
    },
  });

  return NextResponse.json(rightsRequest, { status: 201 });
}
