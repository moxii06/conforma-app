import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Mirrors the two distinct milestones on the certifier's "Demande
// d'amélioration" sheet: "lever" = the auditor accepted the corrective
// action (section 3, a few weeks after the audit), "solder" = the NEXT
// audit confirmed the action is still in place (section 4). Plain field
// edits go through the same PATCH so the OF can complete its response
// (causes, corrective action) after creating the finding.
const schema = z.object({
  action: z.enum(["lever", "solder", "rouvrir"]).optional(),
  closureComment: z.string().optional(),
  immediateAction: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  implementedAt: z.string().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const finding = await prisma.qualiopiAuditFinding.findFirst({
    where: { id: params.id, audit: { organizationId: session.organizationId } },
  });
  if (!finding) return NextResponse.json({ error: "Non-conformité introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const statusData =
    parsed.data.action === "lever"
      ? { status: "levee", liftedAt: new Date() }
      : parsed.data.action === "solder"
        ? { status: "soldee", closedAt: new Date(), closureComment: parsed.data.closureComment || null }
        : parsed.data.action === "rouvrir"
          ? { status: "ouverte", liftedAt: null, closedAt: null, closureComment: null }
          : {};

  const updated = await prisma.qualiopiAuditFinding.update({
    where: { id: finding.id },
    data: {
      ...statusData,
      ...(parsed.data.immediateAction !== undefined ? { immediateAction: parsed.data.immediateAction || null } : {}),
      ...(parsed.data.rootCause !== undefined ? { rootCause: parsed.data.rootCause || null } : {}),
      ...(parsed.data.correctiveAction !== undefined ? { correctiveAction: parsed.data.correctiveAction || null } : {}),
      ...(parsed.data.implementedAt !== undefined
        ? { implementedAt: parsed.data.implementedAt ? new Date(parsed.data.implementedAt) : null }
        : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const finding = await prisma.qualiopiAuditFinding.findFirst({
    where: { id: params.id, audit: { organizationId: session.organizationId } },
  });
  if (!finding) return NextResponse.json({ error: "Non-conformité introuvable." }, { status: 404 });

  await prisma.qualiopiAuditFinding.delete({ where: { id: finding.id } });
  return NextResponse.json({ ok: true });
}
