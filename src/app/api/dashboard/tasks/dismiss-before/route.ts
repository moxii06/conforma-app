import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// `null` remet la liste complète : l'action doit être annulable.
const schema = z.object({ avant: z.string().min(1).nullable() });

/**
 * Date de reprise du « à faire » — l'échappatoire de la migration.
 *
 * Un organisme qui verse trois ans d'historique dans Jalon n'y a coché
 * aucune case : tout son passé remonte comme du travail en retard. Sans
 * cela, il n'a que deux issues — cliquer la croix deux cents fois, ou
 * vivre avec une liste qui ment.
 *
 * Enregistre UNE date sur l'organisation, appliquée ensuite dans les
 * requêtes de getDashboardTasks.
 *
 * La première version de cette route créait un DashboardTaskDismissal par
 * tâche. C'était faux, et la mesure l'a montré : les tâches étant
 * plafonnées par famille avant d'être filtrées, « masquer tout ce qui
 * précède le 1er août » créait 214 lignes de rejet alors que 3 903
 * dossiers étaient réellement concernés — et ces 214 lignes continuaient
 * ensuite à consommer le plafond, rendant la famille vide pour toujours
 * pendant que les 3 689 autres restaient hors de portée. Un seuil est
 * exact quel que soit le volume, tient en un champ, et s'annule.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Le réglage vaut pour toute l'équipe : même exigence que les autres
  // réglages d'organisme.
  if (can(session.role, "dashboard") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  let avant: Date | null = null;
  if (parsed.data.avant !== null) {
    avant = new Date(parsed.data.avant);
    if (Number.isNaN(avant.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: { tasksHiddenBefore: avant },
    select: { tasksHiddenBefore: true },
  });

  return NextResponse.json({ ok: true, tasksHiddenBefore: updated.tasksHiddenBefore });
}
