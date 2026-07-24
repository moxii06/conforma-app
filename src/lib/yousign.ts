// Yousign e-signature — now actually wired (src/app/api/dossiers/[id]/documents/send/route.ts
// calls sendDocumentForSignature when "Demander une signature électronique"
// is checked and an org has a key configured; falls back to the internal
// stub — src/app/api/documents/[id]/sign/route.ts — otherwise). The
// PDF-rendering gap that used to block this was closed by
// src/lib/htmlToPdf.ts (real pdf-lib generation, feeding both the outbound
// email attachment and this client's `pdf: Buffer` param via
// buildDocumentAttachment in src/lib/documentSending.ts) — the request/
// response shapes below are still "believed correct as of Yousign's v3
// docs," not exercised against a live signature end-to-end in this
// environment, so watch the first real send closely.
//
// Yousign renamed itself Youtrust on 16 July 2026 — same company, same
// signature engine, same qualified-trust-provider status, docs moved to
// developers.youtrust.com (the api.yousign.app host and v3 paths below were
// unaffected as of that rename). Kept "Yousign" as the integration's
// internal name since that's still the e-signature product's own name
// inside the Youtrust suite (alongside Verify/eSeal) — not worth a rename
// that touches the credential provider key, the /integrations label, and
// this file for a rebrand with no functional effect on this client.
//
// Unlike AI/Brevo, this deliberately stays a PER-ORGANIZATION credential
// (IntegrationCredential, provider "yousign" — already on /integrations)
// rather than moving platform-level: the signature request has to reflect
// the actual OFP as the contracting party, not Conforma, for the document
// to make legal sense to the person signing it. A Yousign ISV/reseller
// partnership could remove that constraint later, but that's a commercial
// step, not a code change.

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

const YOUSIGN_BASE_URL = "https://api.yousign.app/v3";

async function getYousignKey(organizationId: string): Promise<string | null> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider: "yousign" } },
  });
  if (!credential?.apiKey) return null;
  return decrypt(credential.apiKey);
}

export async function isYousignConfigured(organizationId: string): Promise<boolean> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider: "yousign" } },
  });
  return Boolean(credential?.apiKey);
}

// Verifies the `x-yousign-signature-256` header (HMAC-SHA256 of the raw
// body, hex-encoded, prefixed "sha256=") against the webhook subscription's
// signing secret — set up manually in the Youtrust app when creating the
// subscription, stored the same way Stripe's whsec_ is (IntegrationCredential
// .clientSecret, reused rather than adding a fifth column for one provider).
// Per https://developers.yousign.com/docs/use-webhooks-in-your-app.
export async function verifyYousignWebhook(organizationId: string, rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider: "yousign" } },
  });
  if (!credential?.clientSecret) return false;
  const secret = decrypt(credential.clientSecret);
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function yousignFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${YOUSIGN_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.detail || body?.message;
    throw new Error(message ? `Erreur Yousign : ${message}` : `Erreur Yousign (HTTP ${res.status}).`);
  }
  return res.json();
}

async function createSignatureRequest(apiKey: string, name: string): Promise<{ id: string }> {
  return yousignFetch(apiKey, "/signature_requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, delivery_mode: "email", timezone: "Europe/Paris" }),
  });
}

async function addDocument(apiKey: string, signatureRequestId: string, pdf: Buffer, filename: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
  form.append("nature", "signable_document");
  return yousignFetch(apiKey, `/signature_requests/${signatureRequestId}/documents`, {
    method: "POST",
    body: form,
  });
}

async function addSigner(
  apiKey: string,
  signatureRequestId: string,
  params: { documentId: string; firstName: string; lastName: string; email: string }
): Promise<{ id: string }> {
  return yousignFetch(apiKey, `/signature_requests/${signatureRequestId}/signers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      info: { first_name: params.firstName, last_name: params.lastName, email: params.email, locale: "fr" },
      signature_level: "electronic_signature",
      signature_authentication_mode: "no_otp",
      fields: [{ document_id: params.documentId, type: "signature", page: 1, x: 100, y: 100 }],
    }),
  });
}

async function activate(apiKey: string, signatureRequestId: string): Promise<void> {
  await yousignFetch(apiKey, `/signature_requests/${signatureRequestId}/activate`, { method: "POST" });
}

// The orchestrator a real "Envoyer pour signature" button would call, once
// a PDF-rendering step exists to produce `pdf`. Not currently invoked
// anywhere in the app.
export async function sendDocumentForSignature(
  organizationId: string,
  params: { name: string; pdf: Buffer; filename: string; signerFirstName: string; signerLastName: string; signerEmail: string }
): Promise<{ signatureRequestId: string }> {
  const apiKey = await getYousignKey(organizationId);
  if (!apiKey) {
    throw new Error("Signature électronique non configurée — ajoutez une clé API Yousign sur la page Intégrations.");
  }

  const signatureRequest = await createSignatureRequest(apiKey, params.name);
  const document = await addDocument(apiKey, signatureRequest.id, params.pdf, params.filename);
  await addSigner(apiKey, signatureRequest.id, {
    documentId: document.id,
    firstName: params.signerFirstName,
    lastName: params.signerLastName,
    email: params.signerEmail,
  });
  await activate(apiKey, signatureRequest.id);

  return { signatureRequestId: signatureRequest.id };
}
