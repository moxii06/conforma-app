import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  indicatorNumber: z.number().int().min(1).max(40),
  severity: z.enum(["majeure", "mineure"]),
  description: z.string().min(1),
  immediateAction: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  implementedAt: z.string().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const audit = await prisma.qualiopiAudit.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!audit) return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const finding = await prisma.qualiopiAuditFinding.create({
    data: {
      auditId: audit.id,
      indicatorNumber: parsed.data.indicatorNumber,
      severity: parsed.data.severity,
      description: parsed.data.description,
      immediateAction: parsed.data.immediateAction || null,
      rootCause: parsed.data.rootCause || null,
      correctiveAction: parsed.data.correctiveAction || null,
      implementedAt: parsed.data.implementedAt ? new Date(parsed.data.implementedAt) : null,
    },
  });

  return NextResponse.json(finding, { status: 201 });
}
