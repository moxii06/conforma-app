import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  qualiopiCertificateNumber: z.string().nullable().optional(),
  qualiopiCertifier: z.string().nullable().optional(),
  qualiopiCertifiedSince: z.string().nullable().optional(),
  qualiopiCertificateUntil: z.string().nullable().optional(),
  qualiopiCategories: z.string().nullable().optional(),
});

export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const d = parsed.data;

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      ...(d.qualiopiCertificateNumber !== undefined ? { qualiopiCertificateNumber: d.qualiopiCertificateNumber || null } : {}),
      ...(d.qualiopiCertifier !== undefined ? { qualiopiCertifier: d.qualiopiCertifier || null } : {}),
      ...(d.qualiopiCertifiedSince !== undefined
        ? { qualiopiCertifiedSince: d.qualiopiCertifiedSince ? new Date(d.qualiopiCertifiedSince) : null }
        : {}),
      ...(d.qualiopiCertificateUntil !== undefined
        ? { qualiopiCertificateUntil: d.qualiopiCertificateUntil ? new Date(d.qualiopiCertificateUntil) : null }
        : {}),
      ...(d.qualiopiCategories !== undefined ? { qualiopiCategories: d.qualiopiCategories || null } : {}),
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}
