import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { getDashboardTasks } from "@/lib/dashboardTasks";
import { prisma } from "@/lib/prisma";

// « Tout effacer » dans la cloche — marque comme vues les tâches en cours
// pour LUI (userId), pas pour toute l'organisation : voir le commentaire de
// schéma sur NotificationDismissal. skipDuplicates rend l'appel rejouable
// sans risque (retente réseau, double-clic).
//
// La liste à masquer est recalculée ICI, elle n'est plus envoyée par le
// navigateur. Avant, la cloche postait les identifiants de tout ce qu'elle
// avait reçu — ce qui l'obligeait à tout recevoir, soit 3,5 Mo sur chaque
// page à 4 000 apprenants, alors qu'elle n'affiche que huit lignes.
//
// Effet de bord assumé, et c'est bien le sens de « tout effacer » : ce sont
// toutes les tâches en cours qui sont masquées, y compris celles que le
// menu déroulant ne montrait pas.
export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dashboard") === "none") return NextResponse.json({ ok: true, cleared: 0 });

  const tasks = await getDashboardTasks(session.organizationId, session.role, session.userId);

  await prisma.notificationDismissal.createMany({
    data: tasks.map((t) => ({ userId: session.userId, kind: t.kind, entityId: t.id })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, cleared: tasks.length });
}
