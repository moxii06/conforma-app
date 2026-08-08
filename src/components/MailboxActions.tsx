"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { Switch } from "@/components/Controls";

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
  canManage,
}: {
  provider: "gmail" | "imap";
  connectionId: string;
  syncEnabled: boolean;
  /**
   * Droit de mettre en pause et de déconnecter la boîte — pas le même que
   * celui de la relever.
   *
   * « Synchroniser maintenant » ne demande que le droit `inbox` (voir les
   * deux routes /sync), ce qu'ont le gestionnaire et le commercial. Pause et
   * déconnexion, elles, passent par /integrations/mailbox/toggle et
   * /integrations/*\/disconnect, réservés au titulaire du compte. Sans cette
   * distinction, /inbox affichait à un gestionnaire deux contrôles qui ne
   * pouvaient que lui répondre 403.
   */
  canManage: boolean;
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

  // La seule action DESTRUCTRICE du lot : la route supprime, dans une même
  // transaction, la connexion ET tous les EmailMessage qui en viennent. D'où
  // la confirmation — et surtout la lecture de `res.ok` : sans elle, un refus
  // (403) ou une panne se soldait par un simple rafraîchissement, la boîte
  // toujours là et pas un mot d'explication.
  async function handleDisconnect() {
    const confirme = window.confirm(
      "Déconnecter cette boîte supprimera aussi tous les emails déjà importés depuis cette adresse. Continuer ?"
    );
    if (!confirme) return;
    setLoading("disconnect");
    const res = await fetch(`/api/integrations/${apiPath}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      toast.error(body.error ?? "Impossible de déconnecter cette boîte.");
      return;
    }
    toast.success("Boîte déconnectée.");
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
      {/* Interrupteur et non case à cocher : ceci enregistre immédiatement,
          il n'y a aucun bouton « Valider » derrière. Une case dit « je
          remplis un formulaire », un interrupteur dit « c'est fait ». */}
      {canManage && (
        <div className="flex items-center gap-1.5 text-[12px] text-slate">
          <Switch
            checked={syncEnabled}
            onChange={handleToggle}
            disabled={loading !== null}
            label="Synchroniser cette boîte"
          />
          <span title="Désactiver arrête la synchronisation sans supprimer les emails déjà importés.">
            {loading === "toggle" ? "…" : "Synchroniser cette boîte"}
          </span>
        </div>
      )}
      <button
        onClick={handleSync}
        disabled={loading !== null || !syncEnabled}
        title={
          syncEnabled
            ? undefined
            : canManage
              ? "Cochez « Synchroniser cette boîte » pour relancer les imports."
              : "Cette boîte est en pause — seul le titulaire du compte peut la réactiver."
        }
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading === "sync" ? "…" : "Synchroniser maintenant"}
      </button>
      {canManage && (
        <button onClick={handleDisconnect} disabled={loading !== null} className="text-[12px] text-rust hover:underline disabled:opacity-60">
          {loading === "disconnect" ? "…" : "Déconnecter"}
        </button>
      )}
    </div>
  );
}
