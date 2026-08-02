"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function TrainerFilter({ trainers }: { trainers: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trainerId = searchParams.get("trainer") ?? "all";

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("trainer");
    else params.set("trainer", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={trainerId}
      onChange={(e) => update(e.target.value)}
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
    >
      <option value="all">Tous les intervenants</option>
      {trainers.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
