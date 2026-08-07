import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// The inverse of "dismiss" — a transaction ignored by mistake goes back to
// the "à valider" queue, from the "Ignorées" tab. Same idea as
// InboxRestoreButton for an archived email: the status carried the audit
// trail already (reviewedByUserId/reviewedByName/reviewedAt from the
// dismiss), that part is cleared here since the transaction is, once again,
// unreviewed.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const tx = await prisma.bankTransaction.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!tx) return NextResponse.json({ error: "Transaction introuvable." }, { status: 404 });
  if (tx.status !== "dismissed") return NextResponse.json({ error: "Cette transaction n'est pas ignorée." }, { status: 409 });

  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: { status: "pending", reviewedByUserId: null, reviewedByName: null, reviewedAt: null },
  });

  return NextResponse.json({ ok: true });
}
