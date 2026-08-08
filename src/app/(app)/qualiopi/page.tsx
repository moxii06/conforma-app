import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard, FaqHelpLink } from "@/components/ui";
import {
  getAutomaticEvidence,
  getEvidenceGaps,
  diagnoseIndicators,
  censusByStatus,
  sortByUrgency,
} from "@/lib/qualiopiEvidence";
import { applicableIndicators, countApprenticeshipIndicators } from "@/lib/qualiopiScope";
import { QualiopiActionPlan } from "@/components/QualiopiActionPlan";
import { QualiopiCriteriaBreakdown } from "@/components/QualiopiCriteriaBreakdown";
import { ApprenticeshipScopeControl } from "@/components/ApprenticeshipScopeControl";
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
import { QualiopiCertificateForm } from "@/components/QualiopiCertificateForm";
import { QualiopiAuditForm } from "@/components/QualiopiAuditForm";
import { QualiopiFindingForm } from "@/components/QualiopiFindingForm";
import { QualiopiFindingActions } from "@/components/QualiopiFindingActions";
import { QualiopiAuditDeleteButton } from "@/components/QualiopiAuditDeleteButton";
import { LibraryPanel } from "@/components/LibraryPanel";
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
  { key: "audits", label: "Audits" },
  { key: "preparation-audit", label: "Préparation audit" },
  { key: "reforme", label: "Réforme 2026" },
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

