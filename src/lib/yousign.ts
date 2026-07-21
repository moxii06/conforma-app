// Yousign e-signature — PREPARED, NOT WIRED into any button yet. See the
// README ("Yousign (prepared, not wired)") for the full explanation; the
// short version: sending a real signature request needs an actual PDF
// file, and this scaffold has no PDF-rendering step anywhere —
// Document.bodyText (src/lib/mergeTemplate.ts) is merged plain text, never
// rendered to a file. This client is real and ready to call once that
// piece exists; it has NOT been exercised against a live Yousign account
// (no key available while building it), unlike gmailSync.ts/imapSync.ts/
// ai.ts/brevo.ts, which were all verified end-to-end against the real API
// (even if only via a deliberately-invalid-key error response). Treat the
// exact request/response shapes below as "believed correct as of Yousign's
// v3 API docs," not "confirmed working" — re-verify against
// https://developers.yousign.com before relying on it.
//
// Unlike AI/Brevo, this deliberately stays a PER-ORGANIZATION credential
// (IntegrationCredential, provider "yousign" — already on /integrations)
// rather than moving platform-level: the signature request has to reflect
// the actual OFP as the contracting party, not Conforma, for the document
// to make legal sense to the person signing it. A Yousign ISV/reseller
// partnership could remove that constraint later, but that's a commercial
// step, not a code change.

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
