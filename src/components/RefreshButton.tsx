"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCw } from "lucide-react";

// This widget's data comes from a Server Component render, not a live
// subscription — router.refresh() re-runs that render on the current URL
// without a full page reload, which is the closest thing to "refresh" a
// Server Component list has.
export function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setSpinning(true);
        router.refresh();
        setTimeout(() => setSpinning(false), 500);
      }}
      className="flex items-center gap-1 text-[11.5px] text-slate hover:text-ink shrink-0"
      title="Rafraîchir"
    >
      <RotateCw size={12} className={spinning ? "animate-spin" : ""} />
      Rafraîchir
    </button>
  );
}
