import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyYousignWebhook } from "@/lib/yousign";
import { notifyDocumentSigned } from "@/lib/documentSending";

// Receiver for the webhook subscription staff create themselves in the
// Youtrust app (see /integrations — the exact URL to paste is shown there,
// scoped per organization since Yousign has no concept of our tenants).
// organizationId in the path is how this route knows whose signing secret
// to check the payload against, before the payload itself can be trusted —
// same reasoning as the Stripe webhook route sketched in lib/stripe.ts.
//
// Event names/payload shape per https://developers.yousign.com/docs/use-webhooks-in-your-app
// and https://developers.yousign.com/reference/approver-events (now hosted
// at developers.youtrust.com after the July 2026 rename) — not yet
// exercised against a live event in this environment.
export async function POST(request: Request, { params }: { params: { organizationId: string } }) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-yousign-signature-256");
  const valid = await verifyYousignWebhook(params.organizationId, rawBody, signature);
  if (!valid) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });

  const payload = JSON.parse(rawBody);
  if (payload.event_name !== "signature_request.done") {
    // Not an event we act on (e.g. signer.done for a single signer out of
    // several, or activated/refused) — acknowledge so Yousign doesn't retry.
    return NextResponse.json({ ok: true, ignored: payload.event_name });
  }

  const signatureRequestId: string | undefined = payload.data?.signature_request?.id;
  if (!signatureRequestId) return NextResponse.json({ ok: true, ignored: "no signature_request.id" });

  const document = await prisma.document.findFirst({
    where: { organizationId: params.organizationId, yousignSignatureRequestId: signatureRequestId },
  });
  if (!document) return NextResponse.json({ ok: true, ignored: "document not found" });
  if (document.signatureStatus === "signed") return NextResponse.json({ ok: true });

  const signed = await prisma.document.update({
    where: { id: document.id },
    data: { signatureStatus: "signed", signedAt: new Date() },
  });

  await notifyDocumentSigned(signed, params.organizationId);

  return NextResponse.json({ ok: true });
}
