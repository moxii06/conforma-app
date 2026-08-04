"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PipelineStage } from "@prisma/client";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/pipelineStages";

export function OpportunityStageSelect({ opportunityId, stage }: { opportunityId: string; stage: PipelineStage }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    await fetch(`/api/crm/opportunities/${opportunityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: e.target.value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={stage}
      onChange={handleChange}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink outline-none focus:border-seal disabled:opacity-60"
    >
      {STAGE_ORDER.map((value) => (
        <option key={value} value={value}>
          {STAGE_LABELS[value]}
        </option>
      ))}
    </select>
  );
}
