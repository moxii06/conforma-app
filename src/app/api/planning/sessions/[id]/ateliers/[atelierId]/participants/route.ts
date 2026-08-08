import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

/**
 * Inscrire, pointer, désinscrire — les trois gestes sur la liste d'un
 * atelier.
 *
 * Ce qu'aucune de ces routes ne produit : une preuve d'émargement. La
 * présence à un atelier est une information de suivi pour l'organisme ;
 * l'émargement Qualiopi reste AttendanceEntry, signé par demi-journée
 * (voir /api/planning/sessions/[id]/attendance/sign).
 *
 * Le contrôle d'accès est recopié dans les trois gestionnaires plutôt que
 * factorisé : c'est le patron de toutes les routes voisines, et un helper
 * qui renvoie « soit l'auth soit une réponse d'erreur » se lit moins bien
 * que les quatre lignes qu'il remplace.
 */

const inscrireSchema = z.object({ dossierId: z.string().min(1) });
const presenceSchema = z.object({ dossierId: z.string().min(1), present: z.boolean() });

/**
 * Relit l'atelier ET le dossier depuis la base, tous deux rattachés à CETTE
 * session et à CETTE organisation. Ne jamais faire confiance aux deux
 * identifiants du client pris isolément : un id d'atelier valide plus un id
 * de dossier emprunté à un autre organisme écrirait sinon une inscription
 * en travers de la frontière. L'atelier ne portant pas d'organizationId, le
 * cloisonnement passe toujours par sa session parente.
 */
async function relire(sessionId: string, atelierId: string, dossierId: string, organizationId: string) {
  const [atelier, dossier] = await Promise.all([
    prisma.sessionAtelier.findFirst({
      where: { id: atelierId, session: { id: sessionId, organizationId } },
      include: { _count: { select: { participants: true } } },
    }),
    prisma.dossier.findFirst({
      where: { id: dossierId, sessionId, organizationId },
      select: { id: true },
    }),
  ]);
  return { atelier, dossier };
}

export async function POST(request: Request, props: { params: Promise<{ id: string; atelierId: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles ?? auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = inscrireSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Apprenant requis." }, { status: 400 });

  const { atelier, dossier } = await relire(params.id, params.atelierId, parsed.data.dossierId, auth.organizationId);
  if (!atelier) return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Apprenant non inscrit à cette session." }, { status: 404 });
  if (atelier.annuleeAt) {
    return NextResponse.json({ error: "Cet atelier est annulé : plus personne ne peut s'y inscrire." }, { status: 409 });
  }

  // Déjà inscrit : on renvoie l'inscription existante plutôt qu'une erreur.
  // Deux clics sur la même case ne sont pas une faute, et l'unicité
  // [atelierId, dossierId] ferait sinon remonter une erreur Prisma brute.
  const dejaInscrit = await prisma.atelierParticipant.findUnique({
    where: { atelierId_dossierId: { atelierId: atelier.id, dossierId: dossier.id } },
  });
  if (dejaInscrit) return NextResponse.json(dejaInscrit);

  // Le plafond est vérifié ici, et pas seulement à l'écran : deux personnes
  // qui inscrivent en même temps voient chacune la même place libre.
  if (atelier.capacity != null && atelier._count.participants >= atelier.capacity) {
    return NextResponse.json(
      { error: `Atelier complet (${atelier.capacity} places) — aucune inscription supplémentaire.` },
      { status: 409 },
    );
  }

  const participant = await prisma.atelierParticipant.create({
    data: { atelierId: atelier.id, dossierId: dossier.id },
  });
  return NextResponse.json(participant, { status: 201 });
}

/** Pointer la présence effective — distincte de l'inscription. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string; atelierId: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles ?? auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = presenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const { atelier, dossier } = await relire(params.id, params.atelierId, parsed.data.dossierId, auth.organizationId);
  if (!atelier) return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Apprenant non inscrit à cette session." }, { status: 404 });

  const participant = await prisma.atelierParticipant.findUnique({
    where: { atelierId_dossierId: { atelierId: atelier.id, dossierId: dossier.id } },
  });
  if (!participant) {
    return NextResponse.json({ error: "Cet apprenant n'est pas inscrit à l'atelier." }, { status: 404 });
  }

  const updated = await prisma.atelierParticipant.update({
    where: { id: participant.id },
    data: { presentAt: parsed.data.present ? new Date() : null },
  });
  return NextResponse.json(updated);
}

/**
 * Désinscrire. `deleteMany` plutôt que `delete` : la ligne a pu disparaître
 * entre l'affichage et le clic (un autre écran ouvert en parallèle), et une
 * désinscription qui échoue parce que la personne est déjà désinscrite n'a
 * rien à signaler.
 */
export async function DELETE(request: Request, props: { params: Promise<{ id: string; atelierId: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles ?? auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossierId = new URL(request.url).searchParams.get("dossierId");
  if (!dossierId) return NextResponse.json({ error: "Apprenant requis." }, { status: 400 });

  const { atelier, dossier } = await relire(params.id, params.atelierId, dossierId, auth.organizationId);
  if (!atelier) return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Apprenant non inscrit à cette session." }, { status: 404 });

  await prisma.atelierParticipant.deleteMany({ where: { atelierId: atelier.id, dossierId: dossier.id } });
  return NextResponse.json({ ok: true });
}
