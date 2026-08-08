"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { SupportProofUpload } from "@/components/SupportProofUpload";

export function SecureReportStatusForm({
  reportId,
  status,
  escalationNotes,
  proofFileName,
  hasProof,
}: {
  reportId: string;
  status: string;
  escalationNotes: string | null;
  proofFileName: string | null;
  hasProof: boolean;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [notes, setNotes] = useState(escalationNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/secure-reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, escalationNotes: notes || undefined }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
          <option value="received">Reçu</option>
          <option value="under_review">En cours d&apos;examen</option>
          <option value="escalated">Escaladé</option>
          <option value="closed">Clos</option>
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes d'escalade / suivi"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
      {/* Comme pour une réclamation : la pièce justificative apparaît quand on
          clôt le signalement, et reste ensuite si un fichier est attaché. */}
      {(nextStatus === "closed" || hasProof) && (
        <SupportProofUpload kind="secure-reports" itemId={reportId} proofFileName={proofFileName} hasProof={hasProof} />
      )}
    </div>
  );
}
