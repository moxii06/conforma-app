import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { normalizeSiret, OFFICIAL_OPCO_TOOL_URL } from "@/lib/opcoLookup";

// GET → what the funding tab needs to point staff at the official
// France Compétences "Quel est mon OPCO" tool: the employer's SIRET,
// validated and cleaned. Deliberately NO automated lookup — see the
// licence note in src/lib/opcoLookup.ts.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: { include: { company: { select: { siret: true, name: true } } } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const siret = dossier.contact.company?.siret ? normalizeSiret(dossier.contact.company.siret) : null;
  if (!siret) return NextResponse.json({ suggestion: null, reason: "no_siret" });

  return NextResponse.json({
    suggestion: {
      siret,
      companyName: dossier.contact.company?.name ?? null,
      officialToolUrl: OFFICIAL_OPCO_TOOL_URL,
    },
  });
}
