import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { STARTER_TEMPLATE_NOTICE } from "@/../prisma/lib/starter-templates";
import { CATEGORY_LABELS, categoryLabelIsRedundant } from "@/lib/documentCategories";
import { AdaptTemplateDialog } from "@/components/AdaptTemplateDialog";
import { OrganizationContractPolicyForm } from "@/components/OrganizationContractPolicyForm";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { GenerateDocumentButton } from "@/components/GenerateDocumentButton";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { DocumentCategoryFilter } from "@/components/DocumentCategoryFilter";
import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";
import { parseConditions, collectQuestionKeys } from "@/lib/documentAssembly";
import { QUESTION_BY_KEY } from "@/lib/documentQuestionnaire";
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

// The questions this template's blocks actually branch on — what the
// AdaptTemplateDialog asks before assembling (plain serializable objects,
// safe to pass into a client component).
function questionDefsOf(t: { blocks: { bodyText: string; conditions: unknown; order?: number }[] }) {
  return collectQuestionKeys(t.blocks.map((b, i) => ({ order: b.order ?? i, bodyText: b.bodyText, conditions: b.conditions }))).map(
    (k) => QUESTION_BY_KEY[k],
  );
}


export default async function BibliothequePage(props: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "toolkit") === "none") redirect("/documents");

  // Les modèles servent à FABRIQUER des documents ; ils ne s'envoient pas.
  // Les séparer de l'espace Documents évite la confusion qui régnait quand
  // les deux cohabitaient dans les mêmes onglets — « mon contrat » pouvait
  // désigner le modèle ou l'exemplaire signé de M. Benali.
  const TABS = [
    { key: "modeles", label: "Mes modèles" },
    ...(role === Role.ADMIN_OF ? [{ key: "reglages", label: "Réglages des contrats" }] : []),
  ];
  const activeTab = searchParams.tab ?? "modeles";
  if (activeTab === "reglages" && role !== Role.ADMIN_OF) redirect("/documents/bibliotheque");

  return (
    <>
      <PageHeader
        title="Ma bibliothèque"
        subtitle="Vos modèles et ceux de Jalon. Un modèle sert à créer un document — il ne s'envoie pas directement."
        action={
          <a
            href="/documents"
            className="inline-flex items-center gap-1.5 border border-line bg-white text-ink text-[13px] font-medium rounded-md px-3.5 py-2 hover:bg-pebble"
          >
            ← Retour à mes documents
          </a>
        }
      />
      <Tabs basePath="/documents/bibliotheque" tabs={TABS} active={activeTab} />
      {activeTab === "reglages" ? (
        <ContractSettingsTab organizationId={organizationId} />
      ) : (
        <TemplatesTab organizationId={organizationId} query={searchParams.q} />
      )}
    </>
  );
}

async function ContractSettingsTab({ organizationId }: { organizationId: string }) {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-1">Clauses et politiques contractuelles</div>
        <div className="text-[11.5px] text-slate mb-3">
          Réglages repris automatiquement dans les contrats générés depuis les modèles ci-contre et dans l&apos;accès
          à la formation en ligne pendant le délai de rétractation d&apos;un apprenant.
        </div>
        <OrganizationContractPolicyForm
          initial={{
            withdrawalAccessPolicy: organization.withdrawalAccessPolicy,
            cancellationFeePercent: organization.cancellationFeePercent,
            regionPrefecture: organization.regionPrefecture ?? "",
            mediatorName: organization.mediatorName ?? "",
            mediatorContact: organization.mediatorContact ?? "",
          }}
        />
      </div>
    </div>
  );
}

