"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

// MailboxConnection.provider stores "gmail" (matches the display/DB value
// used throughout the rest of the app), but the API routes live under
// /api/integrations/google/... (named after the OAuth provider, not the
// mailbox brand) — this map bridges the two so the fetch URLs hit the
// routes that actually exist.
const API_PATH: Record<"gmail" | "imap", string> = { gmail: "google", imap: "imap" };

export function MailboxActions({
  provider,
  connectionId,
  syncEnabled,
}: {
  provider: "gmail" | "imap";
  connectionId: string;
  syncEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const apiPath = API_PATH[provider];
  const [loading, setLoading] = useState<"disconnect" | "sync" | "toggle" | null>(null);

  // Audit P1 : mettre une boîte en pause sans la déconnecter. La nuance
  // compte — déconnecter efface les messages déjà importés, décocher les
  // garde et se contente d'arrêter d'en chercher de nouveaux.
  async function handleToggle() {
    setLoading("toggle");
    const res = await fetch("/api/integrations/mailbox/toggle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, enabled: !syncEnabled }),
    });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Impossible de modifier cette boîte.");
      return;
    }
    toast.success(syncEnabled ? "Synchronisation mise en pause." : "Synchronisation réactivée.");
    router.refresh();
  }

  async function handleDisconnect() {
    setLoading("disconnect");
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
    const res = await fetch(`/api/integrations/${apiPath}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      toast.error(body.error ?? "Erreur de synchronisation.");
      return;
    }
    toast.success(`${body.imported} nouveau${body.imported > 1 ? "x" : ""} message${body.imported > 1 ? "s" : ""} importé${body.imported > 1 ? "s" : ""}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate">
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={handleToggle}
          disabled={loading !== null}
          className="h-3.5 w-3.5 accent-seal disabled:opacity-60"
        />
        <span title="Décocher arrête la synchronisation sans supprimer les emails déjà importés.">
          {loading === "toggle" ? "…" : "Synchroniser cette boîte"}
        </span>
      </label>
      <button
        onClick={handleSync}
        disabled={loading !== null || !syncEnabled}
        title={syncEnabled ? undefined : "Cochez « Synchroniser cette boîte » pour relancer les imports."}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading === "sync" ? "…" : "Synchroniser maintenant"}
      </button>
      <button onClick={handleDisconnect} disabled={loading !== null} className="text-[12px] text-rust hover:underline disabled:opacity-60">
        {loading === "disconnect" ? "…" : "Déconnecter"}
      </button>
    </div>
  );
}
