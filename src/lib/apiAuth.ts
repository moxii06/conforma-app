import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractBearerToken, hashApiKey, hasScope, isKeyUsable, type ApiScope } from "@/lib/apiKeys";

export type ApiContext = { organizationId: string; apiKeyId: string; scopes: string[] };

/**
 * The single entry point every /api/v1 route goes through.
 *
 * Returning the organizationId (rather than letting each route figure it out)
 * is the whole point: this app's tenant isolation is enforced in application
 * code, so a public API multiplies the places a missing
 * `where: { organizationId }` becomes a cross-tenant leak. Routes get the id
 * from here and must scope every query with it — there is no other source.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: ApiScope,
): Promise<{ context: ApiContext } | { error: NextResponse }> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      error: apiError(401, "unauthorized", "Clé d'API manquante ou mal formée. Attendu : Authorization: Bearer jln_live_…"),
    };
  }

  // Looked up by hash, so the database never holds anything replayable.
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
  if (!key || !isKeyUsable(key)) {
    // Same message whether the key is unknown or revoked — telling them
    // apart lets someone probe which keys once existed.
    return { error: apiError(401, "unauthorized", "Clé d'API invalide ou révoquée.") };
  }

  if (!hasScope(key.scopes, requiredScope)) {
    return {
      error: apiError(403, "insufficient_scope", `Cette clé n'a pas la portée « ${requiredScope} ».`),
    };
  }

  // Fire-and-forget: a failed usage stamp must never fail the request it is
  // only observing.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { context: { organizationId: key.organizationId, apiKeyId: key.id, scopes: key.scopes } };
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Shared paging. Capped at 100 so one call can't ask for an organisation's
 * entire history and time out.
 */
export function parsePaging(request: Request): { take: number; skip: number } {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  return {
    take: Number.isFinite(limit) ? Math.min(Math.max(1, limit), 100) : 50,
    skip: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  };
}
