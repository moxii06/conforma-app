import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Staff saying "this isn't a client payment" (a refund, a supplier's own
// transfer, an unrelated deposit...) — stays in the table with status
// dismissed rather than being deleted, both as an audit trail and so it
// never gets re-suggested on the next page load.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const tx = await prisma.bankTransaction.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!tx) return NextResponse.json({ error: "Transaction introuvable." }, { status: 404 });
  if (tx.status !== "pending") return NextResponse.json({ error: "Cette transaction a déjà été traitée." }, { status: 409 });

  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: { status: "dismissed", reviewedByUserId: auth.userId, reviewedByName: auth.name || auth.email, reviewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
