"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export type InvoiceOption = { id: string; reference: string; contactName: string; remainingCents: number };

export function BankTransactionReview({
  transactionId,
  bookedAt,
  amountCents,
  label,
  suggestions,
  confident,
}: {
  transactionId: string;
  bookedAt: string; // pre-formatted server-side (date-fns/fr), avoids a client/server locale mismatch
  amountCents: number;
  label: string;
  suggestions: (InvoiceOption & { score: number; reasons: string[] })[];
  confident: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(suggestions[0]?.id ?? "");
  const [loading, setLoading] = useState<"confirm" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!selectedId) return;
    setLoading("confirm");
    setError(null);
    const res = await fetch(`/api/facturation/bank/transactions/${transactionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: selectedId }),
    });
    setLoading(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Échec de la confirmation.");
      return;
    }
    router.refresh();
  }

  async function dismiss() {
    setLoading("dismiss");
    setError(null);
    const res = await fetch(`/api/facturation/bank/transactions/${transactionId}/dismiss`, { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Échec.");
      return;
    }
    router.refresh();
  }

  const top = suggestions.find((s) => s.id === selectedId);

  return (
    <div className="bg-white border border-line rounded-card px-4.5 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-ink truncate">{label}</div>
          <div className="text-[12px] text-slate mt-1">{bookedAt}</div>
        </div>
        <div className="shrink-0 text-[15px] font-mono tabular-nums text-sage font-semibold">+{formatAmount(amountCents)}</div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap pt-1 border-t border-line">
        {suggestions.length > 0 ? (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 min-w-[220px] border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
          >
            {suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.reference} — {s.contactName} ({formatAmount(s.remainingCents)} dû){s.score > 0 ? ` · ${s.reasons.join(", ")}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex-1 min-w-[220px] text-[12px] text-slate italic">Aucune facture ouverte ne correspond.</div>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={!selectedId || loading !== null}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-50"
        >
          {loading === "confirm" ? "…" : confident && top?.id === suggestions[0]?.id ? "Confirmer la suggestion" : "Associer"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={loading !== null}
          className="text-[12px] text-slate hover:text-ink disabled:opacity-50"
        >
          {loading === "dismiss" ? "…" : "Ignorer"}
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
