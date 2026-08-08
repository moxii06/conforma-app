"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, X } from "lucide-react";
import { Button } from "@/components/ui";

type Connection = { id: string; institutionName: string; status: string; lastSyncedAt: string | null };

// Tier 2 of "rapprochement bancaire" — see bridge.ts. Renders nothing if
// Bridge isn't configured server-side (no BRIDGE_CLIENT_ID/CLIENT_SECRET),
// same "hidden until the platform credential exists" stance as every other
// optional integration here (Stripe, Yousign...). No bank picker here —
// Bridge Connect's own hosted webview lets the end user search their bank.
export function BankConnectionPanel({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Séparé de `error`, qui s'affiche dans la boîte de dialogue de connexion —
  // elle est fermée au moment où l'on clique « Synchroniser ». Le ton
  // distingue un échec (rouge) d'un simple compte rendu (gris).
  const [syncMessage, setSyncMessage] = useState<{ ton: "echec" | "info"; texte: string } | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/facturation/bank/connect", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.authUrl) {
      setLoading(false);
      setError(data?.error ?? "Échec de la connexion.");
      return;
    }
    // Full navigation, not a fetch — Bridge's own hosted webview.
    window.location.href = data.authUrl;
  }

  // syncBankTransactions n'échoue jamais en bloc : un compte injoignable
  // remplit le tableau `errors` et la route répond quand même 200, après
  // avoir écrit lastSyncedAt. Tant que la réponse n'était pas lue, une
  // banque en échec réaffichait « synchronisé <date> » au refresh — donc
  // « tout va bien » alors que rien n'était remonté.
  async function sync(id: string) {
    setSyncing(id);
    setSyncMessage(null);
    const res = await fetch("/api/facturation/bank/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    });
    const data = await res.json().catch(() => null);
    setSyncing(null);

    if (!res.ok) {
      setSyncMessage({ ton: "echec", texte: data?.error ?? "Échec de la synchronisation." });
      return;
    }

    const erreurs: string[] = Array.isArray(data?.errors) ? data.errors : [];
    const inserees = typeof data?.transactionsInserted === "number" ? data.transactionsInserted : 0;
    if (erreurs.length > 0) {
      setSyncMessage({ ton: "echec", texte: `Synchronisation incomplète — ${erreurs.join(" ; ")}` });
    } else if (inserees === 0) {
      setSyncMessage({ ton: "info", texte: "Synchronisation terminée : aucune nouvelle opération." });
    } else {
      setSyncMessage({
        ton: "info",
        texte: `Synchronisation terminée : ${inserees} nouvelle${inserees > 1 ? "s" : ""} opération${inserees > 1 ? "s" : ""}.`,
      });
    }

    // Le refresh a lieu même en cas d'échec partiel : les comptes qui ont
    // répondu ont bien inséré leurs opérations, il faut les afficher.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 flex-wrap">
        {connections.map((c) => (
          <div key={c.id} className="inline-flex items-center gap-2 text-[12px] text-slate border border-line rounded-md px-2.5 py-1.5">
            <Landmark size={13} />
            <span className="text-ink font-medium">{c.institutionName}</span>
            {c.status === "linked" ? (
              <>
                <span>
                  {c.lastSyncedAt
                    ? `synchronisé ${new Date(c.lastSyncedAt).toLocaleDateString("fr-FR")}`
                    : "jamais synchronisé"}
                </span>
                <button
                  type="button"
                  onClick={() => sync(c.id)}
                  disabled={syncing === c.id}
                  className="text-ink underline decoration-line hover:decoration-ink disabled:opacity-50"
                >
                  {syncing === c.id ? "…" : "Synchroniser"}
                </button>
              </>
            ) : (
              <span className="text-rust">{c.status === "error" ? "erreur de connexion" : "en attente"}</span>
            )}
          </div>
        ))}

        {!open ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Landmark size={13} />
            Connecter ma banque
          </Button>
        ) : (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-card border border-line w-full max-w-md p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div className="text-[13.5px] font-semibold text-ink">Connecter ma banque</div>
                <button type="button" onClick={() => setOpen(false)} className="text-slate hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="text-[12.5px] text-slate leading-relaxed">
                Vous serez redirigé vers Bridge pour choisir votre banque et vous authentifier — Jalon ne voit jamais vos
                identifiants bancaires, uniquement les mouvements de compte (lecture seule), via Bridge (agrégateur agréé
                DSP2/ACPR).
              </div>
              {error && <div className="text-[12.5px] text-rust">{error}</div>}
              <Button type="button" onClick={connect} disabled={loading} className="self-start">
                {loading ? "…" : "Continuer vers Bridge"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hors de la boîte de dialogue : c'est le résultat du bouton
          « Synchroniser » de la ligne, pas celui du flux de connexion. */}
      {syncMessage && (
        <div className={`text-[11.5px] max-w-lg ${syncMessage.ton === "echec" ? "text-rust" : "text-slate"}`}>
          {syncMessage.texte}
        </div>
      )}
    </div>
  );
}
