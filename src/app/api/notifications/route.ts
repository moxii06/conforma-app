import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { getDashboardTasks } from "@/lib/dashboardTasks";

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
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dashboard") === "none") return NextResponse.json({ tasks: [] });

  const tasks = await getDashboardTasks(session.organizationId, session.role, session.userId);
  return NextResponse.json({ tasks });
}
