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
// normally get set. Once a step is done and a matching document exists
// (Document.category mirrors these step keys 1-for-1), a "Voir le document"
// link opens it — a sibling of the toggle button, not nested inside it.
export function ParcoursStepToggle({
  dossierId,
  stepKey,
  label,
  done,
  documentHref,
}: {
  dossierId: string;
  stepKey: StepKey;
  label: string;
  done: boolean;
  documentHref?: string;
}) {
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
    <div className="flex items-center justify-between gap-2.5 py-2 border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        title={done ? "Marquer comme non fait" : "Marquer comme fait"}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:bg-[#F7F5F0] disabled:opacity-60 -my-2 py-2"
      >
        {done ? <CheckCircle2 size={16} className="text-sage" /> : <Circle size={16} className="text-[#B9B6AA]" />}
        <div className={`text-[13px] truncate ${done ? "text-ink" : "text-slate"}`}>{label}</div>
      </button>
      {done && documentHref && (
        <a
          href={documentHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-slate underline decoration-line hover:decoration-ink shrink-0"
        >
          Voir le document
        </a>
      )}
    </div>
  );
}
