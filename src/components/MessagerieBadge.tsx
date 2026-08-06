"use client";

import { useEffect, useState } from "react";

// La pastille de non-lus, à côté de « Messagerie interne » dans la barre.
//
// Un composant client minuscule dans une barre latérale rendue côté serveur :
// sans lui, le compteur ne bougerait qu'en changeant de page, et on
// apprendrait qu'un collègue a écrit en allant faire autre chose.
//
// Interrogation toutes les 45 secondes, pas 8 comme la page de messagerie :
// celle-ci est ouverte quand on converse, la barre est ouverte en permanence
// sur tous les écrans. Un rythme ambiant, pas un rythme de conversation. Le
// sondage s'arrête quand l'onglet passe en arrière-plan.
const INTERVALLE_BARRE_MS = 45_000;

export function MessagerieBadge() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let annule = false;
    async function relever() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/messagerie/non-lus");
        if (!res.ok || annule) return;
        const body = await res.json();
        setTotal(body.total ?? 0);
      } catch {
        // Silencieux : une pastille absente est un défaut acceptable, une
        // erreur sur toutes les pages ne l'est pas. Même parti pris que la
        // cloche de notifications.
      }
    }
    void relever();
    const minuteur = setInterval(relever, INTERVALLE_BARRE_MS);
    return () => {
      annule = true;
      clearInterval(minuteur);
    };
  }, []);

  if (total === 0) return null;

  return (
    <span
      className="ml-auto shrink-0 text-[10.5px] font-semibold text-ink bg-white rounded-full px-1.5 min-w-[18px] text-center"
      aria-label={`${total} message${total > 1 ? "s" : ""} non lu${total > 1 ? "s" : ""}`}
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}
