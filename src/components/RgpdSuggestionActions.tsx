"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RequestType = "access" | "erasure" | "portability" | "rectification";

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  access: "Accès",
  erasure: "Effacement",
  portability: "Portabilité",
  rectification: "Rectification",
};

export function RgpdSuggestionActions({
  messageId,
  suggestedType,
  defaultPersonLabel,
}: {
  messageId: string;
  suggestedType: RequestType;
  defaultPersonLabel: string;
}) {
  const router = useRouter();
  const [requestType, setRequestType] = useState<RequestType>(suggestedType);
  const [personLabel, setPersonLabel] = useState(defaultPersonLabel);
  const [loading, setLoading] = useState<"confirm" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!personLabel.trim()) return;
    setLoading("confirm");
    setError(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/rgpd-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType, personLabel }),
    });
    setLoading(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    router.refresh();
  }

  async function handleDismiss() {
    setLoading("dismiss");
    setError(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/rgpd-dismiss`, { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-1.5 pt-2 border-t border-line">
      <div className="flex items-center gap-2">
        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as RequestType)}
          className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
        >
          {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={personLabel}
          onChange={(e) => setPersonLabel(e.target.value)}
          placeholder="Nom de la personne concernée"
          className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal flex-1"
        />
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={handleConfirm}
          disabled={loading !== null || !personLabel.trim()}
          className="bg-ink text-white text-[11.5px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading === "confirm" ? "…" : "Confirmer la demande"}
        </button>
        <button onClick={handleDismiss} disabled={loading !== null} className="text-[11.5px] text-slate hover:text-ink disabled:opacity-60">
          {loading === "dismiss" ? "…" : "Ce n'est pas une demande RGPD"}
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
