import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { createRequisition, isGoCardlessConfigured, GoCardlessError } from "@/lib/gocardless";

const schema = z.object({ institutionId: z.string().min(1), institutionName: z.string().min(1) });

// Step 1 of connecting a bank: create a pending BankConnection row (our
// own cuid is the correlation token embedded in the redirect URL — see
// callback/route.ts) then a GoCardless requisition pointing back at it,
// and hand the client the bank's own hosted consent URL to redirect to.
// Jalon never sees the OFP's banking credentials — GoCardless's page does.
export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!isGoCardlessConfigured()) {
    return NextResponse.json({ error: "Connexion bancaire non configurée côté serveur." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Banque à connecter manquante." }, { status: 400 });

  const connection = await prisma.bankConnection.create({
    data: {
      organizationId: auth.organizationId,
      institutionId: parsed.data.institutionId,
      institutionName: parsed.data.institutionName,
      requisitionId: `pending-${crypto.randomUUID()}`, // overwritten below once GoCardless returns the real one
      status: "pending",
      connectedByUserId: auth.userId,
      connectedByName: auth.name || auth.email,
    },
  });

  const origin = new URL(request.url).origin;
  try {
    const { requisitionId, authUrl } = await createRequisition({
      institutionId: parsed.data.institutionId,
      redirectUrl: `${origin}/api/facturation/bank/callback?connectionId=${connection.id}`,
      reference: connection.id,
    });
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { requisitionId } });
    return NextResponse.json({ authUrl });
  } catch (e) {
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "error" } });
    return NextResponse.json({ error: e instanceof GoCardlessError ? e.message : "Échec de la connexion bancaire." }, { status: 502 });
  }
}
