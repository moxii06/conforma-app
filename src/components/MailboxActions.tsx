"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// MailboxConnection.provider stores "gmail" (matches the display/DB value
// used throughout the rest of the app), but the API routes live under
// /api/integrations/google/... (named after the OAuth provider, not the
// mailbox brand) — this map bridges the two so the fetch URLs hit the
// routes that actually exist.
const API_PATH: Record<"gmail" | "imap", string> = { gmail: "google", imap: "imap" };

export function MailboxActions({ provider, connectionId }: { provider: "gmail" | "imap"; connectionId: string }) {
  const router = useRouter();
  const apiPath = API_PATH[provider];
  const [loading, setLoading] = useState<"disconnect" | "sync" | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading("disconnect");
    setError(null);
    await fetch(`/api/integrations/${apiPath}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    setLoading(null);
    router.refresh();
  }

  async function handleSync() {
    setLoading("sync");
    setError(null);
    setSyncResult(null);
    const res = await fetch(`/api/integrations/${apiPath}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(body.error ?? "Erreur de synchronisation.");
      return;
    }
    setSyncResult(`${body.imported} nouveau${body.imported > 1 ? "x" : ""} message${body.imported > 1 ? "s" : ""} importé${body.imported > 1 ? "s" : ""}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <button onClick={handleSync} disabled={loading !== null} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading === "sync" ? "…" : "Synchroniser maintenant"}
        </button>
        <button onClick={handleDisconnect} disabled={loading !== null} className="text-[12px] text-rust hover:underline disabled:opacity-60">
          {loading === "disconnect" ? "…" : "Déconnecter"}
        </button>
      </div>
      {syncResult && <div className="text-[11.5px] text-sage">{syncResult}</div>}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
