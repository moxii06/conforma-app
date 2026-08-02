"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "warn" | "clear-warning" | "suspend" | "restore";

export function OrganizationAccessActions({
  organizationId,
  isWarned,
  isSuspended,
}: {
  organizationId: string;
  isWarned: boolean;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action, withReason: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/plateforme/organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(withReason ? { reason: reason.trim() || undefined } : {}) }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur.");
      return;
    }
    setPending(null);
    setReason("");
    router.refresh();
  }

  if (pending === "warn" || pending === "suspend") {
    const label = pending === "warn" ? "Avertir cet organisme" : "Suspendre l'accès de cet organisme";
    return (
      <div className="flex flex-col gap-1.5 items-end">
        <div className="text-[11.5px] text-ink font-medium">{label}</div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif (optionnel)"
          className="border border-line rounded-md px-2 py-1 text-[12px] text-ink w-48 focus:outline-none focus:border-ink-soft"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run(pending, true)}
            disabled={loading}
            className={`text-[11.5px] font-medium hover:underline disabled:opacity-60 ${pending === "suspend" ? "text-rust" : "text-seal"}`}
          >
            {loading ? "…" : "Confirmer"}
          </button>
          <button type="button" onClick={() => setPending(null)} className="text-[11.5px] text-slate hover:underline">
            Annuler
          </button>
        </div>
        {error && <div className="text-[11px] text-rust">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {isWarned && (
          <button type="button" onClick={() => run("clear-warning", false)} disabled={loading} className="text-[11.5px] text-slate hover:text-ink disabled:opacity-60">
            Lever l'avertissement
          </button>
        )}
        {!isWarned && !isSuspended && (
          <button type="button" onClick={() => setPending("warn")} className="text-[11.5px] text-seal hover:underline">
            Avertir
          </button>
        )}
        {isSuspended ? (
          <button type="button" onClick={() => run("restore", false)} disabled={loading} className="text-[11.5px] font-medium text-sage hover:underline disabled:opacity-60">
            {loading ? "…" : "Rétablir l'accès"}
          </button>
        ) : (
          <button type="button" onClick={() => setPending("suspend")} className="text-[11.5px] font-medium text-rust hover:underline">
            Suspendre
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-rust">{error}</div>}
    </div>
  );
}
