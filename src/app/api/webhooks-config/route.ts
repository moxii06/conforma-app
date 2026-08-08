import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { generateWebhookSecret, WEBHOOK_EVENTS } from "@/lib/apiKeys";

// Named webhooks-config, not webhooks: /api/webhooks/* is already the
// INBOUND path (Stripe, Yousign calling us). This route configures the
// OUTBOUND ones. Same word, opposite direction — worth keeping apart.
const schema = z.object({
  url: z.string().url().max(500).refine((u) => u.startsWith("https://"), {
    message: "L'URL doit être en HTTPS.",
  }),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Indiquez une URL HTTPS et au moins un événement." },
      { status: 400 },
    );
  }

  const hook = await prisma.webhook.create({
    data: {
      organizationId: session.organizationId,
      url: parsed.data.url,
      events: parsed.data.events,
      secret: generateWebhookSecret(),
    },
  });
  return NextResponse.json(hook, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Webhook non précisé." }, { status: 400 });

  const deleted = await prisma.webhook.deleteMany({
    where: { id, organizationId: session.organizationId },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Webhook introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
