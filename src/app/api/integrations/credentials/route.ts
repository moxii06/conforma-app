import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { encrypt } from "@/lib/crypto";

// "ai_provider" and "brevo" deliberately excluded — both are platform-level
// features (OPENAI_API_KEY / BREVO_API_KEY env vars, see src/lib/ai.ts and
// src/lib/brevo.ts), not per-organization credentials like the ones below.
const PROVIDERS = ["stripe", "yousign", "pennylane", "sellsy", "google_oauth", "microsoft_oauth"] as const;

const schema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

// Storage only for most providers — see the comment on IntegrationCredential
// in schema.prisma. Values are encrypted at rest (src/lib/crypto.ts) and
// never echoed back to the browser (see GET) — an empty field on submit
// means "leave the existing secret unchanged", not "clear it", the usual
// convention for secret inputs.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId: session.organizationId, provider: parsed.data.provider } },
  });

  const apiKey = parsed.data.apiKey ? encrypt(parsed.data.apiKey) : existing?.apiKey;
  const clientSecret = parsed.data.clientSecret ? encrypt(parsed.data.clientSecret) : existing?.clientSecret;
  const clientId = parsed.data.clientId || existing?.clientId;

  const credential = await prisma.integrationCredential.upsert({
    where: { organizationId_provider: { organizationId: session.organizationId, provider: parsed.data.provider } },
    update: { apiKey, clientId, clientSecret },
    create: {
      organizationId: session.organizationId,
      provider: parsed.data.provider,
      apiKey,
      clientId,
      clientSecret,
    },
  });

  return NextResponse.json({ provider: credential.provider, updatedAt: credential.updatedAt });
}
