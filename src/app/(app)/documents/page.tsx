import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { CATEGORY_LABELS, DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { ForkTemplateButton } from "@/components/ForkTemplateButton";
import { TemplateEditor } from "@/components/TemplateEditor";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { GenerateDocumentButton } from "@/components/GenerateDocumentButton";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { DocumentCategoryFilter } from "@/components/DocumentCategoryFilter";
import { Pagination } from "@/components/Pagination";
import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";

const PAGE_SIZE = 30;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string; category?: string; page?: string };
}) {
  const { organizationId, role, userId } = await requireSessionContext();
  const canToolkit = can(role, "toolkit") !== "none";
  const canDossiers = can(role, "dossiers") !== "none";
  if (!canToolkit && !canDossiers) redirect("/dashboard");

  const TABS = [
    ...(canToolkit ? [{ key: "modeles", label: "Modèles" }] : []),
    ...(canDossiers ? [{ key: "mes-documents", label: "Mes documents" }] : []),
  ];
  const activeTab = searchParams.tab ?? TABS[0].key;
  if (activeTab === "modeles" && !canToolkit) redirect("/documents");
  if (activeTab === "mes-documents" && !canDossiers) redirect("/documents");

  return (
    <>
      <PageHeader title="Bibliothèque de documents" subtitle="Modèles CGV, convention, convocation, évaluations…" />
      <Tabs basePath="/documents" tabs={TABS} active={activeTab} />
      {activeTab === "mes-documents" ? (
        <MyDocumentsTab organizationId={organizationId} role={role} userId={userId} searchParams={searchParams} />
      ) : (
        <TemplatesTab organizationId={organizationId} />
      )}
    </>
  );
}

