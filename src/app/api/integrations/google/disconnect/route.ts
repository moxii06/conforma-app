import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  await prisma.mailboxConnection.deleteMany({ where: { organizationId: session.organizationId, provider: "gmail" } });
  return NextResponse.json({ ok: true });
}
