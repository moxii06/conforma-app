"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

/** Rouvrir un dossier clos, depuis sa propre fiche. */
export function RouvrirDossierButton({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        const res = await fetch("/api/dossiers/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierIds: [dossierId], archived: false }),
        });
        setEnCours(false);
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          toast.error(b.error ?? "L'action a échoué.");
          return;
        }
        toast.success("Dossier rouvert.");
        router.refresh();
      }}
      className="text-[12px] font-medium text-ink border border-line rounded px-2.5 py-1 hover:bg-paper whitespace-nowrap disabled:opacity-50"
    >
      {enCours ? "…" : "Rouvrir"}
    </button>
  );
}
