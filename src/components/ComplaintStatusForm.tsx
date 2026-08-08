"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { SupportProofUpload } from "@/components/SupportProofUpload";

export function ComplaintStatusForm({
  complaintId,
  status,
  resolutionNotes,
  subject,
  proofFileName,
  hasProof,
}: {
  complaintId: string;
  status: string;
  resolutionNotes: string | null;
  subject: string;
  proofFileName: string | null;
  hasProof: boolean;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [notes, setNotes] = useState(resolutionNotes ?? "");
  const [saving, setSaving] = useState(false);
  // Qualiopi indicators 31-32 want the loop "réclamation → action
  // d'amélioration" to actually close. Marking a complaint resolved is the
  // one moment staff has the full picture, so that's when we OFFER (never
  // auto-create — resolving a duplicate or a misunderstanding shouldn't
  // pollute the register) a one-click corrective action, same bridge as
  // the audit non-conformities (QualityRisk, origin "reclamation").
  const [offerAction, setOfferAction] = useState(false);
  const [actionCreated, setActionCreated] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/complaints/${complaintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, resolutionNotes: notes || undefined }),
    });
    setSaving(false);
    if (nextStatus === "resolved" && status !== "resolved" && !actionCreated) setOfferAction(true);
    router.refresh();
  }

  async function createImprovementAction() {
    setSaving(true);
    setActionError(null);
    const res = await fetch("/api/qualiopi/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        risk: `Réclamation : ${subject}`,
        origin: "reclamation",
        probability: "moyenne",
        severity: "moyenne",
        correctiveAction: notes || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setActionError(b.error ?? "Création impossible.");
      return;
    }
    setActionCreated(true);
    setOfferAction(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
          <option value="open">Ouverte</option>
          <option value="investigating">En cours d&apos;examen</option>
          <option value="resolved">Résolue</option>
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes de résolution"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
      {/* La pièce justificative n'apparaît qu'au moment où elle a un sens : on
          clôt la réclamation. Elle reste visible ensuite tant qu'un fichier est
          attaché, sinon on ne pourrait plus ni le relire ni le remplacer. */}
      {(nextStatus === "resolved" || hasProof) && (
        <SupportProofUpload kind="complaints" itemId={complaintId} proofFileName={proofFileName} hasProof={hasProof} />
      )}
      {offerAction && (
        <div className="flex items-center gap-2.5 flex-wrap bg-linen border border-line rounded-md px-2.5 py-2">
          <span className="text-[11.5px] text-ink">Réclamation résolue — en tirer une action d&apos;amélioration ?</span>
          <Button type="button" variant="tertiary" size="sm" onClick={createImprovementAction} disabled={saving}>
            {saving ? "…" : "Créer l'action"}
          </Button>
          <Button type="button" variant="tertiary" size="sm" onClick={() => setOfferAction(false)}>
            Non merci
          </Button>
          {actionError && <span className="text-[11px] text-rust">{actionError}</span>}
        </div>
      )}
      {actionCreated && <div className="text-[11.5px] text-sage">Action ajoutée au plan d&apos;amélioration continue ✓</div>}
    </div>
  );
}
