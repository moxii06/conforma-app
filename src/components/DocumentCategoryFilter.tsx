"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";

export function DocumentCategoryFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "all";

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("category");
    else params.set("category", value);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={category}
      onChange={(e) => update(e.target.value)}
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
    >
      <option value="all">Toutes les catégories</option>
      {DOCUMENT_CATEGORIES.map((c) => (
        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
      ))}
    </select>
  );
}
