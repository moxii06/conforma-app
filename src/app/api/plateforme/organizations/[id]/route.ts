import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";

const schema = z.object({
  action: z.enum(["warn", "clear-warning", "suspend", "restore"]),
  reason: z.string().trim().max(500).optional(),
});

// Two independent axes, both reversible: a warning never blocks access (a
// persistent banner inside the org's own app, see AppLayout), a suspension
// always does (nothing under (app)/ renders for anyone in the org). Kept
// as four explicit actions rather than a single "status" field so setting
// one never silently clears the other — an org can be both warned AND
// suspended if that's genuinely where things stand.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const params = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });

  const data =
    parsed.data.action === "warn"
      ? { accessWarningAt: new Date(), accessWarningReason: parsed.data.reason || null }
      : parsed.data.action === "clear-warning"
        ? { accessWarningAt: null, accessWarningReason: null }
        : parsed.data.action === "suspend"
          ? { suspendedAt: new Date(), suspendedReason: parsed.data.reason || null }
          : { suspendedAt: null, suspendedReason: null };

  const updated = await prisma.organization.update({ where: { id: organization.id }, data });
  return NextResponse.json(updated);
}
