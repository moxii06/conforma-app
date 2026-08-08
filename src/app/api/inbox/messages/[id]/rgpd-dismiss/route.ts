import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(auth.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  await prisma.emailMessage.update({ where: { id: message.id }, data: { rgpdSuggestedType: null } });

  return NextResponse.json({ ok: true });
}
