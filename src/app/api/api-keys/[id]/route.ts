import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Revoke — never delete. The row is the record of what had access to this
// organisation's data and when; removing it erases exactly the trail you
// would want the day you wonder where an export came from.
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const updated = await prisma.apiKey.updateMany({
    where: { id: params.id, organizationId: session.organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Clé introuvable ou déjà révoquée." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
