import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ dossierId: z.string().min(1) });

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

// Generates a real Document (bodyText, same as convocation/contract — see
// Document model) from the actual VirtualClassAttendance row, not a
// staff-typed number — the certificate can only ever say what the
// heartbeat data recorded.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const classSession = await prisma.session.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { course: true },
  });
  if (!classSession) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, sessionId: classSession.id },
    include: { contact: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const attendance = await prisma.virtualClassAttendance.findUnique({
    where: { sessionId_dossierId: { sessionId: classSession.id, dossierId: dossier.id } },
  });
  if (!attendance) {
    return NextResponse.json({ error: "Aucune connexion enregistrée pour cet apprenant sur cette session." }, { status: 400 });
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  const bodyText =
    `ATTESTATION DE PRÉSENCE — CLASSE VIRTUELLE\n\n` +
    `Organisme : ${organization.name}\n` +
    `Formation : ${classSession.course.title}\n` +
    `Date de la session : ${classSession.startsAt.toLocaleDateString("fr-FR")} (${classSession.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}–${classSession.endsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})\n\n` +
    `Nous attestons que ${dossier.contact.firstName} ${dossier.contact.lastName} s'est connecté(e) à la classe virtuelle de cette session.\n\n` +
    `Première connexion : ${attendance.joinedAt.toLocaleString("fr-FR")}\n` +
    `Dernière activité : ${attendance.lastPingAt.toLocaleString("fr-FR")}\n` +
    `${attendance.leftAt ? `Déconnexion : ${attendance.leftAt.toLocaleString("fr-FR")}\n` : ""}` +
    `Durée de présence enregistrée : ${formatDuration(attendance.durationSeconds)}\n\n` +
    // Nommer l'outil ici, c'était le nommer sur une preuve d'émargement
    // remise au financeur. Ce qui compte pour lui est la MÉTHODE de mesure —
    // connexion effective plutôt que déclaration — pas la marque du logiciel
    // qui l'a mesurée.
    `Durée mesurée par connexion effective à la classe virtuelle (présence de session navigateur horodatée), et non par déclaration sur l'honneur.\n\n` +
    `Fait le ${new Date().toLocaleDateString("fr-FR")}.`;

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: `Attestation de présence — ${classSession.course.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
      bodyText,
      templateOrigin: "attendance_certificate",
    },
  });

  return NextResponse.json(document, { status: 201 });
}
