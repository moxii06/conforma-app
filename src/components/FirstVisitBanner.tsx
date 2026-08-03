"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const KEY_PREFIX = "jalon-firstvisit-";

// Encart d'orientation contextuel qui se referme définitivement une fois lu —
// pas un tour produit (l'audit S6, finding M2, le déconseille explicitement),
// juste ce qu'un nouvel arrivant sur l'écran a besoin de savoir une fois.
// L'état "vu" est en localStorage, comme CookieConsent : pas d'enjeu
// multi-poste ici (contrairement aux notifications, finding M5), donc pas
// besoin d'un modèle serveur pour un simple "je l'ai déjà lu".
export function FirstVisitBanner({ id, children }: { id: string; children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(KEY_PREFIX + id) === "1");
  }, [id]);

  function dismiss() {
    window.localStorage.setItem(KEY_PREFIX + id, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="bg-linen border border-line rounded-card px-4 py-3 flex items-start gap-3">
      <div className="flex-1 text-[12.5px] text-ink leading-relaxed">{children}</div>
      <button type="button" onClick={dismiss} aria-label="Fermer" className="text-slate hover:text-ink shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
