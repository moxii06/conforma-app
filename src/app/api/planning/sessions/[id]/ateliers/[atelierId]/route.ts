import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { atelierSchema, lieuSelonFormat, videEnNull } from "../atelier";

// Modifier ou annuler un atelier. Tout passe par la session parente pour le
// cloisonnement : l'atelier n'a pas d'organizationId à lui.
const patchSchema = atelierSchema.partial().extend({
  /**
   * `true` annule, `false` remet l'atelier debout.
   *
   * Un atelier annulé n'est jamais supprimé : des apprenants s'y étaient
   * inscrits, et faire disparaître le rendez-vous de leur écran sans rien
   * dire est pire que de l'afficher barré.
   */
  annulee: z.boolean().optional(),
});

async function chargerAtelier(sessionId: string, atelierId: string, organizationId: string) {
  return prisma.sessionAtelier.findFirst({
    where: { id: atelierId, session: { id: sessionId, organizationId } },
    include: { _count: { select: { participants: true } } },
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string; atelierId: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const atelier = await chargerAtelier(params.id, params.atelierId, auth.organizationId);
  if (!atelier) return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Champs invalides." }, { status: 400 });
  }
  const data = parsed.data;

  const startsAt = data.startsAt ? new Date(data.startsAt) : atelier.startsAt;
  const endsAt = data.endsAt ? new Date(data.endsAt) : atelier.endsAt;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "L'heure de fin doit suivre l'heure de début." }, { status: 400 });
  }

  // Le format décide de ce qui a un sens à conserver — y compris quand
  // seul le format change et que le lieu vient de la valeur déjà en base.
  const format = data.format ?? atelier.format;
  const { location, meetingLink } = lieuSelonFormat(
    format,
    data.location !== undefined ? videEnNull(data.location) : atelier.location,
    data.meetingLink !== undefined ? videEnNull(data.meetingLink) : atelier.meetingLink,
  );

  const updated = await prisma.sessionAtelier.update({
    where: { id: atelier.id },
    data: {
      ...(data.titre !== undefined ? { titre: data.titre } : {}),
      ...(data.description !== undefined ? { description: videEnNull(data.description) } : {}),
      startsAt,
      endsAt,
      format,
      location,
      meetingLink,
      ...(data.capacity !== undefined ? { capacity: data.capacity ?? null } : {}),
      ...(data.annulee !== undefined ? { annuleeAt: data.annulee ? new Date() : null } : {}),
    },
  });

  return NextResponse.json(updated);
}

/**
 * Suppression réservée aux ateliers sans aucun inscrit — la corbeille des
 * erreurs de saisie, rien de plus. Dès qu'une personne s'est inscrite, le
 * rendez-vous a existé pour elle : la sortie est l'annulation, qui le laisse
 * visible et barré.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string; atelierId: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const atelier = await chargerAtelier(params.id, params.atelierId, auth.organizationId);
  if (!atelier) return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });

  if (atelier._count.participants > 0) {
    return NextResponse.json(
      {
        error:
          "Cet atelier compte des inscrits : annulez-le plutôt que de le supprimer, pour qu'ils voient qu'il n'a pas lieu.",
      },
      { status: 409 },
    );
  }

  await prisma.sessionAtelier.delete({ where: { id: atelier.id } });
  return NextResponse.json({ ok: true });
}
