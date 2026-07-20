import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({ requestType: z.enum(["access", "erasure", "portability", "rectification"]) });

function oneMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const rightsRequest = await prisma.rightsRequest.create({
    data: {
      organizationId: session.organizationId,
      requestType: parsed.data.requestType,
      personLabel: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
      deadline: oneMonthFromNow(),
      status: "open",
    },
  });

  return NextResponse.json(rightsRequest, { status: 201 });
}
