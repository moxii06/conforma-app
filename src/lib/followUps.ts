import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { addDays } from "date-fns";

// "Relances" thresholds — how long to wait before a pending step counts as
// needing a follow-up. Not spec-mandated numbers, just sane defaults; make
// these configurable per-org if that's ever asked for.
const REMINDER_AFTER_DAYS = 5;
const CONVOCATION_WARNING_DAYS = 7;

export type FollowUp = {
  id: string;
  kind: "needs_assessment" | "contract" | "platform_access" | "convocation";
  label: string;
  contactName: string;
  since: Date;
  href: string;
};

// Aggregates every "sent, waiting on the other side" step across the three
// tracking sources this scaffold has (NeedsAssessmentRequest, ClientOutreach,
// Dossier.convocationSent) into one dashboard-ready list. Scoped by role
// using the same ownership rules as the rest of the app: SALES only sees
// their own prospects' positioning tests, TRAINER only sees their own
// sessions' pending convocations, ADMIN_OF/ADMIN_MANAGER see everything.
export async function getFollowUpsDue(organizationId: string, role: Role, userId: string): Promise<FollowUp[]> {
  const threshold = addDays(new Date(), -REMINDER_AFTER_DAYS);
  const results: FollowUp[] = [];

  const canSeeGeneral = role === Role.ADMIN_OF || role === Role.ADMIN_MANAGER;
  const canSeeSales = canSeeGeneral || role === Role.SALES;
  const canSeeTrainer = canSeeGeneral || role === Role.TRAINER;

  if (canSeeSales) {
    const needsAssessments = await prisma.needsAssessmentRequest.findMany({
      where: {
        organizationId,
        status: "sent",
        sentAt: { lt: threshold },
        ...(role === Role.SALES ? { opportunity: { ownerId: userId } } : {}),
      },
      include: { contact: true },
      orderBy: { sentAt: "asc" },
    });
    for (const r of needsAssessments) {
      results.push({
        id: r.id,
        kind: "needs_assessment",
        label: "Test de positionnement envoyé, sans réponse",
        contactName: `${r.contact.firstName} ${r.contact.lastName}`,
        since: r.sentAt,
        href: "/crm",
      });
    }
  }

  if (canSeeGeneral) {
    const outreaches = await prisma.clientOutreach.findMany({
      where: {
        organizationId,
        status: "sent",
        sentAt: { lt: threshold },
        type: { in: ["contract", "platform_access"] },
      },
      include: { contact: true },
      orderBy: { sentAt: "asc" },
    });
    for (const o of outreaches) {
      results.push({
        id: o.id,
        kind: o.type as "contract" | "platform_access",
        label: o.type === "contract" ? "Contrat envoyé, non signé" : "Accès plateforme envoyé, non activé",
        contactName: `${o.contact.firstName} ${o.contact.lastName}`,
        since: o.sentAt,
        href: o.dossierId ? `/dossiers/${o.dossierId}` : "/crm",
      });
    }
  }

  if (canSeeTrainer) {
    const soon = addDays(new Date(), CONVOCATION_WARNING_DAYS);
    const dossiersNeedingConvocation = await prisma.dossier.findMany({
      where: {
        organizationId,
        convocationSent: false,
        session: {
          startsAt: { gte: new Date(), lte: soon },
          ...(role === Role.TRAINER ? { trainerId: userId } : {}),
        },
      },
      include: { contact: true, session: true },
      orderBy: { session: { startsAt: "asc" } },
    });
    for (const d of dossiersNeedingConvocation) {
      results.push({
        id: d.id,
        kind: "convocation",
        label: `Convocation à envoyer — session le ${d.session.startsAt.toLocaleDateString("fr-FR")}`,
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: d.session.startsAt,
        href: `/dossiers/${d.id}`,
      });
    }
  }

  return results.sort((a, b) => a.since.getTime() - b.since.getTime());
}
