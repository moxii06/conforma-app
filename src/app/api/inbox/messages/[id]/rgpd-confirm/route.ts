import { NextResponse } from "next/server";
import { z } from "zod";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  requestType: z.enum(["access", "erasure", "portability", "rectification"]),
  personLabel: z.string().min(1),
});

// Turns an AI-flagged inbox message into an actual RightsRequest — the
// human-confirmation half of the RGPD classification feature (see
// classifyEmailForRgpd() in ai.ts and gmailSync.ts/imapSync.ts, which only
// ever set a suggestion, never create the compliance record themselves).
// Deadline defaults to the same 1-month rule as the manual /rgpd form.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(auth.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!message.rgpdSuggestedType) {
    return NextResponse.json({ error: "Aucune suggestion RGPD ouverte pour ce message." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const [rightsRequest] = await prisma.$transaction([
    prisma.rightsRequest.create({
      data: {
        organizationId: auth.organizationId,
        requestType: parsed.data.requestType,
        personLabel: parsed.data.personLabel,
        deadline: addMonths(new Date(), 1),
        status: "open",
      },
    }),
    prisma.emailMessage.update({ where: { id: message.id }, data: { rgpdSuggestedType: null } }),
  ]);

  return NextResponse.json(rightsRequest, { status: 201 });
}
