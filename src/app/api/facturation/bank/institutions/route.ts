import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { listInstitutions, isGoCardlessConfigured, GoCardlessError } from "@/lib/gocardless";

// Feeds the bank picker in the "Connecter ma banque" dialog — French
// institutions only (this app's whole audience), see gocardless.ts.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!isGoCardlessConfigured()) {
    return NextResponse.json({ error: "Connexion bancaire non configurée côté serveur." }, { status: 503 });
  }
  try {
    const institutions = await listInstitutions("fr");
    return NextResponse.json({ institutions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof GoCardlessError ? e.message : "Échec de la récupération des banques." }, { status: 502 });
  }
}
