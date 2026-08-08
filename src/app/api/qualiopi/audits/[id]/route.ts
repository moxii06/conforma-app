import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Deleting an audit cascades to its findings (FK ON DELETE CASCADE) — a
// finding is a line item of the certifier's report, it has no meaning
// detached from the audit that raised it.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const audit = await prisma.qualiopiAudit.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!audit) return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });

  await prisma.qualiopiAudit.delete({ where: { id: audit.id } });
  return NextResponse.json({ ok: true });
}
