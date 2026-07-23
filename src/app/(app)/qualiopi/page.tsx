import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { AuditDateForm } from "@/components/AuditDateForm";
import { ChecklistToggle } from "@/components/ChecklistToggle";
import { IndicatorSummaryButton } from "@/components/IndicatorSummaryButton";
import { ReferentielVersionSwitcher } from "@/components/ReferentielVersionSwitcher";
import { QualityRiskForm } from "@/components/QualityRiskForm";
import { QualityRiskStatusSelect } from "@/components/QualityRiskStatusSelect";
import { ResultIndicatorForm } from "@/components/ResultIndicatorForm";
import { ResultIndicatorPublishToggle } from "@/components/ResultIndicatorPublishToggle";
import { RegulatoryWatchForm } from "@/components/RegulatoryWatchForm";
import { RegulatoryWatchStatusForm } from "@/components/RegulatoryWatchStatusForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// Falls back to whatever is marked "applicable" if the org's pointer is
// somehow unset (shouldn't happen post-migration, but a fresh org row
// created outside the normal signup flow could still lack one).
async function getActiveVersion(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { activeReferentielVersion: true },
  });
  if (org.activeReferentielVersion) return org.activeReferentielVersion;
  const fallback = await prisma.qualiopiReferentielVersion.findFirst({ where: { status: "applicable" } });
  return fallback;
}

