import { prisma } from "@/lib/prisma";

// Un jalon d'activation produit par organisation — jamais répété (contrainte
// unique organizationId+type sur ActivationEvent, voir son commentaire de
// schéma). Répond à "quel % des essais crée une formation, un dossier, un
// document…", ce que l'audit S6 (M3) a trouvé impossible à mesurer :
// track.ts ne couvre que la conversion marketing (GA4, chargé sur les pages
// publiques uniquement), jamais l'usage in-app.
export type ActivationEventType =
  | "first_course_created"
  | "first_dossier_created"
  | "first_document_sent"
  | "first_invoice_created"
  | "onboarding_completed";

export async function recordActivationEvent(organizationId: string, type: ActivationEventType): Promise<void> {
  await prisma.activationEvent.createMany({ data: [{ organizationId, type }], skipDuplicates: true });
}
