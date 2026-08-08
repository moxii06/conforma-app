import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getSessionContext } from "@/lib/tenant";
import { LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";
import { ecrireFilPlateforme, lireFilPlateforme } from "@/lib/messageriePlateforme";

// Le fil avec l'éditeur, côté ORGANISME.
//
// Aucun identifiant d'organisme dans l'URL, et c'est le point : il est lu dans
// la session. Un paramètre client ici aurait fait de cette route le seul
// endroit de l'application où un OF peut désigner l'organisme dont il lit le
// courrier — exactement la forme d'une fuite inter-tenant.
//
// Réservé à ADMIN_OF. Ce canal n'est pas celui de l'équipe : c'est la relation
// commerciale et contractuelle entre l'OF et son fournisseur de logiciel
// (facturation, incidents, CGV). Un formateur ou un commercial n'a pas à lire
// ce que l'éditeur écrit à son patron, et /messagerie reste le canal d'équipe.
//
// Rappel : /api/plateforme est hors du matcher NextAuth (voir middleware.ts),
// pour que le back-office de l'éditeur y vive. Cette route-ci est donc la
// seule à porter sa propre vérification de session — d'où le getSessionContext
// explicite plutôt que la confiance au middleware.

function refus(): NextResponse {
  return NextResponse.json({ error: "Action réservée à l'administrateur de l'organisme." }, { status: 403 });
}

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (ctx.role !== Role.ADMIN_OF) return refus();

  const depuis = new URL(request.url).searchParams.get("depuis");
  const { messages } = await lireFilPlateforme(ctx.organizationId, "organization", depuis);
  return NextResponse.json({ messages });
}

const schema = z.object({ corps: z.string().min(1).max(LONGUEUR_MAX_MESSAGE) });

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (ctx.role !== Role.ADMIN_OF) return refus();

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide ou trop long." }, { status: 400 });
  const corps = parsed.data.corps.trim();
  if (!corps) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  // Le nom est repris de la session, jamais du corps de la requête : c'est
  // l'attribution affichée à l'éditeur, et elle doit rester non falsifiable.
  const message = await ecrireFilPlateforme(ctx.organizationId, "organization", ctx.name || ctx.email, corps);
  return NextResponse.json(message, { status: 201 });
}
