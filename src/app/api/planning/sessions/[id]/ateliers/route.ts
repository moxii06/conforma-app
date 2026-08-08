import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { atelierSchema, lieuSelonFormat, videEnNull } from "./atelier";

/**
 * Créer un atelier ponctuel dans une session — voir le commentaire du modèle
 * SessionAtelier dans schema.prisma pour la raison d'être : un rendez-vous
 * daté DANS une session, et non une seconde session concurrente.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Même exigence que la modification de la session elle-même (PATCH
  // /api/planning/sessions/[id]) : « full ». Aucun filtre de propriété du
  // formateur n'est ajouté, contrairement à /attendance/sign : là-bas le
  // contrôle laisse passer « limited », donc un formateur arrive jusqu'à la
  // requête et il faut vérifier qu'il anime bien cette session. Ici « full »
  // exclut déjà TRAINER, et un tel filtre laisserait croire l'inverse.
  if (can(auth.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const parsed = atelierSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Champs invalides." }, { status: 400 });
  }
  const data = parsed.data;

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "L'heure de fin doit suivre l'heure de début." }, { status: 400 });
  }

  const { location, meetingLink } = lieuSelonFormat(
    data.format,
    videEnNull(data.location),
    videEnNull(data.meetingLink),
  );

  const atelier = await prisma.sessionAtelier.create({
    data: {
      sessionId: session.id,
      titre: data.titre,
      description: videEnNull(data.description),
      startsAt,
      endsAt,
      format: data.format,
      location,
      meetingLink,
      capacity: data.capacity ?? null,
    },
  });

  return NextResponse.json(atelier, { status: 201 });
}
