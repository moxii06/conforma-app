import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { generateApiKey, API_SCOPES } from "@/lib/apiKeys";

const schema = z.object({
  name: z.string().min(2).max(120),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
});

// Creating a key that can read a tenant's data is an ADMIN_OF decision,
// same gate as the rest of /integrations.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Donnez un nom à la clé et cochez au moins une permission." }, { status: 400 });
  }

  const generated = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name.trim(),
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      scopes: parsed.data.scopes,
      createdByUserId: session.userId,
    },
  });

  // The only time the full key ever leaves the server. It is not stored in
  // clear anywhere, so it cannot be shown again — the UI has to say so.
  return NextResponse.json({ id: key.id, name: key.name, plainKey: generated.plain }, { status: 201 });
}
