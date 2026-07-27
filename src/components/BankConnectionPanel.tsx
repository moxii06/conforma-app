"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, X } from "lucide-react";

type Institution = { id: string; name: string; logo?: string };
type Connection = { id: string; institutionName: string; status: string; lastSyncedAt: string | null };

// Tier 2 of "rapprochement bancaire" — see gocardless.ts. Renders nothing
// if GoCardless isn't configured server-side (no GOCARDLESS_SECRET_ID/KEY),
// same "hidden until the platform credential exists" stance as every other
// optional integration here (Stripe, Yousign...).
export function BankConnectionPanel({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  async function openDialog() {
    setOpen(true);
    if (institutions) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/facturation/bank/institutions");
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !data) {
      setError(data?.error ?? "Impossible de charger la liste des banques.");
      return;
    }
    setInstitutions(data.institutions);
  }

  async function connect() {
    const institution = institutions?.find((i) => i.id === selected);
    if (!institution) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/facturation/bank/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: institution.id, institutionName: institution.name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.authUrl) {
      setLoading(false);
      setError(data?.error ?? "Échec de la connexion.");
      return;
    }
    // Full navigation, not a fetch — the bank's own hosted consent page.
    window.location.href = data.authUrl;
  }

  async function sync(id: string) {
    setSyncing(id);
    await fetch("/api/facturation/bank/sync", { method: "POST" });
    setSyncing(null);
    router.refresh();
  }

  return (
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
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink border border-line rounded-md px-3 py-1.5 hover:border-ink-soft"
        >
          <Landmark size={13} />
          Connecter ma banque
        </button>
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
              Vous serez redirigé vers votre banque pour vous authentifier — Jalon ne voit jamais vos identifiants
              bancaires, uniquement les mouvements de compte (lecture seule), via GoCardless (agrégateur agréé DSP2).
            </div>
            {loading && !institutions ? (
              <div className="text-[12.5px] text-slate">Chargement des banques…</div>
            ) : institutions ? (
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
              >
                <option value="">— Choisir votre banque —</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            ) : null}
            {error && <div className="text-[12.5px] text-rust">{error}</div>}
            <button
              type="button"
              onClick={connect}
              disabled={!selected || loading}
              className="self-start bg-ink text-white text-[12.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft disabled:opacity-50"
            >
              {loading ? "…" : "Continuer vers ma banque"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
