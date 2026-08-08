import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { TYPE_DEMANDE_ACCES_INTERNE } from "@/lib/rgpdMasking";

/**
 * « Demander au DPO » — la porte de sortie du masquage des coordonnées.
 *
 * Sans elle, la minimisation devient un mur : le formateur qui a une vraie
 * raison de rappeler un ancien stagiaire n'a plus que le carnet d'adresses
 * personnel, c'est-à-dire une copie hors de tout registre. Une règle de
 * protection des données qu'on ne peut pas contester légitimement finit
 * toujours contournée.
 *
 * La demande atterrit donc dans le registre RGPD, tracée et assignée —
 * l'inverse exact d'un contournement.
 *
 * Route distincte de /api/dossiers/[id]/rights-request, et non une option
 * de celle-ci : cette dernière exige canWriteRgpd (donc exclut le
 * formateur, qui est précisément le demandeur ici), et n'a pas à s'ouvrir
 * pour cela — ce serait donner à tout formateur le droit d'écrire dans le
 * registre des droits des personnes.
 */
const schema = z.object({ dossierId: z.string().min(1) });

function dansUnMois(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // Relu depuis la base, scopé organisation : l'identifiant vient du
  // navigateur, il ne prouve rien.
  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId },
    select: {
      id: true,
      contact: { select: { firstName: true, lastName: true } },
      session: { select: { trainerId: true, course: { select: { title: true } } } },
    },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  // Même règle de propriété que la fiche dossier : un formateur ne demande
  // que pour SES apprenants.
  if (session.role === Role.TRAINER && dossier.session.trainerId !== session.userId) {
    return NextResponse.json({ error: "Action non autorisée sur ce dossier." }, { status: 403 });
  }

  const personLabel = `${dossier.contact.firstName} ${dossier.contact.lastName}`;

  // Une demande en cours suffit. Sans ce garde-fou, un formateur qui reclique
  // parce que « rien ne s'est passé » remplit le registre de doublons — et un
  // registre bruyant est un registre qu'on cesse de lire.
  const existante = await prisma.rightsRequest.findFirst({
    where: {
      organizationId: session.organizationId,
      requestType: TYPE_DEMANDE_ACCES_INTERNE,
      personLabel,
      status: { not: "closed" },
    },
    select: { id: true, assignedToName: true },
  });
  if (existante) {
    return NextResponse.json({ dejaExistante: true, assigneA: existante.assignedToName }, { status: 200 });
  }

  // Le DPO de l'organisme, s'il existe : rôle principal DPO_EXTERNAL, ou
  // casquette cumulée (User.additionalRoles) — un dirigeant peut être son
  // propre DPO. Sans DPO déclaré, la demande reste non assignée plutôt que
  // d'échouer : elle est visible dans l'onglet « Demandes de droits », où
  // un admin la reprend.
  const dpo = await prisma.user.findFirst({
    where: {
      organizationId: session.organizationId,
      status: "active",
      OR: [{ role: Role.DPO_EXTERNAL }, { additionalRoles: { has: Role.DPO_EXTERNAL } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  await prisma.rightsRequest.create({
    data: {
      organizationId: session.organizationId,
      requestType: TYPE_DEMANDE_ACCES_INTERNE,
      personLabel,
      deadline: dansUnMois(),
      status: "open",
      assignedToUserId: dpo?.id ?? null,
      assignedToName: dpo?.name ?? null,
      details:
        `${session.name || session.email} demande à revoir les coordonnées de ${personLabel} ` +
        `(formation « ${dossier.session.course.title} »), masquées par la règle de minimisation. ` +
        `Motif à recueillir auprès du demandeur avant de rouvrir l'accès.`,
    },
  });

  return NextResponse.json({ dejaExistante: false, assigneA: dpo?.name ?? null }, { status: 201 });
}
