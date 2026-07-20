import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const PROVIDERS = ["stripe", "brevo", "yousign", "pennylane", "sellsy", "google_oauth", "microsoft_oauth"] as const;

const schema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

// Storage only — see the comment on IntegrationCredential in schema.prisma.
// Nothing in this scaffold actually calls out to any of these providers
// with the value saved here.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const credential = await prisma.integrationCredential.upsert({
    where: { organizationId_provider: { organizationId: session.organizationId, provider: parsed.data.provider } },
    update: { apiKey: parsed.data.apiKey, clientId: parsed.data.clientId, clientSecret: parsed.data.clientSecret },
    create: {
      organizationId: session.organizationId,
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
    },
  });

  return NextResponse.json({ provider: credential.provider, updatedAt: credential.updatedAt });
}
