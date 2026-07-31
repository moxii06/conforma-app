"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Télécharger et envoyer un devis ou une facture. Les deux actions
// n'existaient pas : « envoyer » n'était qu'un statut dans un menu.
export function SendFacturationButton({
  kind,
  id,
  reference,
  contactName,
  hasEmail,
}: {
  kind: "invoice" | "quote";
  id: string;
  reference: string;
  contactName: string;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const libelle = kind === "invoice" ? "la facture" : "le devis";

  async function envoyer() {
    // Un document comptable part vers un client, avec le nom de l'organisme
    // dessus. On nomme le destinataire avant de le laisser partir.
    if (!window.confirm(`Envoyer ${libelle} ${reference} à ${contactName} par email, en pièce jointe PDF ?`)) return;
    setLoading(true);
    setErreur(null);
    const res = await fetch("/api/facturation/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErreur(body.error ?? "L'envoi a échoué.");
      return;
    }
    router.refresh();
  }

  const base = `/api/facturation/${kind === "invoice" ? "invoices" : "quotes"}/${id}/pdf`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={base}
        className="text-[11.5px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-pebble whitespace-nowrap"
      >
        PDF
      </a>
      {hasEmail ? (
        <button
          type="button"
          onClick={envoyer}
          disabled={loading}
          className="text-[11.5px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-pebble disabled:opacity-60 whitespace-nowrap"
        >
          {loading ? "Envoi…" : "Envoyer par email"}
        </button>
      ) : (
        <span className="text-[11px] text-slate">Pas d&apos;email sur ce client</span>
      )}
      {erreur && <span className="text-[11px] text-rust">{erreur}</span>}
    </div>
  );
}
