import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

// Les mentions de l'article 30. La finalité, les catégories de personnes et
// de données sont exigées : accepter un traitement sans elles reviendrait à
// laisser créer une ligne de registre qui ne vaut rien devant un contrôleur.
// Destinataires, transferts et mesures de sécurité restent facultatifs — ils
// peuvent légitimement être vides (aucun destinataire, aucun transfert).
const schema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  legalBasis: z.string().min(1),
  dataSubjects: z.string().min(1),
  dataCategories: z.string().min(1),
  recipients: z.string().optional(),
  transferOutsideEu: z.boolean().default(false),
  transferDetails: z.string().optional(),
  securityMeasures: z.string().optional(),
  retentionPeriod: z.string().min(1),
  riskFlag: z.enum(["ok", "to_review"]),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const activity = await prisma.processingActivity.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(activity, { status: 201 });
}
