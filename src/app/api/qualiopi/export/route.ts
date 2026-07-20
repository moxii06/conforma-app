import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Exports the audit-prep checklist as a plain-text summary. A real "evidence
// package" export (spec §5.6) would bundle the underlying documents
// themselves (zip/PDF) — this is a status report over the checklist state,
// useful on its own but not a replacement for that.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const [org, indicators, checklistItems, evidence] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    prisma.qualiopiIndicator.findMany({ orderBy: { number: "asc" } }),
    prisma.auditChecklistItem.findMany({ where: { organizationId: session.organizationId } }),
    prisma.qualiopiIndicatorEvidence.findMany({ where: { organizationId: session.organizationId } }),
  ]);

  const gatheredSet = new Set(checklistItems.filter((c) => c.gathered).map((c) => c.indicatorNumber));
  const evidenceSet = new Set(evidence.map((e) => e.indicatorNumber));

  const lines: string[] = [];
  lines.push(`Préparation audit Qualiopi — ${org.name}`);
  lines.push(`Généré le ${new Date().toLocaleDateString("fr-FR")}`);
  if (org.nextAuditDate) lines.push(`Prochain audit : ${org.nextAuditDate.toLocaleDateString("fr-FR")}`);
  lines.push("");

  let criterion = 0;
  for (const ind of indicators) {
    if (ind.criterionNumber !== criterion) {
      criterion = ind.criterionNumber;
      lines.push(`--- Critère ${criterion} ---`);
    }
    const gathered = gatheredSet.has(ind.number) ? "[x]" : "[ ]";
    const hasEvidence = evidenceSet.has(ind.number) ? " (preuve enregistrée)" : "";
    lines.push(`${gathered} Indicateur ${ind.number} — ${ind.label}${hasEvidence}`);
  }

  const body = lines.join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="qualiopi-preparation-audit-${org.id}.txt"`,
    },
  });
}
