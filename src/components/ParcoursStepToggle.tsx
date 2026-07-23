"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";

const FIELD_BY_KEY = {
  needs_assessment: "needsAssessmentDone",
  contract: "contractSigned",
  convocation: "convocationSent",
  eval_hot: "evaluationHotDone",
  eval_cold: "evaluationColdDone",
} as const;

type StepKey = keyof typeof FIELD_BY_KEY;

// Client feedback: the Parcours de formation checklist was pure display —
// each step is normally set automatically (recueil form submitted, contrat
// acknowledged, convocation sent, etc.), but staff had no way to correct a
// mistake or record something that happened outside the platform. This
// makes each step directly clickable; the automatic paths remain how they
// normally get set.
export function ParcoursStepToggle({ dossierId, stepKey, label, done }: { dossierId: string; stepKey: StepKey; label: string; done: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    await fetch(`/api/dossiers/${dossierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [FIELD_BY_KEY[stepKey]]: !done }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title={done ? "Marquer comme non fait" : "Marquer comme fait"}
      className="flex items-center gap-2.5 py-2 border-t border-line first:border-t-0 w-full text-left hover:bg-[#F7F5F0] disabled:opacity-60"
    >
      {done ? <CheckCircle2 size={16} className="text-sage" /> : <Circle size={16} className="text-[#B9B6AA]" />}
      <div className={`text-[13px] ${done ? "text-ink" : "text-slate"}`}>{label}</div>
    </button>
  );
}
