import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { getAutomaticEvidence } from "@/lib/qualiopiEvidence";

const CRITERION_LABELS: Record<number, string> = {
  1: "Conditions d'information du public",
  2: "Identification des objectifs et adaptation des prestations",
  3: "Adaptation aux publics bénéficiaires",
  4: "Adéquation des moyens pédagogiques et techniques",
  5: "Qualification et développement des compétences des personnels",
  6: "Inscription dans l'environnement professionnel",
  7: "Recueil et prise en compte des appréciations",
};
const RISK_STATUS_LABELS: Record<string, string> = {
  identifie: "Identifié",
  en_cours: "En cours",
  maitrise: "Maîtrisé",
  clos: "Clos",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Client feedback (audit UX) : le précédent export ne couvrait que la
// checklist de préparation (statut coché/non coché), en texte brut — pas
// un vrai document consolidé. Celui-ci compile en un seul PDF réel
// (htmlToPdf.ts, même moteur que les documents envoyés depuis un dossier)
// tout ce que /qualiopi affiche déjà en onglets séparés : indicateurs et
// leurs résumés personnalisés, registre des risques, indicateurs de
// résultats publiés, veille réglementaire récente. Ne bundle pas les
// fichiers sources eux-mêmes (conventions, convocations...) — un vrai
// export documentaire par dossier serait un chantier séparé — mais donne
// à l'OF un unique document à imprimer ou transmettre avant un audit,
// plutôt que de naviguer les cinq onglets un par un.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    include: { activeReferentielVersion: true },
  });

  const [indicators, checklistItems, evidence, risks, resultIndicators, watchItems, autoEvidence, audits] = await Promise.all([
    org.activeReferentielVersionId
      ? prisma.qualiopiIndicator.findMany({ where: { versionId: org.activeReferentielVersionId }, orderBy: { number: "asc" } })
      : Promise.resolve([]),
    prisma.auditChecklistItem.findMany({ where: { organizationId: session.organizationId } }),
    prisma.qualiopiIndicatorEvidence.findMany({ where: { organizationId: session.organizationId } }),
    prisma.qualityRisk.findMany({ where: { organizationId: session.organizationId, status: { not: "clos" } }, include: { course: true } }),
    prisma.resultIndicator.findMany({ where: { organizationId: session.organizationId, published: true }, include: { course: true } }),
    prisma.regulatoryWatch.findMany({ where: { organizationId: session.organizationId }, orderBy: { watchDate: "desc" }, take: 10 }),
    getAutomaticEvidence(session.organizationId),
    prisma.qualiopiAudit.findMany({
      where: { organizationId: session.organizationId },
      include: { findings: { orderBy: { indicatorNumber: "asc" } } },
      orderBy: { auditDate: "desc" },
    }),
  ]);

  const gatheredMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.gathered]));
  const summaryMap = new Map(checklistItems.map((c) => [c.indicatorNumber, c.personalizedSummary]));
  const evidenceByIndicator = new Map<number, string[]>();
  for (const e of evidence) {
    const list = evidenceByIndicator.get(e.indicatorNumber) ?? [];
    if (e.evidenceNote) list.push(e.evidenceNote);
    evidenceByIndicator.set(e.indicatorNumber, list);
  }
  const gatheredCount = indicators.filter((ind) => gatheredMap.get(ind.number)).length;

  const parts: string[] = [];
  parts.push(`<p><b>Organisme</b> : ${esc(org.name)}</p>`);
  parts.push(`<p><b>Généré le</b> : ${new Date().toLocaleDateString("fr-FR")}</p>`);
  if (org.nextAuditDate) parts.push(`<p><b>Prochain audit</b> : ${org.nextAuditDate.toLocaleDateString("fr-FR")}</p>`);
  if (org.activeReferentielVersion) parts.push(`<p><b>Référentiel</b> : ${esc(org.activeReferentielVersion.label)}</p>`);
  const autoCount = indicators.filter((ind) => (autoEvidence.get(ind.number)?.length ?? 0) > 0).length;
  parts.push(`<p><b>Preuves validées</b> : ${gatheredCount}/${indicators.length} — <b>Indicateurs avec activité tracée</b> : ${autoCount}/${indicators.length}</p>`);
  parts.push(
    `<p><i>L'« activité tracée » ci-dessous est générée automatiquement par l'utilisation réelle de la plateforme (horodatée et attribuée). Elle constitue une matière première de preuve dont la pertinence reste à l'appréciation de l'organisme et de l'auditeur.</i></p>`
  );
  parts.push(`<p><br></p>`);

  parts.push(`<p><b>INDICATEURS PAR CRITÈRE</b></p>`);
  let criterion = 0;
  for (const ind of indicators) {
    if (ind.criterionNumber !== criterion) {
      criterion = ind.criterionNumber;
      parts.push(`<p><br></p><p><b>Critère ${criterion} — ${esc(CRITERION_LABELS[criterion] ?? "")}</b></p>`);
    }
    const box = gatheredMap.get(ind.number) ? "[x]" : "[ ]";
    parts.push(`<p>${box} ${ind.number} — ${esc(ind.label)}</p>`);
    const summary = summaryMap.get(ind.number);
    if (summary) parts.push(`<p>&nbsp;&nbsp;&nbsp;${esc(summary)}</p>`);
    const notes = evidenceByIndicator.get(ind.number) ?? [];
    for (const note of notes) parts.push(`<p>&nbsp;&nbsp;&nbsp;Preuve : ${esc(note)}</p>`);
    const auto = autoEvidence.get(ind.number) ?? [];
    for (const a of auto) parts.push(`<p>&nbsp;&nbsp;&nbsp;Activité tracée : ${a.count} ${esc(a.label)}</p>`);
  }

  parts.push(`<p><br></p><p><b>AUDITS DE CERTIFICATION</b></p>`);
  if (audits.length === 0) parts.push(`<p>Aucun audit enregistré.</p>`);
  for (const a of audits) {
    const typeLabels: Record<string, string> = {
      initial: "Audit initial",
      surveillance: "Audit de surveillance",
      renouvellement: "Audit de renouvellement",
      complementaire: "Audit complémentaire",
    };
    parts.push(
      `<p>- ${typeLabels[a.type] ?? a.type} du ${new Date(a.auditDate).toLocaleDateString("fr-FR")} (${esc(a.certifierName)}) — ${a.findings.length === 0 ? "aucune non-conformité" : `${a.findings.length} non-conformité(s)`}</p>`
    );
    for (const f of a.findings) {
      const statusLabel = f.status === "soldee" ? "soldée" : f.status === "levee" ? "levée" : "à traiter";
      parts.push(`<p>&nbsp;&nbsp;&nbsp;Indicateur ${f.indicatorNumber} (NC ${esc(f.severity)}, ${statusLabel}) : ${esc(f.description)}</p>`);
    }
  }

  parts.push(`<p><br></p><p><b>REGISTRE DES RISQUES OUVERTS</b></p>`);
  if (risks.length === 0) parts.push(`<p>Aucun risque ouvert.</p>`);
  for (const r of risks) {
    parts.push(`<p>- ${esc(r.risk)} (${RISK_STATUS_LABELS[r.status] ?? r.status})${r.course ? ` — ${esc(r.course.title)}` : ""}</p>`);
  }

  parts.push(`<p><br></p><p><b>INDICATEURS DE RÉSULTATS PUBLIÉS</b></p>`);
  if (resultIndicators.length === 0) parts.push(`<p>Aucun indicateur publié.</p>`);
  for (const ind of resultIndicators) {
    const period = `${new Date(ind.periodStart).toLocaleDateString("fr-FR")} – ${new Date(ind.periodEnd).toLocaleDateString("fr-FR")}`;
    parts.push(`<p>- ${esc(ind.label)} : ${ind.computedValue != null ? `${ind.computedValue}%` : "—"} (${period}${ind.course ? `, ${esc(ind.course.title)}` : ""})</p>`);
  }

  parts.push(`<p><br></p><p><b>VEILLE RÉGLEMENTAIRE RÉCENTE</b></p>`);
  if (watchItems.length === 0) parts.push(`<p>Aucun élément de veille enregistré.</p>`);
  for (const w of watchItems) {
    parts.push(`<p>- ${esc(w.summary)} (${new Date(w.watchDate).toLocaleDateString("fr-FR")})</p>`);
  }

  const pdf = await generatePdfFromRichText(`Dossier de préparation audit — ${org.name}`, parts.join(""));

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossier-audit-qualiopi-${org.id}.pdf"`,
    },
  });
}
