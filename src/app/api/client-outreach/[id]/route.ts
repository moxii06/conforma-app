import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Marks a "contract" ClientOutreach as acknowledged (i.e. signed) — the
// only manual close-out in this scaffold since there's no e-signature
// provider (Yousign) actually wired up yet. Also flips Dossier.contractSigned
// so the existing "Parcours de formation" step tracker on the Info tab
// reflects it immediately, instead of drifting from this record.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const outreach = await prisma.clientOutreach.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!outreach) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (outreach.type !== "contract") {
    return NextResponse.json({ error: "Seul un envoi de contrat peut être marqué signé." }, { status: 400 });
  }

  const updated = await prisma.clientOutreach.update({
    where: { id: outreach.id },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });

  if (outreach.dossierId) {
    await prisma.dossier.update({ where: { id: outreach.dossierId }, data: { contractSigned: true } });
  }

  return NextResponse.json(updated);
}