async function TemplatesTab({ organizationId, query }: { organizationId: string; query?: string }) {
  // Plus de chargement des dossiers ici : « Générer pour un dossier » les
  // cherche à la frappe (voir GenerateDocumentButton / DossierSearchSelect).
  // Cette page en chargeait 8 000 avec leurs contacts et leurs formations à
  // chaque ouverture, pour remplir un menu qu'on n'ouvre presque jamais.
  const [globalTemplates, orgTemplates, courses] = await Promise.all([
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
    prisma.course.findMany({ where: { organizationId, archivedAt: null }, orderBy: { title: "asc" } }),
  ]);

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
        <MetricCard label="Modèles fournis par Jalon" value={globalTemplates.length} hint="prêts à l'emploi, adaptables" />
        <MetricCard label="Modèles de votre organisme" value={orgTemplates.length} hint="adaptés ou créés par vous" />
        <MetricCard label="Modèles conditionnels" value={conditionalCount} hint="paragraphes ajustés selon le dossier" />
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
          {/* L'avertissement était autrefois préfixé au corps de chaque
              modèle, donc il partait dans le document envoyé — un prospect
              lisait « à faire relire par un juriste » en tête de son recueil
              des besoins. Il s'adresse à l'organisme : sa place est ici, au
              moment où il consulte et adapte, pas dans ce qu'il envoie. */}
          <div className="text-[11.5px] text-slate leading-relaxed mb-1.5">
            {STARTER_TEMPLATE_NOTICE} Cet avertissement ne figure jamais dans les documents générés.
          </div>
          <div className="bg-white border border-line rounded-card">
            {visibleGlobal.map((t) => {
              const fork = orgTemplates.find((o) => o.forkedFromId === t.id);
              return (
                <TemplateRowDetails
                  key={t.id}
                  template={t}
                  subtitle={fork ? "Déjà adapté — votre copie est dans « Documents généraux »" : undefined}
                  trailing={
                    <AdaptTemplateDialog
                      templateId={t.id}
                      title={t.title}
                      triggerLabel="Adapter ce modèle"
                      questions={questionDefsOf(t)}
                      isGlobal
                      fork={fork ? { id: fork.id, bodyText: fork.bodyText, blocks: toBlockRows(fork.blocks) } : null}
                      bodyText={t.bodyText}
                      blocks={toBlockRows(t.blocks)}
                    />
                  }
                >
                  <TemplateRowSummary template={t} />
                  <div className="mt-2.5">
                    <GenerateDocumentButton templateId={t.id} />
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
                trailing={
                  <AdaptTemplateDialog
                    templateId={t.id}
                    title={t.title}
                    triggerLabel="Utiliser ce modèle"
                    questions={questionDefsOf(t)}
                    isGlobal={false}
                    bodyText={t.bodyText}
                    blocks={toBlockRows(t.blocks)}
                  />
                }
              >
                <TemplateRowSummary template={t} />
                <div className="mt-2.5">
                  <GenerateDocumentButton templateId={t.id} />
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
                <TemplateRowDetails
                  key={t.id}
                  template={t}
                  trailing={
                    <AdaptTemplateDialog
                      templateId={t.id}
                      title={t.title}
                      triggerLabel="Utiliser ce modèle"
                      questions={questionDefsOf(t)}
                      isGlobal={false}
                      bodyText={t.bodyText}
                      blocks={toBlockRows(t.blocks)}
                    />
                  }
                >
                  <TemplateRowSummary template={t} />
                  <div className="mt-2.5">
                    <GenerateDocumentButton templateId={t.id} />
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
            {!categoryLabelIsRedundant(template.title, template.category) && (
              <Pill tone="neutral">{CATEGORY_LABELS[template.category] ?? template.category}</Pill>
            )}
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

// Client feedback: expanding a row used to dump every legal clause on
// screen — "je ne dois pas avoir le détail de toutes les clauses". The
// expansion now shows just enough to recognize the document; the full text,
// the questionnaire, the downloads and the legal editing all live in the
// AdaptTemplateDialog on the row's action button.
function TemplateRowSummary({ template }: { template: { bodyText: string; blocks: unknown[] } }) {
  if (template.blocks.length > 0) {
    const n = template.blocks.length;
    return (
      <div className="text-[11.5px] text-slate">
        {n} paragraphe{n > 1 ? "s" : ""} — le contenu s&apos;ajuste aux réponses (statut, modalité, financement…).
        Aperçu complet et téléchargement via le bouton à droite.
      </div>
    );
  }
  const excerpt = template.bodyText.length > 260 ? `${template.bodyText.slice(0, 260).trimEnd()}…` : template.bodyText;
  return <p className="text-[11.5px] text-slate leading-relaxed whitespace-pre-wrap">{excerpt}</p>;
}

// A cross-dossier, searchable view of every generated/uploaded document —
// distinct from the template library above. With an OFP running 300+
// learners a year, "find the convention I sent to this one apprenant" was
// previously only possible by opening their dossier one by one; this lets
// staff search by name/email and filter by category directly.
