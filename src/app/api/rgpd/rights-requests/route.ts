import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  requestType: z.enum(["access", "erasure", "portability", "rectification"]),
  personLabel: z.string().min(1),
  deadline: z.string().min(1),
});

// Legal response deadline defaults to 1 month from the request date, per
// spec §5.7 ("1 month, extendable by 2 for complex cases") — the deadline
// field is still editable so staff can push it out for the complex-case
// extension.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const deadline = new Date(parsed.data.deadline);
  if (Number.isNaN(deadline.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const request_ = await prisma.rightsRequest.create({
    data: {
      organizationId: session.organizationId,
      requestType: parsed.data.requestType,
      personLabel: parsed.data.personLabel,
      deadline,
      status: "open",
    },
  });

  return NextResponse.json(request_, { status: 201 });
}
