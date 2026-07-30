import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { ForkTemplateButton } from "@/components/ForkTemplateButton";
import { TemplateEditor } from "@/components/TemplateEditor";
import { TemplateBlocksEditor } from "@/components/TemplateBlocksEditor";
import { ActivateBlocksButton } from "@/components/ActivateBlocksButton";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { GenerateDocumentButton } from "@/components/GenerateDocumentButton";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { DocumentCategoryFilter } from "@/components/DocumentCategoryFilter";
import { Pagination } from "@/components/Pagination";
import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";
import { parseConditions } from "@/lib/documentAssembly";
import type { BlockRow } from "@/components/TemplateBlocksEditor";
import { StopSummaryToggle } from "@/components/StopSummaryToggle";

type TemplateRow = {
  id: string;
  title: string;
  category: string;
  bodyText: string;
  forkedFromId: string | null;
  blocks: { bodyText: string; conditions: unknown }[];
};

function toBlockRows(blocks: { bodyText: string; conditions: unknown }[]): BlockRow[] {
  return blocks.map((b) => {
    const conditions = parseConditions(b.conditions);
    return { bodyText: b.bodyText, conditions: conditions.length > 0 ? conditions : null };
  });
}

const PAGE_SIZE = 30;

export default async function DocumentsPage(
  props: {
    searchParams: Promise<{ tab?: string; q?: string; category?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
        <TemplatesTab organizationId={organizationId} query={searchParams.q} />
      )}
    </>
  );
}

