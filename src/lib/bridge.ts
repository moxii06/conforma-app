// Tier 2 of "rapprochement bancaire" (see schema.prisma's BankConnection
// comment) — Bridge (bridgeapi.io), a French DSP2/ACPR-licensed open-banking
// aggregator. Replaces an earlier GoCardless Bank Account Data integration
// that had to be dropped: GoCardless closed new signups for that product
// entirely (https://bankaccountdata.gocardless.com/new-signups-disabled)
// before this app ever went live with it, and Nordigen (the service it
// was built on) is being wound down.
//
// BRIDGE_CLIENT_ID/CLIENT_SECRET are Jalon's own platform developer
// credentials (like OPENAI_API_KEY) identifying the app itself. Within
// that app, Bridge has its own end-user concept: one Bridge "user" per
// Jalon organization, keyed by external_user_id = organizationId directly
// (no separate mapping table needed — a cuid already fits Bridge's
// [a-zA-Z0-9-_]{1,128} external id format). Every call that reads or
// writes that org's bank data needs a short-lived (~2h) user access token,
// fetched fresh per call sequence rather than cached across invocations —
// same reasoning as the old GoCardless client: this only ever runs from a
// cron sync or a user-initiated connect flow, never a hot path.
//
// Unlike GoCardless's free tier, Bridge has no self-serve production
// pricing — going live needs a commercial agreement with Bridge, on top of
// the free sandbox used to build and test this file.

const API_BASE = "https://api.bridgeapi.io/v3";
const BRIDGE_VERSION = "2025-01-15";

export class BridgeError extends Error {}

function getCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.BRIDGE_CLIENT_ID;
  const clientSecret = process.env.BRIDGE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isBridgeConfigured(): boolean {
  return getCredentials() !== null;
}

function appHeaders(): Record<string, string> {
  const creds = getCredentials();
  if (!creds) throw new BridgeError("Bridge non configuré côté serveur (BRIDGE_CLIENT_ID/BRIDGE_CLIENT_SECRET).");
  return {
    "Bridge-Version": BRIDGE_VERSION,
    "Client-Id": creds.clientId,
    "Client-Secret": creds.clientSecret,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function apiFetch(url: string, userToken: string | null, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...appHeaders(),
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BridgeError(`Bridge ${url} → HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return res.json();
}

// external_user_id must already exist before a token can be issued for it —
// Bridge has no upsert, so a duplicate-creation call is expected on every
// org after the first and is silently ignored rather than treated as fatal.
async function ensureBridgeUser(organizationId: string): Promise<void> {
  await fetch(`${API_BASE}/aggregation/users`, {
    method: "POST",
    headers: appHeaders(),
    body: JSON.stringify({ external_user_id: organizationId }),
  }).catch(() => null);
}

async function getUserAccessToken(organizationId: string): Promise<string> {
  await ensureBridgeUser(organizationId);
  const data = await apiFetch(`${API_BASE}/aggregation/authorization/token`, null, {
    method: "POST",
    body: JSON.stringify({ external_user_id: organizationId }),
  });
  return data.access_token as string;
}

// Bridge Connect is a hosted webview that lets the end user search for and
// pick their own bank — unlike the old GoCardless flow, Jalon doesn't need
// its own institution picker or a separate "list institutions" endpoint.
export async function createConnectSession(params: {
  organizationId: string;
  redirectUrl: string;
  context: string; // round-trips back onto redirectUrl's query string — see /api/facturation/bank/callback
  userEmail: string;
}): Promise<{ url: string }> {
  const token = await getUserAccessToken(params.organizationId);
  const data = await apiFetch(`${API_BASE}/aggregation/connect-sessions`, token, {
    method: "POST",
    body: JSON.stringify({
      user_email: params.userEmail,
      country_code: "FR",
      callback_url: params.redirectUrl,
      context: params.context,
      account_types: "payment",
    }),
  });
  return { url: data.url as string };
}

export type BridgeItem = { id: number; status: number; statusInfo: string; providerId: number; createdAt: string };

export async function listItems(organizationId: string): Promise<BridgeItem[]> {
  const token = await getUserAccessToken(organizationId);
  const data = await apiFetch(`${API_BASE}/aggregation/items?limit=500`, token);
  return (data.resources ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as number,
    status: r.status as number,
    statusInfo: r.status_code_info as string,
    providerId: r.provider_id as number,
    createdAt: r.created_at as string,
  }));
}

// Item status 0 ("ok") is the only state with real accounts to read from —
// everything else (otp_required, tos_to_validate, wrong_pwd...) means the
// consent flow is either still in progress or needs the user to retry.
export const ITEM_STATUS_OK = 0;

export async function getProviderName(providerId: number): Promise<string> {
  try {
    const data = await apiFetch(`${API_BASE}/providers/${providerId}`, null);
    return (data.name as string) || "Banque";
  } catch {
    return "Banque"; // non-fatal — display-only label, never blocks storing the connection
  }
}

export type BridgeAccount = { externalAccountId: string; iban: string | null; displayName: string | null };

export async function fetchItemAccounts(organizationId: string, itemId: number): Promise<BridgeAccount[]> {
  const token = await getUserAccessToken(organizationId);
  const data = await apiFetch(`${API_BASE}/aggregation/accounts?item_id=${itemId}&limit=500`, token);
  return (data.resources ?? []).map((a: Record<string, unknown>) => ({
    externalAccountId: String(a.id),
    iban: (a.iban as string) ?? null,
    displayName: (a.name as string) ?? null,
  }));
}

export type RemoteTransaction = { externalId: string; bookedAt: Date; amountCents: number; label: string };

// Only credits (amount > 0), same "incoming money only" filter the CSV
// import applies (see bankStatementImport.ts) — deleted/future transactions
// are skipped too, they're not settled money received yet.
export async function fetchAccountTransactions(organizationId: string, accountId: string): Promise<RemoteTransaction[]> {
  const token = await getUserAccessToken(organizationId);
  const results: RemoteTransaction[] = [];
  let url: string | null = `${API_BASE}/aggregation/transactions?account_id=${accountId}&limit=500`;
  while (url) {
    const data = await apiFetch(url, token);
    for (const t of (data.resources ?? []) as Record<string, unknown>[]) {
      if (t.deleted || t.future) continue;
      const amount = t.amount as number;
      if (!(amount > 0)) continue;
      results.push({
        externalId: String(t.id),
        bookedAt: new Date((t.booking_date as string) || (t.date as string)),
        amountCents: Math.round(amount * 100),
        label: (t.clean_description as string) || (t.provider_description as string) || "Virement reçu",
      });
    }
    const nextUri = data.pagination?.next_uri as string | undefined;
    url = nextUri ? `https://api.bridgeapi.io${nextUri}` : null;
  }
  return results;
}
