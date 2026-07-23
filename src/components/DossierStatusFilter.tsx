"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Client feedback: "il faut que je puisse filtrer par état d'avancement des
// apprenants (devis envoyé, convocation etc)" — a dossier only exists once
// enrolled (the CRM's "devis envoyé" stage is upstream of that), so this
// filters by which step of the Parcours de formation checklist is still
// outstanding, matching the vocabulary already used in the dashboard's À
// faire tasks (dossier_prep_needs_assessment etc., see dashboardTasks.ts).
export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "needs_assessment_missing", label: "Recueil des besoins manquant" },
  { value: "contract_missing", label: "Convention non signée" },
  { value: "convocation_missing", label: "Convocation à envoyer" },
  { value: "eval_hot_missing", label: "Évaluation à chaud manquante" },
  { value: "eval_cold_missing", label: "Évaluation à froid manquante" },
];

export function DossierStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("status");
    else params.set("status", value);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={status}
      onChange={(e) => update(e.target.value)}
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
    >
      <option value="all">Toutes les étapes</option>
      {STATUS_FILTER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
