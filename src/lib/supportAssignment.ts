import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { canAccessSecureReports, effectiveRoles } from "@/lib/tenant";
import type { SupportKind } from "@/lib/supportRequests";

/**
 * Qui peut être désigné sur une demande d'aide, et à quelles conditions.
 *
 * Vit à part de la page parce que la MÊME question se pose à deux endroits qui
 * ne doivent pas répondre différemment : l'écran, qui propose une liste de
 * cases à cocher, et la route PATCH, qui reçoit des identifiants envoyés par
 * le navigateur. Le second ne fait jamais confiance au premier — les membres
 * sont systématiquement relus depuis la base et bornés à l'organisation.
 */

export type MembreSupport = {
  id: string;
  name: string;
  /**
   * Habilité à LIRE un signalement confidentiel (canAccessSecureReports sur
   * ses rôles effectifs, cumul compris). Faux pour la grande majorité de
   * l'équipe : c'est voulu, le canal de signalement existe précisément pour
   * que le cercle des lecteurs reste minuscule.
   */
  habiliteSignalements: boolean;
};

/**
 * Les membres de l'équipe proposables comme responsable ou destinataire.
 *
 * Les apprenants sont exclus : ce sont les clients de l'organisme, pas des
 * personnes à qui l'on confie le traitement d'une demande.
 */
export async function listerMembresSupport(organizationId: string): Promise<MembreSupport[]> {
  const users = await prisma.user.findMany({
    where: { organizationId, role: { not: Role.LEARNER } },
    select: { id: true, name: true, email: true, role: true, additionalRoles: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    // `name` peut être vide tant que l'invitation n'a pas été activée ;
    // l'email reste alors la seule façon de reconnaître la personne.
    name: u.name || u.email,
    habiliteSignalements: canAccessSecureReports(effectiveRoles(u.role, u.additionalRoles)),
  }));
}

export type ResolutionAffectation =
  | { ok: true; assignedToName: string | null; notifyUserIds: string[] }
  | { ok: false; error: string };

/**
 * Valide le couple « responsable + destinataires supplémentaires » d'une
 * demande, et rend les valeurs à écrire.
 *
 * Trois règles, toutes issues du même principe : une demande dont tout le
 * monde est responsable n'est traitée par personne.
 *
 *  1. Le responsable est UNIQUE (`assignedToUserId`). Les destinataires
 *     supplémentaires sont prévenus et peuvent suivre, ils ne portent pas la
 *     demande.
 *  2. Le responsable ne figure jamais aussi dans les destinataires
 *     supplémentaires — il serait notifié deux fois, et la ligne « prévenus
 *     en plus » mentirait sur qui doit agir.
 *  3. Sur un SIGNALEMENT CONFIDENTIEL, tout destinataire doit être habilité à
 *     le lire. Prévenir quelqu'un d'un signalement qu'il ne peut pas ouvrir,
 *     c'est lui révéler qu'il en existe un — l'exact contraire de ce que ce
 *     canal protège — et lui donner une notification sans issue.
 */
export async function resoudreAffectation(params: {
  organizationId: string;
  kind: SupportKind;
  /**
   * Le responsable que la requête POSE. `undefined` = la requête n'y touche
   * pas, il n'y a donc rien à valider : une modification d'échéance ne doit
   * pas échouer parce qu'un responsable désigné autrefois a depuis quitté
   * l'organisme.
   */
  assignedToUserId: string | null | undefined;
  /**
   * Le responsable EFFECTIF après la requête (posé ou déjà en base). Sert
   * uniquement à l'exclure des destinataires supplémentaires — jamais validé.
   */
  responsableEffectifId: string | null;
  notifyUserIds: string[] | undefined;
}): Promise<ResolutionAffectation> {
  const { organizationId, kind, assignedToUserId, responsableEffectifId } = params;

  // La requête ne touche ni au responsable ni aux destinataires (un simple
  // changement de statut, par exemple) : rien à valider, et surtout pas de
  // lecture de l'annuaire à payer. L'appelant n'écrit de toute façon ces deux
  // colonnes que lorsqu'il les a reçues.
  if (assignedToUserId === undefined && params.notifyUserIds === undefined) {
    return { ok: true, assignedToName: null, notifyUserIds: [] };
  }

  // Une seule lecture pour les deux vérifications ci-dessous.
  const membres = await listerMembresSupport(organizationId);
  const parId = new Map(membres.map((m) => [m.id, m] as [string, MembreSupport]));
  const exigeHabilitation = kind === "secure-reports";

  let assignedToName: string | null = null;
  if (assignedToUserId) {
    const membre = parId.get(assignedToUserId);
    if (!membre) return { ok: false, error: "Membre introuvable." };
    if (exigeHabilitation && !membre.habiliteSignalements) {
      return {
        ok: false,
        error: `${membre.name} n'est pas habilité(e) à lire les signalements confidentiels et ne peut pas en être responsable.`,
      };
    }
    assignedToName = membre.name;
  }

  const notifyUserIds: string[] = [];
  for (const id of params.notifyUserIds ?? []) {
    if (id === responsableEffectifId) continue; // règle 2
    if (notifyUserIds.includes(id)) continue;
    const membre = parId.get(id);
    if (!membre) return { ok: false, error: "Destinataire introuvable." };
    if (exigeHabilitation && !membre.habiliteSignalements) {
      return {
        ok: false,
        error: `${membre.name} n'est pas habilité(e) à lire les signalements confidentiels et ne peut pas en être destinataire.`,
      };
    }
    notifyUserIds.push(id);
  }

  return { ok: true, assignedToName, notifyUserIds };
}
