import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { prochainRappel } from "@/lib/mediationConsommation";

// « À faire plus tard » sur l'adhésion à un médiateur de la consommation.
//
// Un report d'un mois, pas un renoncement : l'obligation de l'art. L.612-1
// subsiste, l'étape de démarrage reste décochée, et le rappel revient. C'est
// tout ce que le bouton promet, et il ne doit rien promettre de plus.
//
// Réservé à ADMIN_OF : adhérer engage l'organisme et coûte de l'argent, ce
// n'est pas une décision que prend un formateur ou un commercial.
export async function POST() {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (auth.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Action réservée à l'administrateur de l'organisme." }, { status: 403 });
  }

  const jusquA = prochainRappel(new Date());
  await prisma.organization.update({
    where: { id: auth.organizationId },
    data: { mediatorReminderSnoozedUntil: jusquA },
  });
  return NextResponse.json({ snoozedUntil: jusquA.toISOString() });
}
