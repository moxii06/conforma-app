"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PipelineStage } from "@prisma/client";

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Convention signée",
  SESSION_SCHEDULED: "Session planifiée",
  TO_INVOICE: "À facturer",
  INVOICED: "Facturé",
  PAID: "Payé",
};

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récent" },
  { value: "date_asc", label: "Plus ancien" },
  { value: "amount_desc", label: "Montant décroissant" },
  { value: "amount_asc", label: "Montant croissant" },
];

export function OpportunityFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stage = searchParams.get("stage") ?? "all";
  const sort = searchParams.get("sort") ?? "date_desc";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "date_desc") params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2.5">
      <select
        value={stage}
        onChange={(e) => update("stage", e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
      >
        <option value="all">Toutes les étapes</option>
        {Object.entries(STAGE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => update("sort", e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
