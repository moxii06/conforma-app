import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { computeBpfReport } from "@/lib/bpfReport";
import { LEARNER_CATEGORY_LABELS, FUNDING_ORIGIN_LABELS } from "@/lib/bpfCategories";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "bpf") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const report = await computeBpfReport(session.organizationId, Number.isFinite(year) ? year : new Date().getFullYear());

  const lines: string[] = [];
  lines.push(`Bilan Pédagogique et Financier — ${report.year}`);
  lines.push(`Généré le ${new Date().toLocaleDateString("fr-FR")}`);
  lines.push("");
  lines.push(`Apprenants : ${report.totalLearners}`);
  lines.push(`Heures stagiaires : ${report.totalHours.toFixed(1)}`);
  lines.push(`Chiffre d'affaires encaissé : ${(report.totalRevenueCents / 100).toFixed(2)} €`);
  lines.push("");
  lines.push("--- Par catégorie légale ---");
  for (const c of report.byCategory) {
    lines.push(`${LEARNER_CATEGORY_LABELS[c.category] ?? c.category}: ${c.learnerCount} apprenant(s), ${c.hours.toFixed(1)}h`);
  }
  lines.push("");
  lines.push("--- Par origine de financement ---");
  for (const f of report.byFunding) {
    lines.push(`${FUNDING_ORIGIN_LABELS[f.origin] ?? f.origin}: ${(f.amountCents / 100).toFixed(2)} €`);
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="bpf-${report.year}.txt"`,
    },
  });
}
