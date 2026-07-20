import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { AuditDateForm } from "@/components/AuditDateForm";
import { ChecklistToggle } from "@/components/ChecklistToggle";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const TABS = [
  { key: "indicateurs", label: "Indicateurs" },
  { key: "amelioration-continue", label: "Amélioration continue" },
  { key: "preparation-audit", label: "Préparation audit" },
];

const CRITERION_LABELS: Record<number, string> = {
  1: "Conditions d'information du public",
  2: "Identification des objectifs et adaptation des prestations",
  3: "Adaptation aux publics bénéficiaires",
  4: "Adéquation des moyens pédagogiques et techniques",
  5: "Qualification et développement des compétences des personnels",
  6: "Inscription dans l'environnement professionnel",
  7: "Recueil et prise en compte des appréciations",
};

export default async function QualiopiPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "qualiopi") === "none") redirect("/dashboard");
  const activeTab = searchParams.tab ?? "indicateurs";
  const canEdit = can(session.role, "qualiopi") === "full";

  return (
    <>
      <PageHeader title="Conformité Qualiopi" subtitle="Référentiel National Qualité — 7 critères, 32 indicateurs" />
      <Tabs basePath="/qualiopi" tabs={TABS} active={activeTab} />
      <div className="p-8">
        {activeTab === "amelioration-continue" ? (
          <ContinuousImprovementTab organizationId={session.organizationId} />
        ) : activeTab === "preparation-audit" ? (
          <AuditPrepTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : (
          <IndicatorsTab organizationId={session.organizationId} canEdit={canEdit} />
        )}
      </div>
    </>
  );
}

async function IndicatorsTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [org, indicators, evidence] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.qualiopiIndicator.findMany({ orderBy: { number: "asc" } }),
    prisma.qualiopiIndicatorEvidence.findMany({ where: { organizationId } }),
  ]);

  const coveredNumbers = new Set(evidence.map((e) => e.indicatorNumber));
  const criteria = Array.from({ length: 7 }, (_, i) => i + 1).map((num) => {
    const items = indicators.filter((ind) => ind.criterionNumber === num);
    const covered = items.filter((ind) => coveredNumbers.has(ind.number)).length;
    return { number: num, total: items.length, covered };
  });

  const totalCovered = criteria.reduce((sum, c) => sum + c.covered, 0);
  const totalIndicators = indicators.length || 32;
  const overallScore = totalIndicators ? Math.round((totalCovered / totalIndicators) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3.5">
        <MetricCard
          label="Score de conformité"
          value={`${overallScore}%`}
          hint={`${totalCovered}/${totalIndicators} indicateurs couverts`}
        />
        <div className="bg-white border border-line rounded-card p-4 flex-1">
          <div className="text-[12.5px] text-slate mb-2">Prochain audit</div>
          <div className="text-2xl font-display text-ink mb-2">
            {org.nextAuditDate ? format(org.nextAuditDate, "d MMMM yyyy", { locale: fr }) : "Non planifié"}
          </div>
          {canEdit && (
            <AuditDateForm initialDate={org.nextAuditDate ? org.nextAuditDate.toISOString().slice(0, 10) : null} />
          )}
        </div>
      </div>

      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-3.5">Progression par critère</div>
        {criteria.map((c) => {
          const pct = c.total ? Math.round((c.covered / c.total) * 100) : 0;
          return (
            <div key={c.number} className="py-2.5 border-t border-line first:border-t-0">
              <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                <div className="text-ink font-medium">
                  Critère {c.number} — {CRITERION_LABELS[c.number]}
                </div>
                <div className="text-slate">
                  {c.covered}/{c.total}
                </div>
              </div>
              <div className="h-1.5 bg-[#F1EFE8] rounded-full overflow-hidden">
                <div className="h-full bg-sage" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-3">Veille réglementaire</div>
        <div className="flex flex-col gap-3 text-[12.5px] text-ink">
          <div className="flex items-start gap-2.5">
            <Pill tone="warn">BPF</Pill>
            <div>
              Bilan Pédagogique et Financier (Cerfa n°10443) à déposer avant le <strong>30 avril</strong> chaque
              année.
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Pill tone="neutral">E-facturation</Pill>
            <div>
              Réception de factures électroniques obligatoire à partir du <strong>1er septembre 2026</strong> ;
              émission obligatoire pour les micro/petites entreprises à partir du{" "}
              <strong>1er septembre 2027</strong>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ContinuousImprovementTab({ organizationId }: { organizationId: string }) {
  const openItems = await prisma.nonConformity.findMany({
    where: { organizationId },
    orderBy: { dueDate: "asc" },
  });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">
        Réclamations, non-conformités et actions correctives
      </div>
      {openItems.map((item) => (
        <div key={item.id} className="flex items-center gap-3.5 py-3 border-t border-line first:border-t-0">
          <div className="flex-1">
            <div className="text-[13px] text-ink font-medium">{item.subject}</div>
            <div className="text-[11.5px] text-slate mt-0.5">
              {item.type} · {item.origin}
            </div>
          </div>
          <Pill tone={item.status === "resolved" ? "good" : "warn"}>{item.status}</Pill>
        </div>
      ))}
      {openItems.length === 0 && <div className="text-[12.5px] text-slate">Aucun élément enregistré.</div>}
    </div>
  );
}

async function AuditPrepTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [indicators, checklistItems] = await Promise.all([
    prisma.qualiopiIndicator.findMany({ orderBy: { number: "asc" } }),
    prisma.auditChecklistItem.findMany({ where: { organizationId } }),
  ]);

  const gatheredMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.gathered]));
  const gatheredCount = indicators.filter((ind) => gatheredMap.get(ind.number)).length;

  let currentCriterion = 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-slate">
          {gatheredCount}/{indicators.length} preuves rassemblées
        </div>
        <a
          href="/api/qualiopi/export"
          className="text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
        >
          Exporter la checklist
        </a>
      </div>
      <div className="bg-white border border-line rounded-card p-5">
        {indicators.map((ind) => {
          const showHeader = ind.criterionNumber !== currentCriterion;
          currentCriterion = ind.criterionNumber;
          return (
            <div key={ind.id}>
              {showHeader && (
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide pt-4 pb-1.5 first:pt-0">
                  Critère {ind.criterionNumber} — {CRITERION_LABELS[ind.criterionNumber]}
                </div>
              )}
              <div className="flex items-center gap-3 py-2 border-t border-line">
                {canEdit ? (
                  <ChecklistToggle indicatorNumber={ind.number} gathered={gatheredMap.get(ind.number) ?? false} />
                ) : (
                  <div
                    className={`w-4 h-4 rounded-sm border shrink-0 ${
                      gatheredMap.get(ind.number) ? "bg-sage border-sage" : "border-line"
                    }`}
                  />
                )}
                <div className="text-[12.5px] text-ink flex-1">
                  <span className="text-slate mr-1.5">#{ind.number}</span>
                  {ind.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
