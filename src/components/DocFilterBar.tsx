"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DocStatus } from "@prisma/client";

const STATUS_LABELS: Record<DocStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  SIGNED: "Signé",
  PAID: "Payé",
  OVERDUE: "En retard",
};

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récent" },
  { value: "date_asc", label: "Plus ancien" },
  { value: "amount_desc", label: "Montant décroissant" },
  { value: "amount_asc", label: "Montant croissant" },
];

export function DocFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "date_desc";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "date_desc") params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Date inputs have no "all"/default sentinel value like the selects above
  // — an empty string IS the cleared state, so this just deletes on empty
  // rather than comparing against a magic default.
  function updateDate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2.5">
      <select
        value={status}
        onChange={(e) => update("status", e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
      >
        <option value="all">Tous les statuts</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={(e) => updateDate("from", e.target.value)}
          className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        />
        <span className="text-[12px] text-slate">au</span>
        <input
          type="date"
          value={to}
          onChange={(e) => updateDate("to", e.target.value)}
          className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        />
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("from");
            params.delete("to");
            const qs = params.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          }}
          className="text-[11.5px] text-slate hover:text-ink underline decoration-line"
        >
          Effacer les dates
        </button>
      )}
    </div>
  );
}
