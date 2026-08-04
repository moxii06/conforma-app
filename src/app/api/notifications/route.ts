import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { getDashboardTasks } from "@/lib/dashboardTasks";
import { prisma } from "@/lib/prisma";

// La liste « à faire » pour la cloche de notifications.
//
// Elle était calculée dans la Sidebar, donc dans le layout partagé, donc sur
// CHAQUE page de l'application — une quinzaine de requêtes à chaque
// navigation, uniquement pour afficher un compteur. Et deux fois sur le
// tableau de bord, qui la recalcule pour lui-même.
//
// La cloche la récupère maintenant elle-même, après le rendu : la page
// s'affiche sans attendre, et les autres écrans ne paient plus pour un
// widget qui ne les concerne pas.
//
// Audit « 4 000 apprenants » : cette route renvoyait la liste ENTIÈRE des
// tâches. Mesuré sur un jeu à 4 000 apprenants / 8 000 dossiers, cela
// faisait 3,5 Mo de JSON — sur chaque page de l'application — pour
// afficher un badge plafonné à « 9+ » et huit lignes dans le menu
// déroulant. On ne renvoie donc plus que ce qui est réellement affiché :
// le décompte, et les premières tâches.
const TACHES_AFFICHEES = 8;

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dashboard") === "none") {
    return NextResponse.json({ tasks: [], count: 0, overdueCount: 0 });
  }

  const [tasks, dismissals] = await Promise.all([
    getDashboardTasks(session.organizationId, session.role, session.userId),
    prisma.notificationDismissal.findMany({
      where: { userId: session.userId },
      select: { kind: true, entityId: true },
    }),
  ]);

  // Le filtrage par « déjà vu » se fait ici et non plus côté navigateur :
  // sinon il faudrait lui envoyer la liste complète pour qu'il la coupe
  // lui-même, ce qui est exactement le coût qu'on supprime.
  const dismissedKeys = new Set(dismissals.map((d) => `${d.kind}-${d.entityId}`));
  const visibles = tasks.filter((t) => !dismissedKeys.has(`${t.kind}-${t.id}`));

  return NextResponse.json({
    tasks: visibles.slice(0, TACHES_AFFICHEES),
    count: visibles.length,
    overdueCount: visibles.filter((t) => t.overdue).length,
  });
}
