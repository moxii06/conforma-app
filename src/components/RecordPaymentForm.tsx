"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function RecordPaymentForm({
  invoiceId,
  amountCents,
  totalPaidCents,
}: {
  invoiceId: string;
  amountCents: number;
  totalPaidCents: number;
}) {
  const router = useRouter();
  const remaining = Math.max(0, amountCents - totalPaidCents);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(remaining > 0 ? (remaining / 100).toFixed(2) : "");
  const [method, setMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCentsToRecord = Math.round(parseFloat(amount) * 100);
    if (!amountCentsToRecord || amountCentsToRecord <= 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/facturation/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: amountCentsToRecord, method: method || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setOpen(false);
    setMethod("");
    router.refresh();
  }

  const pct = amountCents > 0 ? Math.min(100, Math.round((totalPaidCents / amountCents) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 max-w-[160px] bg-[#F1EFE8] rounded-full overflow-hidden">
          <div className="h-full bg-sage" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11.5px] text-slate">
          {formatAmount(totalPaidCents)} / {formatAmount(amountCents)} payé{totalPaidCents > 1 ? "s" : ""}
        </span>
        {remaining > 0 && !open && (
          <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Enregistrer un paiement
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant (€)"
            className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-28"
          />
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Moyen (virement, CB…)"
            className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-40"
          />
          <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1 hover:bg-ink-soft disabled:opacity-60">
            {loading ? "…" : "Ajouter"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
            Annuler
          </button>
        </form>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
