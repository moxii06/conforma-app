"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Off by default (ElearningModule.availableDuringWithdrawal) — this module
// only stays reachable during an active withdrawal gate
// (lib/withdrawalGate.ts) when the OF both set Organization.withdrawalAccessPolicy
// to "partial" AND flagged this specific module. Reserve it for what
// genuinely precedes the training itself (livret d'accueil, programme,
// règlement intérieur, test de positionnement) — see the schema comment.
// Harmless to leave on for every module when the org's policy is "closed",
// since moduleAccessibleUnderGate() only ever reads it under "partial".
export function ModuleWithdrawalAccessToggle({
  moduleId,
  availableDuringWithdrawal,
}: {
  moduleId: string;
  availableDuringWithdrawal: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/lms/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availableDuringWithdrawal: !availableDuringWithdrawal }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title="Accessible ou non pendant le délai de rétractation de l'apprenant (si l'organisme choisit un accès partiel)"
      className={`text-[11px] font-medium rounded px-1.5 py-0.5 border disabled:opacity-60 ${
        availableDuringWithdrawal
          ? "bg-[#DEE5E0] border-[#c9d5cd] text-sage"
          : "bg-white border-line text-slate hover:text-ink"
      }`}
    >
      {loading ? "…" : availableDuringWithdrawal ? "Ouvert pendant rétractation" : "Fermé pendant rétractation"}
    </button>
  );
}
