import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, NON_CUMULABLE_ROLES, ROLE_LABELS } from "@/lib/tenant";

/**
 * Les rôles CUMULÉS d'un membre — le formateur qui est aussi commercial.
 *
 * Route à part de PATCH /api/team/members/[id] (nom, email, rôle principal)
 * bien qu'elle écrive sur la même ligne : le rôle principal se change dans
 * une liste déroulante, les casquettes secondaires se cochent dans une
 * boîte de dialogue avec un aperçu des permissions. Deux gestes, deux
 * charges utiles, deux messages d'erreur — les mélanger obligerait chaque
 * appelant à renvoyer ce qu'il ne touche pas.
 */
const schema = z.object({ additionalRoles: z.array(z.nativeEnum(Role)) });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  // L'identifiant vient du client : on relit le membre depuis la base en le
  // bornant à l'organisation de la session, sinon un id d'un autre organisme
  // suffirait à lui distribuer des droits.
  const member = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { id: true, role: true },
  });
  if (!member) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // Un compte apprenant est le CLIENT de l'organisme. Lui ajouter une
  // casquette d'équipe le ferait entrer dans les écrans de gestion — la
  // même raison qui fait refuser LEARNER comme valeur, appliquée cette
  // fois à la cible.
  if (member.role === Role.LEARNER) {
    return NextResponse.json(
      { error: "Un compte apprenant ne peut pas cumuler de rôles d'équipe." },
      { status: 400 },
    );
  }

  // Refus explicite plutôt que filtrage silencieux : quelqu'un qui coche
  // « Apprenant » doit lire pourquoi c'est refusé, pas voir sa case se
  // décocher toute seule. (NON_CUMULABLE_ROLES sert AUSSI de filtre au
  // moment de la lecture, dans effectiveRoles — deux verrous, parce que la
  // base peut être écrite par un seed ou du SQL à la main.)
  const refuse = parsed.data.additionalRoles.find((r) => NON_CUMULABLE_ROLES.includes(r));
  if (refuse) {
    return NextResponse.json(
      {
        error:
          refuse === Role.ADMIN_OF
            ? "Le rôle Admin OF ne se cumule pas : un organisme n'a qu'un seul propriétaire."
            : `Le rôle « ${ROLE_LABELS[refuse]} » ne peut pas être cumulé.`,
      },
      { status: 400 },
    );
  }

  // Le rôle principal n'a rien à faire dans la liste des rôles ajoutés : il
  // y serait redondant et ferait afficher « Formateur » deux fois. On le
  // retire ici plutôt que de le refuser, parce que c'est une redite, pas
  // une erreur de l'utilisateur.
  const additionalRoles = [...new Set(parsed.data.additionalRoles)].filter((r) => r !== member.role);

  const updated = await prisma.user.update({
    where: { id: member.id },
    data: { additionalRoles: { set: additionalRoles } },
    select: { id: true, role: true, additionalRoles: true },
  });

  return NextResponse.json(updated);
}
