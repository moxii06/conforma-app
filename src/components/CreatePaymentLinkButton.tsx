"use client";

import { useState } from "react";

export function CreatePaymentLinkButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/facturation/invoices/${invoiceId}/checkout-link`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur inattendue.");
      return;
    }
    setUrl(body.url);
  }

  if (url) {
    return (
      <div className="text-[11.5px] text-sage">
        Lien créé —{" "}
        <a href={url} target="_blank" rel="noreferrer" className="underline decoration-line hover:decoration-sage">
          {url}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handleClick} disabled={loading} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading ? "…" : "Créer un lien de paiement Stripe"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
