import { prisma } from "@/lib/prisma";
import { requireSessionContext, can } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { DocumentComposer } from "@/components/DocumentComposer";
import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";

export default async function ComposerPage(props: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { templateId } = await props.params;
  const { doc } = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none" && can(role, "toolkit") === "none") redirect("/dashboard");

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId }, { organizationId: null }] },
    select: { id: true, title: true, category: true },
  });
  if (!template) notFound();

  // Les sessions proposées : celles que ce rôle a le droit de voir. Un
  // formateur ne pilote que les siennes.
  const sessions = await prisma.session.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(role === Role.TRAINER ? { trainerId: userId } : {}),
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      course: { select: { title: true, priceCents: true } },
      _count: { select: { dossiers: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 60,
  });

  // Reprise d'un brouillon : on ne rouvre que ce qui est encore modifiable.
  const brouillon = doc
    ? await prisma.document.findFirst({
        where: { id: doc, organizationId, status: "draft", sentByUserId: null },
        select: { id: true, title: true, bodyText: true, dossierId: true, paymentSchedule: true },
      })
    : null;

  const sessionDuBrouillon = brouillon?.dossierId
    ? (await prisma.dossier.findUnique({ where: { id: brouillon.dossierId }, select: { sessionId: true } }))?.sessionId ?? null
    : null;

  // L'échéancier est une donnée d'argent : même audience que /facturation,
  // pas l'ensemble plus large des rôles qui peuvent rédiger un document. Un
  // formateur apprendrait sinon le prix par ce biais.
  const peutVoirArgent = can(role, "invoicing") !== "none";
  const organization = peutVoirArgent
    ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { paymentCapAckAt: true } })
    : null;

  return (
    <DocumentComposer
      template={template}
      sessions={sessions.map((s) => ({
        id: s.id,
        label: `${s.course.title} — ${new Date(s.startsAt).toLocaleDateString("fr-FR")}`,
        learnerCount: s._count.dossiers,
        // Sans prix connu, pas d'échéancier proposé : un échéancier contre
        // un total inconnu ne veut rien dire (même règle que la fiche
        // dossier).
        priceCents: peutVoirArgent ? s.course.priceCents : null,
        startsAt: s.startsAt.toISOString(),
        endsAt: (s.endsAt ?? s.startsAt).toISOString(),
      }))}
      mergeFields={AVAILABLE_MERGE_FIELDS}
      capAcknowledged={Boolean(organization?.paymentCapAckAt)}
      draft={
        brouillon
          ? {
              id: brouillon.id,
              title: brouillon.title,
              bodyText: brouillon.bodyText ?? "",
              sessionId: sessionDuBrouillon,
              schedule: lireEcheancier(brouillon.paymentSchedule),
            }
          : null
      }
    />
  );
}

/**
 * L'échéancier stocké sur un brouillon, relu défensivement.
 *
 * Document.paymentSchedule est une colonne Json : elle a été validée à
 * l'écriture, mais une colonne Json ne prouve rien à la lecture. Une entrée
 * mal formée est écartée — mieux vaut une ligne en moins qu'un montant faux
 * dans un contrat. Même posture que parseStoredSchedule côté envoi.
 */
function lireEcheancier(raw: unknown): { dueDate: string; amountCents: number; label?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (typeof e !== "object" || e === null) return [];
    const { dueDate, amountCents, label } = e as Record<string, unknown>;
    if (typeof dueDate !== "string" || typeof amountCents !== "number") return [];
    return [{ dueDate, amountCents, ...(typeof label === "string" ? { label } : {}) }];
  });
}
