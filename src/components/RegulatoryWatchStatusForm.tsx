"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegulatoryWatchStatusForm({
  itemId,
  status,
  decision,
  actionTaken,
  evidenceNote,
}: {
  itemId: string;
  status: string;
  decision: string | null;
  actionTaken: string | null;
  evidenceNote: string | null;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [decisionText, setDecisionText] = useState(decision ?? "");
  const [actionText, setActionText] = useState(actionTaken ?? "");
  const [evidenceText, setEvidenceText] = useState(evidenceNote ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/qualiopi/regulatory-watch/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus,
        decision: decisionText || undefined,
        actionTaken: actionText || undefined,
        evidenceNote: evidenceText || undefined,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
          <option value="identified">Identifié</option>
          <option value="decided">Décision prise</option>
          <option value="exploited">Exploité</option>
        </select>
        <button onClick={handleSave} disabled={saving} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer"}
        </button>
      </div>
      <input
        value={decisionText}
        onChange={(e) => setDecisionText(e.target.value)}
        placeholder="Décision prise"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={actionText}
        onChange={(e) => setActionText(e.target.value)}
        placeholder="Action concrète mise en œuvre"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={evidenceText}
        onChange={(e) => setEvidenceText(e.target.value)}
        placeholder="Preuve d'exploitation (ex. document mis à jour, module ajouté...)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
    </div>
  );
}
