import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { issueCertificate } from "@/lib/certificateIssue";

// Real completion check, not a trusted client flag — what may be attested
// and in which of the three forms is decided by lib/certificate.ts, always
// recomputed from actual progress and never from a "yes I finished" claim.
// Cette route ne porte plus que l'authentification : la délivrance elle-même
// passe par issueCertificate, partagé avec l'envoi depuis « À faire », pour
// qu'un même dossier ne puisse jamais recevoir deux attestations distinctes.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { id: true, learnerUserId: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
  const isStaff = can(session.roles, "dossiers") !== "none";
  if (!isOwnDossier && !isStaff) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const result = await issueCertificate(dossier.id, session.organizationId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });

  return NextResponse.json(result.document, { status: result.created ? 201 : 200 });
}
