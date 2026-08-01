"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Déclarer qu'un document a été signé sur papier.
//
// Avec Yousign connecté, le passage en « signé » est automatique : le
// webhook bascule le document sans que personne n'intervienne. Mais un
// contrat signé en présentiel, en fin de première journée, n'émet aucun
// événement numérique — et c'est le cas le plus fréquent chez un petit
// organisme. Sans ce bouton, l'onglet « Mes documents signés » resterait
// vide pour eux, et le dossier de preuves Qualiopi avec.
export function MarkSignedButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function marquer() {
    if (!confirm("Confirmer que ce document a bien été signé ?\n\nLa date de signature sera celle d'aujourd'hui.")) return;
    setLoading(true);
    setErreur(null);
    const res = await fetch(`/api/documents/${documentId}/mark-signed`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErreur(body.error ?? "Échec.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="shrink-0 flex items-center gap-2">
      {erreur && <span className="text-[11px] text-rust">{erreur}</span>}
      <button
        type="button"
        onClick={marquer}
        disabled={loading}
        className="text-[11.5px] font-medium text-slate hover:text-ink border border-line rounded px-2 py-1 hover:bg-pebble disabled:opacity-60"
      >
        {loading ? "…" : "Marquer signé"}
      </button>
    </div>
  );
}
