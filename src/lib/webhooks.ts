import { prisma } from "@/lib/prisma";
import { signWebhookPayload, type WebhookEvent } from "@/lib/apiKeys";

// Outbound webhooks — the half of the public API that actually makes
// Zapier/Make useful. Without these, an automation has to poll the REST API
// on a timer to notice anything changed.

const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Notify an organisation's endpoints that something happened.
 *
 * Deliberately best-effort and never awaited by the business action that
 * triggered it: a customer's broken or slow endpoint must not make enrolling
 * a learner fail, or hold a request open for five seconds. Failures are
 * recorded on the Webhook row so the OF can see a dead endpoint themselves
 * rather than asking us to read logs.
 *
 * No retry queue in v1 — that needs a job runner this app doesn't have.
 * Consumers that cannot miss an event should reconcile against the REST API;
 * that limitation belongs in the public documentation, not hidden here.
 */
export async function emitWebhook(organizationId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = await prisma.webhook.findMany({
    where: { organizationId, active: true, events: { has: event } },
  });
  if (hooks.length === 0) return;

  const payload = JSON.stringify({
    event,
    // ISO-8601 so a consumer can order events without guessing a format.
    occurred_at: new Date().toISOString(),
    data,
  });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      let status = 0;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Jalon-Event": event,
            // The receiver recomputes this HMAC with their copy of the
            // secret; without it their endpoint is open to anyone.
            "X-Jalon-Signature": signWebhookPayload(payload, hook.secret),
          },
          body: payload,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        status = res.status;
      } catch {
        // Unreachable host, DNS failure, timeout — all recorded as 0 so the
        // UI can show "échec" without pretending to know an HTTP status.
        status = 0;
      }
      await prisma.webhook
        .update({
          where: { id: hook.id },
          data: { lastDeliveryAt: new Date(), lastDeliveryStatus: status },
        })
        .catch(() => {});
    }),
  );
}
