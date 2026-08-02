import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";

const schema = z.object({
  action: z.enum(["warn", "clear-warning", "suspend", "restore", "set-cgv", "clear-cgv"]),
  reason: z.string().trim().max(500).optional(),
  // Pour set-cgv : date au format yyyy-mm-dd (valeur native d'un <input
  // type="date">). Absente = aujourd'hui.
  date: z.string().optional(),
});

// Two independent axes, both reversible: a warning never blocks access (a
// persistent banner inside the org's own app, see AppLayout), a suspension
// always does (nothing under (app)/ renders for anyone in the org). Kept
// as four explicit actions rather than a single "status" field so setting
// one never silently clears the other — an org can be both warned AND
// suspended if that's genuinely where things stand. set-cgv/clear-cgv is a
// third, unrelated axis (Organization.cgvAcceptedAt) grouped in the same
// route purely because it's the same "platform admin edits one org" shape.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const params = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });

  let data: Record<string, unknown>;
  switch (parsed.data.action) {
    case "warn":
      data = { accessWarningAt: new Date(), accessWarningReason: parsed.data.reason || null };
      break;
    case "clear-warning":
      data = { accessWarningAt: null, accessWarningReason: null };
      break;
    case "suspend":
      data = { suspendedAt: new Date(), suspendedReason: parsed.data.reason || null };
      break;
    case "restore":
      data = { suspendedAt: null, suspendedReason: null };
      break;
    case "set-cgv": {
      const parsedDate = parsed.data.date ? new Date(parsed.data.date) : new Date();
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      data = { cgvAcceptedAt: parsedDate };
      break;
    }
    case "clear-cgv":
      data = { cgvAcceptedAt: null };
      break;
  }

  const updated = await prisma.organization.update({ where: { id: organization.id }, data });
  return NextResponse.json(updated);
}