export default async function QualiopiPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await requireSessionContext();
  if (can(session.role, "qualiopi") === "none") redirect("/dashboard");
  const activeTab = searchParams.tab ?? "indicateurs";
  const canEdit = can(session.role, "qualiopi") === "full";

  return (
    <>
      <PageHeader
        title="Conformité Qualiopi"
        subtitle="Référentiel National Qualité — 7 critères, 32 indicateurs"
        action={
          <div className="flex items-center gap-4">
            <FaqHelpLink anchor="qualiopi" />
            <LibraryPanel variant="button" label="Bibliothèque de documents" />
          </div>
        }
      />
      <Tabs basePath="/qualiopi" tabs={TABS} active={activeTab} />
      <div className="p-8">
        {activeTab === "amelioration-continue" ? (
          <ContinuousImprovementTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "audits" ? (
          <AuditsTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "preparation-audit" ? (
          <AuditPrepTab organizationId={session.organizationId} canEdit={canEdit} />
        ) : activeTab === "reforme" ? (
          <ReformeTab organizationId={session.organizationId} />
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
  const [org, allIndicators, checklistItems, versions, autoEvidence, evidenceGaps] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    activeVersion
      ? prisma.qualiopiIndicator.findMany({ where: { versionId: activeVersion.id }, orderBy: { number: "asc" } })
      : Promise.resolve([]),
    // QualiopiIndicatorEvidence n'est jamais écrit par aucun écran (seul le
    // jeu de démo le remplit) — la seule case que l'utilisateur coche
    // réellement est ChecklistToggle, sur l'onglet Préparation audit, qui
    // écrit AuditChecklistItem.gathered. Même source que ce que
    // AuditPrepTab affiche déjà, pour que le score et la checklist
    // racontent la même histoire.
    prisma.auditChecklistItem.findMany({ where: { organizationId } }),
    prisma.qualiopiReferentielVersion.findMany({ where: { status: { not: "archive" } }, orderBy: { createdAt: "asc" } }),
    getAutomaticEvidence(organizationId),
    getEvidenceGaps(organizationId),
  ]);

  // Un organisme sans apprentissage ne peut pas couvrir les indicateurs qui
  // lui sont réservés : les laisser au dénominateur plafonnait son score à
  // 27/32 sans qu'il puisse rien y faire.
  const indicators = applicableIndicators(allIndicators, org.deliversApprenticeship);
  const apprenticeshipCount = countApprenticeshipIndicators(allIndicators);

  const gatheredNumbers = new Set(checklistItems.filter((c) => c.gathered).map((c) => c.indicatorNumber));

  // Le diagnostic à trois états est calculé UNE fois et alimente les deux
  // lectures de la page : le plan d'action en haut (ce qui reste à faire) et
  // le détail par critère en bas (où en est chaque indicateur). Deux calculs
  // séparés, et l'organisme lirait deux verdicts pour la même ligne.
  const diagnoses = diagnoseIndicators(indicators, gatheredNumbers, autoEvidence, evidenceGaps);
  const census = censusByStatus(diagnoses);
  const todo = sortByUrgency(diagnoses.filter((d) => d.status !== "conforme"));

  const criteria = Array.from({ length: 7 }, (_, i) => i + 1).map((num) => ({
    number: num,
    label: CRITERION_LABELS[num],
    diagnoses: diagnoses.filter((d) => d.criterionNumber === num),
  }));

  const totalIndicators = indicators.length;
  // Compté sur les indicateurs APPLICABLES seulement, pas sur toutes les
  // cases cochées : un CFA qui repasse `deliversApprenticeship` à faux garde
  // des cases cochées sur des indicateurs désormais hors périmètre.
  const totalCovered = indicators.filter((ind) => gatheredNumbers.has(ind.number)).length;
  // Score volontairement INCHANGÉ : c'est le nombre de cases que
  // l'organisme a cochées lui-même, celui qu'imprime le dossier d'audit
  // (/api/qualiopi/export) et celui qu'affiche l'onglet Préparation audit.
  // Le recalculer sur les trois états ferait dire deux choses différentes au
  // même mot « score » selon l'écran, la veille d'un audit. L'état réel des
  // 32 indicateurs se lit maintenant dans le plan d'action, au-dessus.
  const overallScore = totalIndicators ? Math.round((totalCovered / totalIndicators) * 100) : 0;
  const autoCount = indicators.filter((ind) => (autoEvidence.get(ind.number)?.length ?? 0) > 0).length;
  const isAuditOverdue = Boolean(org.nextAuditDate && org.nextAuditDate < new Date());

  return (
    <div className="flex flex-col gap-6">
      <QualiopiActionPlan todo={todo} census={census} nextAuditDate={org.nextAuditDate} />

      <div className="flex gap-3.5">
        <MetricCard
          label="Score de conformité"
          value={`${overallScore}%`}
          hint={`${totalCovered}/${totalIndicators} preuves validées par vous · ${autoCount}/${totalIndicators} avec activité tracée automatiquement`}
          href="/qualiopi?tab=preparation-audit"
        />
        <div className="bg-white border border-line rounded-card p-4 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[12.5px] text-slate">Prochain audit</div>
            {isAuditOverdue && <Pill tone="danger">En retard</Pill>}
          </div>
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

      {canEdit && apprenticeshipCount > 0 && (
        <ApprenticeshipScopeControl current={org.deliversApprenticeship} affectedCount={apprenticeshipCount} />
      )}

      <QualiopiCriteriaBreakdown criteria={criteria} />

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
          <div className="flex items-start gap-2.5">
            <Pill tone="warn">RNQ</Pill>
            <div>
              Projet de décret portant le référentiel de 32 à 33 indicateurs, entrée en vigueur annoncée au{" "}
              <strong>1er novembre 2026</strong> — non publié au Journal officiel à ce jour.{" "}
              <Link href="/qualiopi?tab=reforme" className="font-medium underline decoration-line hover:decoration-ink">
                Voir ce qui change pour vous
              </Link>
              .
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

// Libellés du statut Complaint, alignés sur /support (même champ, même
// vocabulaire des deux côtés de l'app).
const COMPLAINT_STATUS_LABELS: Record<string, string> = { open: "Ouverte", investigating: "En cours d'examen", resolved: "Résolue" };
const COMPLAINT_STATUS_TONE: Record<string, "warn" | "good" | "danger"> = { open: "danger", investigating: "warn", resolved: "good" };

async function ContinuousImprovementTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [openItems, complaints, findings, risks, courses, stalledProgress] = await Promise.all([
    // NonConformity n'est alimenté par aucun formulaire (seul le jeu de
    // démo le remplit) : gardé ici uniquement parce que QualityRisk.
    // sourceNonConformityId pointe dessus par clé étrangère (section
    // Suggestions ci-dessous) — un changement de schéma hors périmètre de
    // ce correctif. Le registre affiché plus bas ne s'appuie plus dessus,
    // voir complaints/findings.
    prisma.nonConformity.findMany({ where: { organizationId }, orderBy: { dueDate: "asc" } }),
    prisma.complaint.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.qualiopiAuditFinding.findMany({
      where: { audit: { organizationId } },
      include: { audit: { select: { auditDate: true } } },
      orderBy: { audit: { auditDate: "desc" } },
    }),
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

  // Le registre affiché plus bas : les vraies réclamations (Complaint,
  // saisies depuis /support) et les vraies non-conformités (constats
  // d'audit certificateur, QualiopiAuditFinding, saisis depuis l'onglet
  // Audits) — pas la table NonConformity ci-dessus, que rien n'écrit.
  // L'action corrective d'un constat vit déjà sur le constat lui-même
  // (QualiopiAuditFinding.correctiveAction), affichée en détail sur
  // l'onglet Audits ; ici c'est la synthèse chronologique des deux sources.
  type RegisterItem = {
    id: string;
    at: Date;
    subject: string;
    meta: string;
    statusLabel: string;
    tone: "warn" | "good" | "danger" | "neutral";
  };
  const registerItems: RegisterItem[] = [
    ...complaints.map(
      (c): RegisterItem => ({
        id: `complaint-${c.id}`,
        at: c.createdAt,
        subject: c.subject,
        meta: `Réclamation · ${new Date(c.createdAt).toLocaleDateString("fr-FR")}`,
        statusLabel: COMPLAINT_STATUS_LABELS[c.status] ?? c.status,
        tone: COMPLAINT_STATUS_TONE[c.status] ?? "warn",
      })
    ),
    ...findings.map(
      (f): RegisterItem => ({
        id: `finding-${f.id}`,
        at: f.audit.auditDate,
        subject: `Indicateur ${f.indicatorNumber} — ${f.description}`,
        meta: `Non-conformité ${f.severity} · audit du ${new Date(f.audit.auditDate).toLocaleDateString("fr-FR")}${
          f.correctiveAction ? ` · Action corrective : ${f.correctiveAction}` : ""
        }`,
        statusLabel: FINDING_STATUS[f.status]?.label ?? f.status,
        tone: FINDING_STATUS[f.status]?.tone ?? "warn",
      })
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

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
        {registerItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3.5 py-3 border-t border-line first:border-t-0">
            <div className="flex-1">
              <div className="text-[13px] text-ink font-medium">{item.subject}</div>
              <div className="text-[11.5px] text-slate mt-0.5">{item.meta}</div>
            </div>
            <Pill tone={item.tone}>{item.statusLabel}</Pill>
          </div>
        ))}
        {registerItems.length === 0 && <div className="text-[12.5px] text-slate">Aucun élément enregistré.</div>}
      </div>
    </div>
  );
}

async function AuditPrepTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const activeVersion = await getActiveVersion(organizationId);
  const [org, allIndicators, checklistItems, autoEvidence] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    activeVersion
      ? prisma.qualiopiIndicator.findMany({ where: { versionId: activeVersion.id }, orderBy: { number: "asc" } })
      : Promise.resolve([]),
    prisma.auditChecklistItem.findMany({ where: { organizationId } }),
    getAutomaticEvidence(organizationId),
  ]);
  // Même filtre que l'onglet Indicateurs : cocher « préparé » sur un
  // indicateur qui ne concerne pas l'organisme n'a pas de sens, et le
  // compteur doit raconter la même histoire des deux côtés.
  const indicators = applicableIndicators(allIndicators, org.deliversApprenticeship);
  const hiddenCount = allIndicators.length - indicators.length;

  const gatheredMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.gathered]));
  const summaryMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.personalizedSummary]));
  const gatheredCount = indicators.filter((ind) => gatheredMap.get(ind.number)).length;
  const autoCount = indicators.filter((ind) => (autoEvidence.get(ind.number)?.length ?? 0) > 0).length;

  let currentCriterion = 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[13px] text-slate">
          {gatheredCount}/{indicators.length} preuves validées par vous · {autoCount}/{indicators.length} avec activité
          tracée automatiquement
          {hiddenCount > 0 && (
            <span className="text-[11.5px]">
              {" "}
              · {hiddenCount} indicateurs apprentissage masqués
            </span>
          )}
        </div>
        <a
          href="/api/qualiopi/export"
          className="text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
        >
          Télécharger le dossier de préparation audit (PDF)
        </a>
      </div>
      <div className="text-[11.5px] text-slate bg-linen border border-line rounded-md p-2.5">
        L&apos;activité tracée (en vert sous chaque indicateur) est produite automatiquement par votre travail réel dans
        Jalon — c&apos;est une matière première de preuve, pas une garantie de conformité : sa pertinence reste à votre
        appréciation et à celle de l&apos;auditeur. Cochez un indicateur quand vous jugez son dossier prêt.
      </div>
      <div className="bg-white border border-line rounded-card p-5">
        {indicators.map((ind) => {
          const showHeader = ind.criterionNumber !== currentCriterion;
          currentCriterion = ind.criterionNumber;
          return (
            // L'ancre est la cible de « Voir comment corriger → » depuis le
            // plan d'action et le détail par critère : elle amène l'organisme
            // sur SON indicateur, résumé personnalisé compris, plutôt qu'en
            // haut d'une liste de 32 lignes. scroll-mt dégage la barre
            // d'onglets, sinon la ligne visée finit dessous.
            <div key={ind.id} id={`indicateur-${ind.number}`} className="scroll-mt-24">
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
                  {/* Sans ce repère, un OF qui ne fait pas d'apprentissage
                      croit avoir cinq trous de conformité qu'il ne peut pas
                      combler — ces indicateurs ne le concernent pas. */}
                  {ind.scope === "apprentissage" && (
                    <span className="text-[10.5px] text-slate ml-2">— apprentissage uniquement</span>
                  )}
                </div>
              </div>
              {(autoEvidence.get(ind.number)?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pl-7 pb-1.5">
                  {autoEvidence.get(ind.number)!.map((e, i) => (
                    <Link key={i} href={e.href} className="text-[11px] text-sage hover:underline">
                      ✓ {e.count} {e.label}
                    </Link>
                  ))}
                </div>
              )}
              <IndicatorSummaryButton indicatorNumber={ind.number} initialSummary={summaryMap.get(ind.number) ?? null} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * « Ce qui change au 1er novembre 2026 », lisible sans basculer son
 * référentiel actif sur un projet de texte — ce qui fausserait la
 * préparation d'audit en cours. La liste ne montre que les indicateurs
 * réellement touchés : sur 33, en lire 12 est faisable un vendredi soir,
 * en relire 33 ne l'est pas.
 *
 * Chaque ligne est confrontée à l'activité déjà tracée dans Jalon
 * (qualiopiEvidence.ts), calculée sur les données réelles de
 * l'organisation. C'est ce qui transforme une note de veille en plan de
 * travail : « l'indicateur 12 évolue » ne dit rien, « l'indicateur 12
 * évolue et vous n'avez aucune trace dessus » dit quoi faire.
 */
async function ReformeTab({ organizationId }: { organizationId: string }) {
  const [version, autoEvidence] = await Promise.all([
    prisma.qualiopiReferentielVersion.findUnique({
      where: { id: "rnq2026-reforme-projet" },
      include: { indicators: { orderBy: { number: "asc" } } },
    }),
    getAutomaticEvidence(organizationId),
  ]);

  if (!version) {
    return (
      <div className="text-[12.5px] text-slate">
        Le projet de référentiel n&apos;est pas chargé sur cette instance.
      </div>
    );
  }

  const changed = version.indicators.filter((ind) => ind.changeNote);
  const daysLeft = version.applicableFrom
    ? Math.ceil((version.applicableFrom.getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#EDDFC6] rounded-card px-4 py-3 text-[12.5px] text-seal-dark leading-relaxed">
        <strong>Texte non publié au Journal officiel.</strong>{" "}Le référentiel applicable reste celui du décret
        n° 2019-565 du 6 juin 2019, avec ses 32 indicateurs. Ce qui suit reconstitue le projet de décret
        NOR TRSD2609875D à partir d&apos;analyses publiques concordantes, pour vous laisser prendre de
        l&apos;avance — pas pour servir de référence en audit. Les libellés officiels devront être repris à la
        publication.
      </div>

      <div className="flex gap-3.5">
        <MetricCard
          label="Entrée en vigueur annoncée"
          value="1er nov. 2026"
          hint={daysLeft != null && daysLeft > 0 ? `dans ${daysLeft} jours` : undefined}
          tone={daysLeft != null && daysLeft <= 90 ? "danger" : "ink"}
        />
        <MetricCard label="Indicateurs" value="32 → 33" hint="un nouvel indicateur, apprentissage" />
        <MetricCard label="Indicateurs touchés" value={changed.length} hint="à préparer" />
      </div>

      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-1">Ce qui change, indicateur par indicateur</div>
        <div className="text-[11.5px] text-slate mb-3.5">
          Les {version.indicators.length - changed.length} autres indicateurs sont repris sans modification de
          portée. En vert : ce que votre activité dans Jalon produit déjà comme matière de preuve sur cet
          indicateur.
        </div>
        {changed.map((ind) => {
          const evidence = autoEvidence.get(ind.number) ?? [];
          const isNew = ind.number === 33;
          return (
            <div key={ind.id} className="py-3.5 border-t border-line first:border-t-0">
              <div className="flex items-start gap-2.5 flex-wrap">
                <span className="text-[12px] text-slate tabular-nums mt-0.5">#{ind.number}</span>
                <span className="text-[13px] font-semibold text-ink flex-1 min-w-[12rem]">{ind.label}</span>
                {isNew && <Pill tone="warn">Nouveau</Pill>}
                {ind.scope === "apprentissage" && <Pill tone="neutral">Apprentissage</Pill>}
              </div>
              <div className="text-[11.5px] text-slate mt-0.5">
                Critère {ind.criterionNumber} — {CRITERION_LABELS[ind.criterionNumber]}
              </div>
              <div className="text-[12.5px] text-ink leading-relaxed mt-2">{ind.changeNote}</div>
              {evidence.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {evidence.map((e, i) => (
                    <Link key={i} href={e.href} className="text-[11px] text-sage hover:underline">
                      ✓ {e.count} {e.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate mt-2">
                  Aucune activité tracée sur cet indicateur pour l&apos;instant.
                </div>
              )}
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

const AUDIT_TYPE_LABELS: Record<string, string> = {
  initial: "Audit initial",
  surveillance: "Audit de surveillance",
  renouvellement: "Audit de renouvellement",
  complementaire: "Audit complémentaire",
};

const FINDING_STATUS: Record<string, { label: string; tone: "warn" | "neutral" | "good" }> = {
  ouverte: { label: "À traiter", tone: "warn" },
  levee: { label: "Écart levé — à solder à l'audit suivant", tone: "neutral" },
  soldee: { label: "Soldée", tone: "good" },
};

// L'historique réel des audits de certification, modelé sur les documents
// certificateurs (synthèse d'audit + fiches "Demande d'amélioration") pour
// que l'OF puisse les recopier champ à champ le jour où il les reçoit —
// et retrouver en un endroit ce qu'un auditeur de surveillance demandera
// en premier : "montrez-moi les écarts du dernier audit et ce que vous en
// avez fait".
async function AuditsTab({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const [org, audits] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.qualiopiAudit.findMany({
      where: { organizationId },
      include: { findings: { orderBy: { indicatorNumber: "asc" } } },
      orderBy: { auditDate: "desc" },
    }),
  ]);

  const now = Date.now();
  const expiresInDays = org.qualiopiCertificateUntil
    ? Math.ceil((org.qualiopiCertificateUntil.getTime() - now) / 86_400_000)
    : null;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="bg-white border border-line rounded-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Certificat Qualiopi</div>
          {expiresInDays != null &&
            (expiresInDays < 0 ? (
              <Pill tone="danger">Expiré</Pill>
            ) : expiresInDays <= 180 ? (
              <Pill tone="warn">Expire dans {expiresInDays} j — planifier le renouvellement</Pill>
            ) : (
              <Pill tone="good">Valide</Pill>
            ))}
        </div>
        {org.qualiopiCertificateNumber ? (
          <div className="mt-2 text-[12.5px] text-ink">
            <span className="font-medium">{org.qualiopiCertificateNumber}</span>
            {org.qualiopiCertifier && <span className="text-slate"> — {org.qualiopiCertifier}</span>}
            <div className="text-[11.5px] text-slate mt-0.5">
              {org.qualiopiCertifiedSince && `Certifié depuis le ${format(org.qualiopiCertifiedSince, "d MMMM yyyy", { locale: fr })}`}
              {org.qualiopiCertificateUntil && ` · valide jusqu'au ${format(org.qualiopiCertificateUntil, "d MMMM yyyy", { locale: fr })}`}
            </div>
            {org.qualiopiCategories && <div className="text-[11.5px] text-slate mt-0.5">Catégories : {org.qualiopiCategories}</div>}
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-slate">
            Renseignez les informations de votre certificat (numéro, validité) pour activer les alertes d&apos;échéance.
          </div>
        )}
        {canEdit && (
          <div className="mt-2">
            <QualiopiCertificateForm
              initial={{
                qualiopiCertificateNumber: org.qualiopiCertificateNumber,
                qualiopiCertifier: org.qualiopiCertifier,
                qualiopiCertifiedSince: org.qualiopiCertifiedSince ? org.qualiopiCertifiedSince.toISOString().slice(0, 10) : null,
                qualiopiCertificateUntil: org.qualiopiCertificateUntil ? org.qualiopiCertificateUntil.toISOString().slice(0, 10) : null,
                qualiopiCategories: org.qualiopiCategories,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
          Historique des audits ({audits.length})
        </div>
        {canEdit && <QualiopiAuditForm />}
      </div>

      {audits.length === 0 && (
        <div className="bg-white border border-line rounded-card p-6 text-center text-[12.5px] text-slate">
          Aucun audit enregistré pour l&apos;instant. Enregistrez votre audit initial et ses éventuelles
          non-conformités : c&apos;est la première chose qu&apos;un auditeur de surveillance demandera.
        </div>
      )}

      {audits.map((audit) => {
        const majCount = audit.findings.filter((f) => f.severity === "majeure").length;
        const minCount = audit.findings.filter((f) => f.severity === "mineure").length;
        const openCount = audit.findings.filter((f) => f.status !== "soldee").length;
        return (
          <div key={audit.id} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[13.5px] font-medium text-ink">{AUDIT_TYPE_LABELS[audit.type] ?? audit.type}</span>
                <span className="text-[12px] text-slate">{format(audit.auditDate, "d MMMM yyyy", { locale: fr })}</span>
                {audit.findings.length === 0 ? (
                  <Pill tone="good">Aucune non-conformité</Pill>
                ) : (
                  <Pill tone={openCount > 0 ? "warn" : "good"}>
                    {majCount > 0 && `${majCount} NC majeure${majCount > 1 ? "s" : ""}`}
                    {majCount > 0 && minCount > 0 && " · "}
                    {minCount > 0 && `${minCount} NC mineure${minCount > 1 ? "s" : ""}`}
                    {openCount === 0 && " — toutes soldées"}
                  </Pill>
                )}
              </div>
              {canEdit && (
                <QualiopiAuditDeleteButton
                  auditId={audit.id}
                  auditLabel={`${(AUDIT_TYPE_LABELS[audit.type] ?? audit.type).toLowerCase()} du ${format(audit.auditDate, "d MMMM yyyy", { locale: fr })}`}
                />
              )}
            </div>

            <div className="text-[11.5px] text-slate">
              {audit.certifierName}
              {audit.auditorName && ` · Auditeur : ${audit.auditorName}`}
              {audit.durationDays != null && ` · ${audit.durationDays} jour${audit.durationDays > 1 ? "s" : ""}`}
              {audit.remote && " · à distance"}
            </div>

            {audit.conclusions && <div className="text-[12px] text-ink bg-linen border border-line rounded-md p-2.5">{audit.conclusions}</div>}

            {audit.nextAuditDate && (
              <div className="text-[11.5px] text-slate">
                Prochain audit annoncé : {audit.nextAuditType ? (AUDIT_TYPE_LABELS[audit.nextAuditType] ?? audit.nextAuditType).toLowerCase() : "type non précisé"}
                {" — "}
                {format(audit.nextAuditDate, "MMMM yyyy", { locale: fr })}
              </div>
            )}

            {audit.findings.length > 0 && (
              <div className="flex flex-col gap-2.5 border-t border-line pt-3">
                {audit.findings.map((f) => (
                  <div key={f.id} className="border border-line rounded-md p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-ink">Indicateur {f.indicatorNumber}</span>
                      <Pill tone={f.severity === "majeure" ? "danger" : "warn"}>NC {f.severity}</Pill>
                      <Pill tone={FINDING_STATUS[f.status]?.tone ?? "neutral"}>{FINDING_STATUS[f.status]?.label ?? f.status}</Pill>
                    </div>
                    <div className="text-[12px] text-ink">{f.description}</div>
                    {(f.immediateAction || f.rootCause || f.correctiveAction) && (
                      <div className="text-[11.5px] text-slate flex flex-col gap-0.5">
                        {f.immediateAction && <div>Action immédiate : {f.immediateAction}</div>}
                        {f.rootCause && <div>Causes : {f.rootCause}</div>}
                        {f.correctiveAction && (
                          <div>
                            Action corrective : {f.correctiveAction}
                            {f.implementedAt && ` (mise en œuvre le ${format(f.implementedAt, "d/MM/yyyy")})`}
                          </div>
                        )}
                      </div>
                    )}
                    {(f.liftedAt || f.closedAt) && (
                      <div className="text-[11px] text-slate">
                        {f.liftedAt && `Écart levé le ${format(f.liftedAt, "d/MM/yyyy")}`}
                        {f.closedAt && ` · soldé le ${format(f.closedAt, "d/MM/yyyy")}`}
                        {f.closureComment && ` — ${f.closureComment}`}
                      </div>
                    )}
                    {canEdit && (
                      <QualiopiFindingActions
                        findingId={f.id}
                        status={f.status}
                        indicatorNumber={f.indicatorNumber}
                        description={f.description}
                        correctiveAction={f.correctiveAction}
                        severity={f.severity}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && <QualiopiFindingForm auditId={audit.id} />}
          </div>
        );
      })}
    </div>
  );
}
