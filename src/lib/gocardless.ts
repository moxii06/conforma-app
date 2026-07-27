// Tier 2 of "rapprochement bancaire" (see schema.prisma's BankTransaction
// comment) — GoCardless Bank Account Data (ex-Nordigen), an EU open-banking
// aggregator: one AISP-licensed API covers 2 500+ banks, so Jalon never
// needs its own PSD2 approval. GOCARDLESS_SECRET_ID/SECRET_KEY are Jalon's
// own platform developer credentials (like OPENAI_API_KEY) — what scopes a
// single org's own bank consent under that shared account is the
// "requisition" mechanism below, stored per-org as BankConnection.
//
// The access token (JWT, ~24h) is fetched fresh for each call sequence
// rather than cached across invocations: this only ever runs from a cron
// sync or a user-initiated connect flow, never a hot path, and Vercel's
// serverless functions are stateless between invocations anyway — an
// in-memory cache would just add complexity for a request that already
// completes in well under a second.

const API_BASE = "https://bankaccountdata.gocardless.com/api/v2";

export class GoCardlessError extends Error {}

function getCredentials(): { secretId: string; secretKey: string } | null {
  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId || !secretKey) return null;
  return { secretId, secretKey };
}

export function isGoCardlessConfigured(): boolean {
  return getCredentials() !== null;
}

async function getAccessToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new GoCardlessError("GoCardless non configuré côté serveur (GOCARDLESS_SECRET_ID/SECRET_KEY).");
  const res = await fetch(`${API_BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: creds.secretId, secret_key: creds.secretKey }),
  });
  if (!res.ok) throw new GoCardlessError(`Authentification GoCardless échouée (HTTP ${res.status}).`);
  const data = await res.json();
  return data.access as string;
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoCardlessError(`GoCardless ${path} → HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return res.json();
}

export type Institution = { id: string; name: string; logo?: string };

// French banks first (this app's whole audience), rest of the EU after —
// GoCardless has no built-in "sort by relevance", just alphabetical per country.
export async function listInstitutions(country = "fr"): Promise<Institution[]> {
  const token = await getAccessToken();
  const data = await apiFetch(`/institutions/?country=${country}`, token);
  return (data as Institution[]).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// 90 days is GoCardless's own PSD2 consent ceiling (re-consent required
// after that, same as any open-banking aggregator) — 180 days of history
// covers a typical Qualiopi audit lookback without asking for the maximum
// every provider allows.
const ACCESS_VALID_DAYS = 90;
const MAX_HISTORICAL_DAYS = 180;

export async function createRequisition(params: {
  institutionId: string;
  redirectUrl: string;
  reference: string; // used to re-identify the org on callback — see /api/facturation/bank/callback
}): Promise<{ requisitionId: string; authUrl: string }> {
  const token = await getAccessToken();
  const agreement = await apiFetch("/agreements/enduser/", token, {
    method: "POST",
    body: JSON.stringify({
      institution_id: params.institutionId,
      max_historical_days: MAX_HISTORICAL_DAYS,
      access_valid_for_days: ACCESS_VALID_DAYS,
      access_scopes: ["balances", "details", "transactions"],
    }),
  });
  const requisition = await apiFetch("/requisitions/", token, {
    method: "POST",
    body: JSON.stringify({
      redirect: params.redirectUrl,
      institution_id: params.institutionId,
      reference: params.reference,
      agreement: agreement.id,
      user_language: "FR",
    }),
  });
  return { requisitionId: requisition.id, authUrl: requisition.link };
}

export type RequisitionStatus = { status: string; accountIds: string[] };

export async function getRequisition(requisitionId: string): Promise<RequisitionStatus> {
  const token = await getAccessToken();
  const data = await apiFetch(`/requisitions/${requisitionId}/`, token);
  return { status: data.status, accountIds: data.accounts ?? [] };
}

export async function getAccountDetails(accountId: string): Promise<{ iban: string | null; displayName: string | null }> {
  const token = await getAccessToken();
  const data = await apiFetch(`/accounts/${accountId}/details/`, token);
  const account = data.account ?? {};
  return {
    iban: account.iban ?? null,
    displayName: account.name || account.product || account.ownerName || null,
  };
}

export type RemoteTransaction = {
  externalId: string;
  bookedAt: Date;
  amountCents: number;
  label: string;
  counterpartyName: string | null;
};

// Only booked (settled) transactions, only credits — same "incoming money
// only" filter the CSV import applies (see bankStatementImport.ts). A
// transaction's own id (transactionId, falling back to internalTransactionId
// — not every bank fills both) is what BankTransaction.externalId dedupes
// on across repeated syncs, real provider ids rather than a computed hash.
export async function fetchAccountTransactions(accountId: string): Promise<RemoteTransaction[]> {
  const token = await getAccessToken();
  const data = await apiFetch(`/accounts/${accountId}/transactions/`, token);
  const booked: Array<Record<string, unknown>> = data.transactions?.booked ?? [];
  const results: RemoteTransaction[] = [];
  for (const raw of booked) {
    const amount = raw.transactionAmount as { amount?: string; currency?: string } | undefined;
    const cents = amount?.amount ? Math.round(parseFloat(amount.amount) * 100) : NaN;
    if (!Number.isFinite(cents) || cents <= 0) continue; // credits only
    const externalId = (raw.transactionId as string) || (raw.internalTransactionId as string);
    const bookingDate = (raw.bookingDate as string) || (raw.valueDate as string);
    if (!externalId || !bookingDate) continue;
    const label =
      (raw.remittanceInformationUnstructured as string) ||
      (Array.isArray(raw.remittanceInformationUnstructuredArray) ? (raw.remittanceInformationUnstructuredArray as string[]).join(" ") : "") ||
      (raw.additionalInformation as string) ||
      "Virement reçu";
    results.push({
      externalId,
      bookedAt: new Date(bookingDate),
      amountCents: cents,
      label,
      counterpartyName: (raw.debtorName as string) || null,
    });
  }
  return results;
}
