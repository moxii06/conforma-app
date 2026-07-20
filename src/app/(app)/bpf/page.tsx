import { PageHeader, MetricCard } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { computeBpfReport } from "@/lib/bpfReport";
import { LEARNER_CATEGORY_LABELS, FUNDING_ORIGIN_LABELS } from "@/lib/bpfCategories";
import Link from "next/link";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default async function BpfPage({ searchParams }: { searchParams: { year?: string } }) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "bpf") === "none") redirect("/dashboard");

  const currentYear = new Date().getFullYear();
  const year = searchParams.year ? parseInt(searchParams.year, 10) : currentYear;
  const report = await computeBpfReport(organizationId, Number.isFinite(year) ? year : currentYear);

  return (
    <>
      <PageHeader title="Bilan pédagogique et financier" subtitle={`Année ${report.year} — Cerfa n°10443`} />
      <div className="p-8 flex flex-col gap-5 max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12.5px]">
            <Link href={`/bpf?year=${report.year - 1}`} className="text-slate hover:text-ink px-2 py-1">← {report.year - 1}</Link>
            <span className="text-ink font-medium">{report.year}</span>
            <Link href={`/bpf?year=${report.year + 1}`} className="text-slate hover:text-ink px-2 py-1">{report.year + 1} →</Link>
          </div>
          <a href={`/api/bpf/export?year=${report.year}`} className="text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Exporter
          </a>
        </div>

        <div className="flex gap-3.5">
          <MetricCard label="Apprenants" value={String(report.totalLearners)} />
          <MetricCard label="Heures stagiaires" value={report.totalHours.toFixed(1)} />
          <MetricCard label="Chiffre d'affaires encaissé" value={formatAmount(report.totalRevenueCents)} />
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Heures et effectifs par catégorie légale</div>
          <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
            <div className="flex-1">Catégorie</div>
            <div className="flex-1">Apprenants</div>
            <div className="flex-1">Heures</div>
          </div>
          {report.byCategory.map((c) => (
            <div key={c.category} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
              <div className="flex-1">{LEARNER_CATEGORY_LABELS[c.category] ?? c.category}</div>
              <div className="flex-1">{c.learnerCount}</div>
              <div className="flex-1">{c.hours.toFixed(1)}</div>
            </div>
          ))}
          {report.byCategory.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune donnée pour cette année.</div>}
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Chiffre d&apos;affaires par origine de financement</div>
          <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
            <div className="flex-1">Origine</div>
            <div className="flex-1">Montant</div>
          </div>
          {report.byFunding.map((f) => (
            <div key={f.origin} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
              <div className="flex-1">{FUNDING_ORIGIN_LABELS[f.origin] ?? f.origin}</div>
              <div className="flex-1">{formatAmount(f.amountCents)}</div>
            </div>
          ))}
          {report.byFunding.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune facture payée pour cette année.</div>}
        </div>

        <div className="text-[11.5px] text-slate">
          Calculé à partir des sessions, dossiers et factures existants — pas de ressaisie manuelle (spec §5.13). Un
          apprenant sans catégorie renseignée ou une facture sans origine de financement apparaissent sous « Non
          renseigné » ; complétez ces champs sur les dossiers et factures concernés pour un bilan exact.
        </div>
      </div>
    </>
  );
}
