import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  type: z.enum(["initial", "surveillance", "renouvellement", "complementaire"]),
  auditDate: z.string().min(1),
  certifierName: z.string().min(1),
  auditorName: z.string().optional(),
  durationDays: z.number().positive().optional(),
  remote: z.boolean().optional(),
  conclusions: z.string().optional(),
  nextAuditType: z.enum(["surveillance", "renouvellement", "complementaire"]).optional(),
  nextAuditDate: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const audit = await prisma.qualiopiAudit.create({
    data: {
      organizationId: session.organizationId,
      type: parsed.data.type,
      auditDate: new Date(parsed.data.auditDate),
      certifierName: parsed.data.certifierName,
      auditorName: parsed.data.auditorName || null,
      durationDays: parsed.data.durationDays ?? null,
      remote: parsed.data.remote ?? false,
      conclusions: parsed.data.conclusions || null,
      nextAuditType: parsed.data.nextAuditType || null,
      nextAuditDate: parsed.data.nextAuditDate ? new Date(parsed.data.nextAuditDate) : null,
      createdByName: session.name || session.email,
    },
  });

  // The certifier's synthesis sheet announces the next audit ("Prochain
  // audit : surveillance n°1, date prévisionnelle août 2025") — mirror it
  // into the org-level pointer that the "Prochain audit" card and the
  // dashboard alerts already read, instead of asking staff to retype it.
  if (parsed.data.nextAuditDate) {
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { nextAuditDate: new Date(parsed.data.nextAuditDate) },
    });
  }

  return NextResponse.json(audit, { status: 201 });
}
