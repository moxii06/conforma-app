import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// L'inverse de « dismiss » : une transaction ignorée par erreur repart dans
// la file « À valider », depuis l'onglet « Ignorées ». Même principe que le
// désarchivage d'un email — InboxRestoreButton, exporté par
// src/components/InboxArchiveActions.tsx et non par un fichier à son nom.
// Le statut portait déjà la trace d'audit (reviewedByUserId /
// reviewedByName / reviewedAt posés par le dismiss) : elle est effacée ici,
// puisque la transaction redevient non revue.
//
// Le 409 ci-dessous n'est pas théorique : deux personnes sur le même onglet
// « Ignorées », la seconde arrive après la bascule. BankTransactionRestore
// affiche ce message plutôt que de ne rien faire.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") === "none") {
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
