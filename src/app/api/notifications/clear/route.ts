import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  items: z.array(z.object({ kind: z.string().min(1), entityId: z.string().min(1) })),
});

// "Tout effacer" dans la cloche — marque comme vues les tâches que le
// lecteur avait sous les yeux au moment du clic, pour LUI (userId), pas
// pour toute l'organisation : voir le commentaire de schéma sur
// NotificationDismissal. skipDuplicates rend l'appel rejouable sans risque
// (retente réseau, double-clic).
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  await prisma.notificationDismissal.createMany({
    data: parsed.data.items.map((item) => ({ userId: session.userId, kind: item.kind, entityId: item.entityId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
