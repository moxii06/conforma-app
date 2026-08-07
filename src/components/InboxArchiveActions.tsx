"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Sortir un message archivé par erreur, depuis l'onglet Archivés.
//
// L'inverse d'« Archiver » (InboxMessageActions), et c'est tout l'ajout : le
// champ ignoredAt existait déjà, seul le chemin de retour manquait.
export function InboxRestoreButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restaurer() {
    setLoading(true);
    const res = await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={restaurer}
      disabled={loading}
      className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0"
    >
      {loading ? "…" : "Désarchiver"}
    </button>
  );
}
