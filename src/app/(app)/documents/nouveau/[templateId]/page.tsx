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
      course: { select: { title: true } },
      _count: { select: { dossiers: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 60,
  });

  // Reprise d'un brouillon : on ne rouvre que ce qui est encore modifiable.
  const brouillon = doc
    ? await prisma.document.findFirst({
        where: { id: doc, organizationId, status: "draft", sentByUserId: null },
        select: { id: true, title: true, bodyText: true, dossierId: true },
      })
    : null;

  const sessionDuBrouillon = brouillon?.dossierId
    ? (await prisma.dossier.findUnique({ where: { id: brouillon.dossierId }, select: { sessionId: true } }))?.sessionId ?? null
    : null;

  return (
    <DocumentComposer
      template={template}
      sessions={sessions.map((s) => ({
        id: s.id,
        label: `${s.course.title} — ${new Date(s.startsAt).toLocaleDateString("fr-FR")}`,
        learnerCount: s._count.dossiers,
      }))}
      mergeFields={AVAILABLE_MERGE_FIELDS}
      draft={brouillon ? { id: brouillon.id, title: brouillon.title, bodyText: brouillon.bodyText ?? "", sessionId: sessionDuBrouillon } : null}
    />
  );
}
