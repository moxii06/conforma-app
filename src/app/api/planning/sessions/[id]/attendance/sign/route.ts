import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { HalfDay } from "@prisma/client";

const bodySchema = z.object({
  sessionDayId: z.string().min(1),
  dossierId: z.string().min(1),
  halfDay: z.nativeEnum(HalfDay),
  // A PNG data URL from SignaturePad, or null when staff records the presence
  // on the learner's behalf (paper sheet, flat tablet). Capped well under the
  // Next.js body limit — a signature stroke is a few KB, anything near this
  // is not a signature.
  signatureDataUrl: z
    .string()
    .startsWith("data:image/png;base64,")
    .max(500_000)
    .nullable(),
});

// Records one learner's presence for one half-day. Idempotent by
// (sessionDayId, dossierId, halfDay): signing again replaces the stroke
// rather than stacking rows, so a learner who signs twice by accident — or
// re-signs after a mis-tap — doesn't corrupt the evidence.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
  }
  const { sessionDayId, dossierId, halfDay, signatureDataUrl } = parsed.data;

  // Both the day and the dossier are re-checked against this session AND this
  // organisation: without it, a valid session id plus a borrowed day id from
  // another tenant would write attendance across the boundary.
  const [day, dossier] = await Promise.all([
    prisma.sessionDay.findFirst({
      where: { id: sessionDayId, session: { id: params.id, organizationId: auth.organizationId } },
    }),
    prisma.dossier.findFirst({
      where: { id: dossierId, sessionId: params.id, organizationId: auth.organizationId },
    }),
  ]);
  if (!day) return NextResponse.json({ error: "Journée introuvable pour cette session." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Apprenant non inscrit à cette session." }, { status: 404 });

  // Signing a half-day that isn't held would produce evidence for a session
  // that never happened.
  const held = halfDay === HalfDay.MORNING ? day.morningHours : day.afternoonHours;
  if (held == null) {
    return NextResponse.json({ error: "Cette demi-journée n'est pas prévue au programme." }, { status: 400 });
  }

  const entry = await prisma.attendanceEntry.upsert({
    where: { sessionDayId_dossierId_halfDay: { sessionDayId, dossierId, halfDay } },
    create: {
      sessionDayId,
      dossierId,
      halfDay,
      signatureDataUrl,
      recordedByUserId: signatureDataUrl ? null : auth.userId,
    },
    update: {
      signatureDataUrl,
      signedAt: new Date(),
      recordedByUserId: signatureDataUrl ? null : auth.userId,
    },
  });

  return NextResponse.json({ entry });
}

// Removing a signature is a correction, not a routine action (wrong learner
// tapped, test entry) — so it's a separate verb rather than an empty POST.
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const url = new URL(request.url);
  const sessionDayId = url.searchParams.get("sessionDayId");
  const dossierId = url.searchParams.get("dossierId");
  const halfDay = url.searchParams.get("halfDay");
  if (!sessionDayId || !dossierId || (halfDay !== HalfDay.MORNING && halfDay !== HalfDay.AFTERNOON)) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const day = await prisma.sessionDay.findFirst({
    where: { id: sessionDayId, session: { id: params.id, organizationId: auth.organizationId } },
  });
  if (!day) return NextResponse.json({ error: "Journée introuvable pour cette session." }, { status: 404 });

  await prisma.attendanceEntry.deleteMany({ where: { sessionDayId, dossierId, halfDay } });
  return NextResponse.json({ ok: true });
}