const TABS = [
  { key: "indicateurs", label: "Indicateurs" },
  { key: "resultats", label: "Indicateurs de résultats" },
  { key: "veille", label: "Veille réglementaire" },
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
          <ContinuousImprovementTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "preparation-audit" ? (
          <AuditPrepTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "resultats" ? (
          <ResultsTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "veille" ? (
          <RegulatoryWatchTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : (
          <IndicatorsTab organizationId={session.organizationId} canEdit={canEdit} />
        )}
      </div>
    </>
  );
}

async function IndicatorsTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const activeVersion = await getActiveVersion(organizationId);
  const [org, indicators, evidence, versions] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    activeVersion
      ? prisma.qualiopiIndicator.findMany({ where: { versionId: activeVersion.id }, orderBy: { number: "asc" } })
      : Promise.resolve([]),
    prisma.qualiopiIndicatorEvidence.findMany({ where: { organizationId } }),
    prisma.qualiopiReferentielVersion.findMany({ where: { status: { not: "archive" } }, orderBy: { createdAt: "asc" } }),
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

      <div className="bg-white border border-line rounded-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13.5px] font-semibold text-ink">Référentiel actif</div>
          <div className="text-[11.5px] text-slate mt-0.5">
            {activeVersion?.label ?? "Aucun référentiel sélectionné"}
            {activeVersion?.status === "projet" && " — texte non officiel, à titre de préparation uniquement"}
          </div>
        </div>
        {canEdit && activeVersion && (
          <ReferentielVersionSwitcher versions={versions} activeVersionId={activeVersion.id} />
        )}
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

const RISK_STATUS_TONE: Record<string, "warn" | "good" | "neutral" | "danger"> = {
  identifie: "danger",
  en_cours: "warn",
  maitrise: "good",
  clos: "neutral",
};
const RISK_STATUS_LABELS: Record<string, string> = {
  identifie: "Identifié",
  en_cours: "En cours",
  maitrise: "Maîtrisé",
  clos: "Clos",
};
const LEVEL_LABELS: Record<string, string> = { faible: "Faible", moyenne: "Moyenne", elevee: "Élevée" };

// A module stalled for 21+ days without being finished is a dropout signal
// worth surfacing as a candidate risk, not just a stat — real progress data
// from the LMS (see LmsModulePlayer), not a fabricated metric. Two or more
// stalled learners on the same course is the threshold for suggesting it,
// so a single person pausing mid-video doesn't trigger noise.
const STALL_THRESHOLD_DAYS = 21;
const STALL_MIN_COUNT = 2;

async function ContinuousImprovementTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [openItems, risks, courses, stalledProgress] = await Promise.all([
    prisma.nonConformity.findMany({ where: { organizationId }, orderBy: { dueDate: "asc" } }),
    prisma.qualityRisk.findMany({
      where: { organizationId },
      include: { course: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.elearningProgress.findMany({
      where: {
        module: { course: { organizationId } },
        percentComplete: { gt: 0, lt: 100 },
        lastEventAt: { lt: new Date(Date.now() - STALL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000) },
      },
      include: { module: { include: { course: true } } },
    }),
  ]);

  const linkedNonConformityIds = new Set(risks.map((r) => r.sourceNonConformityId).filter(Boolean));
  const unlinkedComplaints = openItems.filter((item) => item.status !== "resolved" && !linkedNonConformityIds.has(item.id));

  const stalledByCourse = new Map<string, { title: string; count: number }>();
  for (const p of stalledProgress) {
    const course = p.module.course;
    const entry = stalledByCourse.get(course.id) ?? { title: course.title, count: 0 };
    entry.count += 1;
    stalledByCourse.set(course.id, entry);
  }
  const linkedCourseIds = new Set(
    risks.filter((r) => r.origin === "resultat" && r.status !== "clos").map((r) => r.courseId).filter(Boolean)
  );
  const dropoutSuggestions = Array.from(stalledByCourse.entries())
    .filter(([courseId, v]) => v.count >= STALL_MIN_COUNT && !linkedCourseIds.has(courseId))
    .map(([courseId, v]) => ({ courseId, ...v }));

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (unlinkedComplaints.length > 0 || dropoutSuggestions.length > 0) && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Suggestions</div>
          <div className="flex flex-col gap-2.5">
            {unlinkedComplaints.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0">
                <div className="text-[12.5px] text-ink">
                  <span className="text-slate mr-1.5">Réclamation :</span>
                  {item.subject}
                </div>
                <QualityRiskForm
                  courses={courses}
                  prefill={{
                    risk: item.subject,
                    origin: "reclamation",
                    sourceNonConformityId: item.id,
                    triggerLabel: "Créer un risque →",
                  }}
                />
              </div>
            ))}
            {dropoutSuggestions.map((s) => (
              <div key={s.courseId} className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0">
                <div className="text-[12.5px] text-ink">
                  <span className="text-slate mr-1.5">Décrochage :</span>
                  {s.count} apprenant(s) bloqué(s) depuis {STALL_THRESHOLD_DAYS}+ jours sur « {s.title} »
                </div>
                <QualityRiskForm
                  courses={courses}
                  prefill={{
                    risk: `Risque de décrochage sur la formation « ${s.title} » — ${s.count} apprenant(s) sans progression depuis plus de ${STALL_THRESHOLD_DAYS} jours.`,
                    origin: "resultat",
                    courseId: s.courseId,
                    triggerLabel: "Créer un risque →",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-card p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[13.5px] font-semibold text-ink">Registre des risques</div>
          {canEdit && <QualityRiskForm courses={courses} />}
        </div>
        {risks.map((r) => (
          <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[13px] text-ink font-medium flex-1">{r.risk}</div>
              {canEdit ? (
                <QualityRiskStatusSelect riskId={r.id} status={r.status} />
              ) : (
                <Pill tone={RISK_STATUS_TONE[r.status] ?? "neutral"}>{RISK_STATUS_LABELS[r.status] ?? r.status}</Pill>
              )}
            </div>
            <div className="text-[11.5px] text-slate flex items-center gap-2 flex-wrap">
              {r.course && <span>{r.course.title}</span>}
              <span>Probabilité {LEVEL_LABELS[r.probability] ?? r.probability}</span>
              <span>·</span>
              <span>Gravité {LEVEL_LABELS[r.severity] ?? r.severity}</span>
              {r.ownerName && <span>· Responsable {r.ownerName}</span>}
              {r.dueDate && <span>· Échéance {new Date(r.dueDate).toLocaleDateString("fr-FR")}</span>}
            </div>
            {r.preventiveMeasure && (
              <div className="text-[11.5px] text-ink"><span className="text-slate">Prévention : </span>{r.preventiveMeasure}</div>
            )}
            {r.correctiveAction && (
              <div className="text-[11.5px] text-ink"><span className="text-slate">Correction : </span>{r.correctiveAction}</div>
            )}
          </div>
        ))}
        {risks.length === 0 && <div className="text-[12.5px] text-slate">Aucun risque enregistré.</div>}
      </div>

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
    </div>
  );
}

async function AuditPrepTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const activeVersion = await getActiveVersion(organizationId);
  const [indicators, checklistItems] = await Promise.all([
    activeVersion
      ? prisma.qualiopiIndicator.findMany({ where: { versionId: activeVersion.id }, orderBy: { number: "asc" } })
      : Promise.resolve([]),
    prisma.auditChecklistItem.findMany({ where: { organizationId } }),
  ]);

  const gatheredMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.gathered]));
  const summaryMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.personalizedSummary]));
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
              <IndicatorSummaryButton indicatorNumber={ind.number} initialSummary={summaryMap.get(ind.number) ?? null} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function ResultsTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [indicators, courses] = await Promise.all([
    prisma.resultIndicator.findMany({ where: { organizationId }, include: { course: true }, orderBy: { createdAt: "desc" } }),
    prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="text-[13.5px] font-semibold text-ink">Indicateurs de résultats</div>
          <div className="text-[11.5px] text-slate mt-0.5">
            Indicateur 2 du RNQ — chaque valeur est calculée à partir de données réelles, avec sa définition et sa
            méthode de calcul, plutôt qu'un chiffre isolé.
          </div>
        </div>
        {canEdit && <ResultIndicatorForm courses={courses} />}
      </div>
      {indicators.map((ind) => (
        <div key={ind.id} className="py-3.5 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] text-ink font-medium">{ind.label}</div>
              <div className="text-[11.5px] text-slate mt-0.5">{ind.definition}</div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-[20px] font-display text-ink">
                {ind.computedValue != null ? `${ind.computedValue}%` : "—"}
              </div>
              {canEdit && <ResultIndicatorPublishToggle indicatorId={ind.id} published={ind.published} />}
            </div>
          </div>
          <div className="text-[11.5px] text-slate flex items-center gap-2 flex-wrap">
            {ind.course && <span>{ind.course.title}</span>}
            <span>
              {new Date(ind.periodStart).toLocaleDateString("fr-FR")} – {new Date(ind.periodEnd).toLocaleDateString("fr-FR")}
            </span>
            <span>·</span>
            <span>
              {ind.respondents}/{ind.totalPopulation - ind.exclusions} répondants
              {ind.exclusions > 0 ? ` (${ind.exclusions} exclu${ind.exclusions > 1 ? "s" : ""})` : ""}
            </span>
          </div>
          <div className="text-[11px] text-slate italic">{ind.formula}</div>
        </div>
      ))}
      {indicators.length === 0 && <div className="text-[12.5px] text-slate">Aucun indicateur enregistré.</div>}
    </div>
  );
}

