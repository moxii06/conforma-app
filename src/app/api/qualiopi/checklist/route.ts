import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ indicatorNumber: z.number().int().min(1).max(32), gathered: z.boolean() });

// Toggles whether the org has gathered its evidence for one Qualiopi
// indicator, for the "Préparation audit" checklist. This is a manual
// self-assessment flag, separate from QualiopiIndicatorEvidence (which
// tracks actual evidence records) — a real evidence link doesn't
// automatically check this box, since "gathered and ready to show an
// auditor" is a judgment call the org makes, not something derivable.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const item = await prisma.auditChecklistItem.upsert({
    where: {
      organizationId_indicatorNumber: {
        organizationId: session.organizationId,
        indicatorNumber: parsed.data.indicatorNumber,
      },
    },
    update: { gathered: parsed.data.gathered },
    create: {
      organizationId: session.organizationId,
      indicatorNumber: parsed.data.indicatorNumber,
      gathered: parsed.data.gathered,
    },
  });

  return NextResponse.json({ ok: true, item });
}
