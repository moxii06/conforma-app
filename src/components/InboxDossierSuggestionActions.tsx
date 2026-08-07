"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Confirmer ou écarter la suggestion de dossier de l'onglet Rattachements.
//
// Jusqu'ici cet onglet n'avait qu'un seul contrôle (assigner à un collègue),
// qui ne soldait rien : le compteur ne pouvait jamais baisser. Même patron
// que RgpdSuggestionActions, son jumeau sur le même écran — deux boutons,
// une action qui fait sortir le message de la liste dans les deux cas.
export function InboxDossierSuggestionActions({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function agir(action: "confirm-dossier" | "reject-dossier", cle: "confirm" | "reject") {
    setLoading(cle);
    setError(null);
    const res = await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => agir("confirm-dossier", "confirm")} disabled={loading !== null}>
          {loading === "confirm" ? "…" : "Valider le rattachement"}
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => agir("reject-dossier", "reject")} disabled={loading !== null}>
          {loading === "reject" ? "…" : "Ce n'est pas le bon dossier"}
        </Button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
