import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["investigating", "contained", "closed"]).optional(),
  // true to stamp "now", false/omitted leaves it as-is — there's no un-notifying
  // the CNIL, so this never needs to accept an explicit date or clear one.
  notifyAuthority: z.boolean().optional(),
  notifySubjects: z.boolean().optional(),
  remediation: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.dataBreach.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const updated = await prisma.dataBreach.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.notifyAuthority && !existing.notifiedAuthorityAt ? { notifiedAuthorityAt: new Date() } : {}),
      ...(parsed.data.notifySubjects && !existing.notifiedSubjectsAt ? { notifiedSubjectsAt: new Date() } : {}),
      ...(parsed.data.remediation !== undefined ? { remediation: parsed.data.remediation } : {}),
    },
  });

  return NextResponse.json(updated);
}
