import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { createConnectSession, isBridgeConfigured, BridgeError } from "@/lib/bridge";
import { resolveAppOrigin } from "@/lib/appUrl";

// Step 1 of connecting a bank: create a pending BankConnection row (our own
// cuid is the correlation token — passed as Bridge's "context" param, which
// round-trips back onto the callback URL, see callback/route.ts) then a
// Bridge Connect session, and hand the client Bridge's own hosted webview
// URL to redirect to. Institution isn't picked here — Bridge Connect's
// webview lets the end user search their own bank, so unlike the earlier
// GoCardless flow there's no separate "list institutions" step.
export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!isBridgeConfigured()) {
    return NextResponse.json({ error: "Connexion bancaire non configurée côté serveur." }, { status: 503 });
  }

  const connection = await prisma.bankConnection.create({
    data: {
      organizationId: auth.organizationId,
      institutionId: "pending",
      institutionName: "Connexion en cours…", // overwritten once callback learns which bank was picked
      externalConnectionId: `pending-${crypto.randomUUID()}`, // overwritten below once Bridge returns a real item
      status: "pending",
      connectedByUserId: auth.userId,
      connectedByName: auth.name || auth.email,
    },
  });

  const origin = resolveAppOrigin(request);
  try {
    const { url } = await createConnectSession({
      organizationId: auth.organizationId,
      redirectUrl: `${origin}/api/facturation/bank/callback`,
      context: connection.id,
      userEmail: auth.email,
    });
    return NextResponse.json({ authUrl: url });
  } catch (e) {
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "error" } });
    return NextResponse.json({ error: e instanceof BridgeError ? e.message : "Échec de la connexion bancaire." }, { status: 502 });
  }
}
