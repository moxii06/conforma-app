import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Marks a "contract" ClientOutreach as acknowledged (i.e. signed) — the
// manual close-out for the original fixed "Envoyer le contrat" flow. The
// newer generic SendDocumentDialog path (any document, category
// "convention", "Demander une signature électronique" checked) now closes
// itself automatically via Yousign or the internal stub — see
// syncParcoursFromSignedDocument in lib/documentSending.ts — but this
// older flow predates that and still needs a manual click here. Also
// flips Dossier.contractSigned so the "Parcours de formation" step
// tracker on the Info tab reflects it immediately either way.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
