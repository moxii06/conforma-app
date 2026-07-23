import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";
import { draftConvocationEmail } from "@/lib/ai";

const schema = z.object({ dossierId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { course: true },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (!canManageSessionInvitations(auth.role, auth.userId, session)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: auth.organizationId, sessionId: session.id },
    include: { contact: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable pour cette session." }, { status: 404 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const isRemote = session.format === "REMOTE" || session.format === "HYBRID";
  const isInPerson = session.format === "IN_PERSON" || session.format === "HYBRID";
  const details = isRemote
    ? `visioconférence — lien ${session.meetingLink ?? "généré à l'envoi"}`
    : `en présentiel — lieu : ${session.location ?? "communiqué séparément"}`;

  try {
    const draft = await draftConvocationEmail({
      contactFirstName: dossier.contact.firstName,
      organizationName: organization.name,
      courseTitle: session.course.title,
      dateLabel: session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      timeLabel: session.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      details: isInPerson && isRemote ? `${details} (mixte)` : details,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 502 });
  }
}