async function TemplatesTab({ organizationId }: { organizationId: string }) {
  const [globalTemplates, orgTemplates, dossiers, courses] = await Promise.all([
    prisma.documentTemplate.findMany({ where: { organizationId: null }, orderBy: { title: "asc" } }),
    prisma.documentTemplate.findMany({ where: { organizationId }, orderBy: { title: "asc" } }),
    prisma.dossier.findMany({
      where: { organizationId },
      include: { contact: true, session: { include: { course: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.course.findMany({ where: { organizationId, archivedAt: null }, orderBy: { title: "asc" } }),
  ]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    label: `${d.contact.firstName} ${d.contact.lastName} — ${d.session.course.title}`,
  }));

  // Client feedback: "general" documents vs. a per-formation library — a
  // template scoped to a course (see DocumentTemplate.courseId) pulls that
  // course's own title/duration/price into anything generated from it (see
  // mergeTemplate.ts's course.* fields), so it's grouped separately here.
  const generalOrgTemplates = orgTemplates.filter((t) => !t.courseId);
  const coursesWithTemplates = courses
    .map((c) => ({ course: c, templates: orgTemplates.filter((t) => t.courseId === c.id) }))
    .filter((g) => g.templates.length > 0);

  return (
    <div className="p-8 flex flex-col gap-6 max-w-3xl">
      <div className="text-[11.5px] text-slate">
        Les modèles fournis par Jalon sont des points de départ génériques — à faire relire par un juriste avant
        tout usage réel (voir le texte d&apos;avertissement inclus dans chaque modèle). Insérez des champs de
        fusion dans le texte d&apos;un modèle pour qu&apos;ils soient remplacés automatiquement à la génération :{" "}
        {AVAILABLE_MERGE_FIELDS.map((f) => (
          <code key={f} className="bg-[#E6E3DA] rounded px-1 py-0.5 mr-1 text-[10.5px]">{`{{${f}}}`}</code>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[13.5px] font-semibold text-ink">Modèles fournis par Jalon</div>
        {DOCUMENT_CATEGORIES.map((category) => {
          const items = globalTemplates.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="bg-white border border-line rounded-card p-4">
              <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[category]}
              </div>
              {items.map((t) => {
                const alreadyForked = orgTemplates.some((o) => o.forkedFromId === t.id);
                return (
                  <details key={t.id} className="border-t border-line first:border-t-0 py-2.5">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                      <span className="text-[13px] text-ink font-medium">{t.title}</span>
                      {alreadyForked ? (
                        <span className="text-[12px] text-sage">Déjà adapté ✓</span>
                      ) : (
                        <ForkTemplateButton templateId={t.id} />
                      )}
                    </summary>
                    <pre className="whitespace-pre-wrap text-[12px] text-slate mt-2.5 font-sans leading-relaxed">
                      {t.bodyText}
                    </pre>
                    <div className="mt-2">
                      <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                    </div>
                  </details>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[13.5px] font-semibold text-ink">Documents généraux ({generalOrgTemplates.length})</div>
        {generalOrgTemplates.length > 0 && (
          <div className="bg-white border border-line rounded-card p-4">
            {DOCUMENT_CATEGORIES.map((category) => {
              const items = generalOrgTemplates.filter((t) => t.category === category);
              if (items.length === 0) return null;
              return (
                <div key={category} className="mb-3 last:mb-0">
                  <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
                    {CATEGORY_LABELS[category]}
                  </div>
                  {items.map((t) => (
                    <details key={t.id} className="border-t border-line py-2.5">
                      <summary className="cursor-pointer list-none text-[13px] text-ink font-medium">
                        {t.title}
                        {t.forkedFromId && <span className="text-slate font-normal"> (adapté d&apos;un modèle Jalon)</span>}
                      </summary>
                      <div className="mt-2.5 flex flex-col gap-2.5">
                        <TemplateEditor templateId={t.id} title={t.title} bodyText={t.bodyText} />
                        <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                      </div>
                    </details>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {coursesWithTemplates.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="text-[13.5px] font-semibold text-ink">Bibliothèques par formation</div>
            {coursesWithTemplates.map(({ course, templates }) => (
              <div key={course.id} className="bg-white border border-line rounded-card p-4">
                <div className="text-[12.5px] font-semibold text-ink mb-0.5">{course.title}</div>
                <div className="text-[11px] text-slate mb-2.5">
                  {course.durationHours != null ? `${course.durationHours} h` : "Durée non renseignée"}
                  {" · "}
                  {course.priceCents != null
                    ? (course.priceCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
                    : "Prix non renseigné"}
                  {" — "}
                  <a href={`/formations/${course.id}`} className="underline decoration-line hover:decoration-ink">
                    modifier sur la fiche formation
                  </a>
                </div>
                {templates.map((t) => (
                  <details key={t.id} className="border-t border-line py-2.5">
                    <summary className="cursor-pointer list-none text-[13px] text-ink font-medium">
                      {CATEGORY_LABELS[t.category] ?? t.category} — {t.title}
                    </summary>
                    <div className="mt-2.5 flex flex-col gap-2.5">
                      <TemplateEditor templateId={t.id} title={t.title} bodyText={t.bodyText} />
                      <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                    </div>
                  </details>
                ))}
              </div>
            ))}
          </div>
        )}

        <NewTemplateForm courses={courses} />
      </div>
    </div>
  );
}

// A cross-dossier, searchable view of every generated/uploaded document —
// distinct from the template library above. With an OFP running 300+
// learners a year, "find the convention I sent to this one apprenant" was
// previously only possible by opening their dossier one by one; this lets
// staff search by name/email and filter by category directly.
async function MyDocumentsTab({
  organizationId,
  role,
  userId,
  searchParams,
}: {
  organizationId: string;
  role: Role;
  userId: string;
  searchParams: { q?: string; category?: string; page?: string };
}) {
  const ownerFilter: Prisma.DocumentWhereInput = role === Role.TRAINER ? { dossier: { session: { trainerId: userId } } } : {};
  const q = searchParams.q?.trim();
  const category = searchParams.category;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const where: Prisma.DocumentWhereInput = {
    organizationId,
    dossierId: { not: null },
    ...ownerFilter,
    ...(category ? { category } : {}),
    ...(q
      ? {
          dossier: {
            contact: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        }
      : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { dossier: { include: { contact: true, session: { include: { course: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.document.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchInput placeholder="Rechercher un apprenant (nom, email)…" />
        <DocumentCategoryFilter />
        <div className="text-[12px] text-slate">{total} document{total > 1 ? "s" : ""}</div>
      </div>

      <div className="bg-white border border-line rounded-card">
        {documents.map((doc) => (
          <a
            key={doc.id}
            href={doc.bodyText ? `/api/documents/generated/${doc.id}` : doc.fileUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 hover:bg-[#EFEDE7]"
          >
            <Pill tone="neutral">{CATEGORY_LABELS[doc.category] ?? doc.category}</Pill>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium truncate">{doc.title}</div>
              {doc.dossier && (
                <div className="text-[11.5px] text-slate truncate">
                  {doc.dossier.contact.firstName} {doc.dossier.contact.lastName} — {doc.dossier.session.course.title}
                </div>
              )}
            </div>
            <div className="text-[11px] text-slate shrink-0">
              {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
            </div>
          </a>
        ))}
        {documents.length === 0 && (
          <div className="px-4 py-6 text-[12.5px] text-slate text-center">
            {q || category ? "Aucun document ne correspond à cette recherche." : "Aucun document généré pour le moment."}
          </div>
        )}
      </div>

      <Pagination basePath="/documents" searchParams={{ tab: "mes-documents", q, category, page: searchParams.page }} page={page} totalPages={totalPages} />
    </div>
  );
}