const WATCH_TYPE_LABELS: Record<string, string> = {
  legal: "Veille légale et réglementaire",
  metiers_competences: "Évolutions métiers et compétences",
  pedagogique_technologique: "Innovations pédagogiques et technologiques",
  reseaux_partenariats: "Réseaux professionnels et partenariats",
};
const WATCH_STATUS_LABELS: Record<string, string> = { identified: "Identifié", decided: "Décision prise", exploited: "Exploité" };
const WATCH_STATUS_TONE: Record<string, "warn" | "neutral" | "good"> = { identified: "warn", decided: "neutral", exploited: "good" };

async function RegulatoryWatchTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [items, courses] = await Promise.all([
    prisma.regulatoryWatch.findMany({
      where: { organizationId },
      include: { affectedCourses: true },
      orderBy: { watchDate: "desc" },
    }),
    prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Veille réglementaire (critère 6)</div>
        {canEdit && <RegulatoryWatchForm courses={courses} />}
      </div>
      <div className="text-[11.5px] text-slate mb-3.5">
        Chaque élément trace non seulement la source surveillée mais aussi la décision prise et, une fois mise en
        œuvre, la preuve de son exploitation réelle — pas seulement le fait d&apos;avoir consulté la source.
      </div>
      {items.map((item) => (
        <div key={item.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-slate">
              {WATCH_TYPE_LABELS[item.watchType] ?? item.watchType} · {new Date(item.watchDate).toLocaleDateString("fr-FR")} · {item.source}
            </div>
            <Pill tone={WATCH_STATUS_TONE[item.status] ?? "warn"}>{WATCH_STATUS_LABELS[item.status] ?? item.status}</Pill>
          </div>
          <div className="text-[12.5px] text-ink">{item.summary}</div>
          {item.affectedCourses.length > 0 && (
            <div className="text-[11.5px] text-slate">Formations concernées : {item.affectedCourses.map((c) => c.title).join(", ")}</div>
          )}
          {item.decision && <div className="text-[12.5px] text-ink"><span className="text-slate">Décision : </span>{item.decision}</div>}
          {item.actionTaken && <div className="text-[12.5px] text-ink"><span className="text-slate">Action : </span>{item.actionTaken}</div>}
          {item.exploitedAt && (
            <div className="text-[11.5px] text-sage">
              Exploité le {new Date(item.exploitedAt).toLocaleDateString("fr-FR")}
              {item.evidenceNote && ` — ${item.evidenceNote}`}
            </div>
          )}
          {canEdit && (
            <RegulatoryWatchStatusForm itemId={item.id} status={item.status} decision={item.decision} actionTaken={item.actionTaken} evidenceNote={item.evidenceNote} />
          )}
        </div>
      ))}
      {items.length === 0 && <div className="text-[12.5px] text-slate">Aucun élément de veille enregistré.</div>}
    </div>
  );
}
