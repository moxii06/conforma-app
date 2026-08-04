import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";

const schema = z.object({
  layout: z.array(z.object({ id: z.string().min(1), span: z.union([z.literal(1), z.literal(2)] as const) })).max(50),
});

// A user's own dashboard arrangement only — no one else's, no permission
// gate beyond being logged in. Whole-array replace, not a per-widget patch:
// DashboardWidgetGrid always sends every widget it currently renders, so a
// stale id can never linger here after a widget stops applying to this
// user (role change, a complaint/report queue draining to zero).
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Disposition invalide." }, { status: 400 });

  await prisma.user.update({ where: { id: session.userId }, data: { dashboardLayout: parsed.data.layout } });

  return NextResponse.json({ ok: true });
}
