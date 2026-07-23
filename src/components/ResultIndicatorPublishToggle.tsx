"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResultIndicatorPublishToggle({ indicatorId, published }: { indicatorId: string; published: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    await fetch(`/api/qualiopi/result-indicators/${indicatorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full disabled:opacity-60 ${
        published ? "bg-[#DEE5E0] text-sage" : "bg-[#E6E3DA] text-slate"
      }`}
    >
      {saving ? "…" : published ? "Publié" : "Non publié"}
    </button>
  );
}