async function TemplatesTab({ organizationId, query }: { organizationId: string; query?: string }) {
  const [globalTemplates, orgTemplates, dossiers, courses] = await Promise.all([
    prisma.documentTemplate.findMany({
      where: { organizationId: null },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.documentTemplate.findMany({
      where: { organizationId },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
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

  const q = query?.trim().toLowerCase();
  const matches = (t: { title: string; category: string }) =>
    !q || t.title.toLowerCase().includes(q) || (CATEGORY_LABELS[t.category] ?? t.category).toLowerCase().includes(q);

  const visibleGlobal = globalTemplates.filter(matches);
  const visibleGeneral = generalOrgTemplates.filter(matches);
  const visibleByCourse = coursesWithTemplates
    .map((g) => ({ ...g, templates: g.templates.filter((t) => matches(t) || g.course.title.toLowerCase().includes(q ?? "")) }))
    .filter((g) => g.templates.length > 0);
  const nothingFound = q != null && q !== "" && visibleGlobal.length === 0 && visibleGeneral.length === 0 && visibleByCourse.length === 0;

  const conditionalCount = [...globalTemplates, ...orgTemplates].filter((t) => t.blocks.length > 0).length;

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl">
      <div className="flex gap-3.5">
        <MetricCard label="Modèles fournis par Jalon" value={String(globalTemplates.length)} hint="prêts à l'emploi, adaptables" />
        <MetricCard label="Modèles de votre organisme" value={String(orgTemplates.length)} hint="adaptés ou créés par vous" />
        <MetricCard label="Modèles conditionnels" value={String(conditionalCount)} hint="paragraphes ajustés selon le dossier" />
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchInput placeholder="Rechercher un modèle (titre, catégorie)…" />
        <div className="text-[12px] text-slate">
          {globalTemplates.length + orgTemplates.length} modèle{globalTemplates.length + orgTemplates.length > 1 ? "s" : ""}
        </div>
      </div>

      {nothingFound && (
        <div className="text-[12.5px] text-slate">Aucun modèle ne correspond à « {query} ».</div>
      )}

      {visibleGlobal.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="text-[13.5px] font-semibold text-ink mb-1">Modèles fournis par Jalon</div>
          <div className="bg-white border border-line rounded-card">
            {visibleGlobal.map((t) => {
              const alreadyForked = orgTemplates.some((o) => o.forkedFromId === t.id);
              return (
                <TemplateRowDetails
                  key={t.id}
                  template={t}
                  trailing={
                    alreadyForked ? <span className="text-[11.5px] text-sage">Déjà adapté ✓</span> : <ForkTemplateButton templateId={t.id} />
                  }
                >
                  {t.blocks.length > 0 ? (
                    <TemplateBlocksEditor templateId={t.id} initialBlocks={toBlockRows(t.blocks)} canEdit={false} />
                  ) : (
                    <pre className="whitespace-pre-wrap text-[12px] text-slate font-sans leading-relaxed">{t.bodyText}</pre>
                  )}
                  <div className="mt-2.5">
                    <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                  </div>
                </TemplateRowDetails>
              );
            })}
          </div>
        </section>
      )}

      {visibleGeneral.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="text-[13.5px] font-semibold text-ink mb-1">Documents généraux ({generalOrgTemplates.length})</div>
          <div className="bg-white border border-line rounded-card">
            {visibleGeneral.map((t) => (
              <TemplateRowDetails
                key={t.id}
                template={t}
                subtitle={t.forkedFromId ? "Adapté d'un modèle Jalon" : undefined}
              >
                <OrgTemplateBody template={t} />
                <div className="mt-2.5">
                  <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                </div>
              </TemplateRowDetails>
            ))}
          </div>
        </section>
      )}

      {visibleByCourse.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Bibliothèques par formation</div>
          {visibleByCourse.map(({ course, templates }) => (
            <div key={course.id} className="bg-white border border-line rounded-card overflow-hidden">
              <div className="px-4 py-3 bg-linen border-b border-line">
                <div className="text-[12.5px] font-semibold text-ink">{course.title}</div>
                <div className="text-[11px] text-slate mt-0.5">
                  {course.durationHours != null ? `${course.durationHours} h` : "Durée non renseignée"}
                  {" · "}
                  {course.priceCents != null
                    ? (course.priceCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
                    : "Prix non renseigné"}
                  {" — "}
                  <a href={`/formations/${course.id}?tab=documents`} className="underline decoration-line hover:decoration-ink">
                    modifier sur la fiche formation
                  </a>
                </div>
              </div>
              {templates.map((t) => (
                <TemplateRowDetails key={t.id} template={t}>
                  <OrgTemplateBody template={t} />
                  <div className="mt-2.5">
                    <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                  </div>
                </TemplateRowDetails>
              ))}
            </div>
          ))}
        </section>
      )}

      <NewTemplateForm courses={courses} />

      <details className="group text-[11.5px] text-slate">
        <summary className="cursor-pointer list-none flex items-center gap-1.5 font-medium text-ink w-fit">
          <ChevronRight size={13} className="transition-transform group-open:rotate-90 shrink-0" />
          Aide : champs de fusion disponibles
        </summary>
        <div className="mt-2 pl-[19px]">
          Les modèles fournis par Jalon sont des points de départ génériques — à faire relire par un juriste avant
          tout usage réel (voir le texte d&apos;avertissement inclus dans chaque modèle). Insérez ces champs dans le
          texte d&apos;un modèle pour qu&apos;ils soient remplacés automatiquement à la génération :{" "}
          {AVAILABLE_MERGE_FIELDS.map((f) => (
            <code key={f} className="inline-block bg-pebble rounded px-1 py-0.5 mr-1 mt-1 text-[10.5px]">{`{{${f}}}`}</code>
          ))}
        </div>
      </details>
    </div>
  );
}

// One template row, collapsed to a scannable title + badges by default —
// category and "conditionnel" (blocks-based) are visible without expanding,
// so browsing the library is a glance instead of a click per row. `<details>`
// stays the mechanism (no JS state needed for open/close); `group-open:`
// rotates the chevron and CSS alone handles the rest.
function TemplateRowDetails({
  template,
  trailing,
  subtitle,
  children,
}: {
  template: { id: string; title: string; category: string; blocks: unknown[] };
  trailing?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="cursor-pointer list-none flex items-center gap-2.5 px-4 py-3 hover:bg-linen">
        <ChevronRight size={13} className="text-slate transition-transform group-open:rotate-90 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-ink font-medium">{template.title}</span>
            <Pill tone="neutral">{CATEGORY_LABELS[template.category] ?? template.category}</Pill>
            {template.blocks.length > 0 && <Pill tone="good">Conditionnel</Pill>}
          </div>
          {subtitle && <div className="text-[11px] text-slate mt-0.5">{subtitle}</div>}
        </div>
        {trailing && (
          <div className="shrink-0">
            <StopSummaryToggle>{trailing}</StopSummaryToggle>
          </div>
        )}
      </summary>
      <div className="px-4 pb-3.5 pl-[calc(1rem+13px+10px)]">{children}</div>
    </details>
  );
}

// An org's own template: the flat editor for the common case, or the block
// editor once it has conditional paragraphs — plus, for a still-flat
// template, the one-way "activate" button that converts it (see
// ActivateBlocksButton's own comment for why this is safe/non-destructive).
function OrgTemplateBody({ template }: { template: { id: string; title: string; bodyText: string; blocks: { bodyText: string; conditions: unknown }[] } }) {
  if (template.blocks.length > 0) {
    return <TemplateBlocksEditor templateId={template.id} initialBlocks={toBlockRows(template.blocks)} canEdit />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <TemplateEditor templateId={template.id} title={template.title} bodyText={template.bodyText} />
      <ActivateBlocksButton templateId={template.id} bodyText={template.bodyText} />
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
            href={doc.bodyText ? `/api/documents/generated/${doc.id}` : `/api/documents/${doc.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 hover:bg-linen"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium truncate">{doc.title}</div>
              {doc.dossier && (
                <div className="text-[11.5px] text-slate truncate">
                  {doc.dossier.contact.firstName} {doc.dossier.contact.lastName} — {doc.dossier.session.course.title}
                </div>
              )}
            </div>
            <Pill tone="neutral">{CATEGORY_LABELS[doc.category] ?? doc.category}</Pill>
            <div className="text-[11px] text-slate shrink-0 w-[74px] text-right">
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
