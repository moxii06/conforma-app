"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

// Le « ? » qui explique une obligation sans la répéter à côté de chaque champ.
//
// Un clic, pas un survol : l'explication fait souvent trois paragraphes, et
// une infobulle qui disparaît quand on déplace la souris pour la lire est une
// infobulle qu'on ne lit pas. Elle se ferme au clic à l'extérieur et à Échap,
// comme tout ce qui s'ouvre par-dessus dans Jalon.

export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    function auClic(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    }
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  return (
    <div className="relative inline-flex" ref={boite}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-label={label}
        aria-expanded={ouvert}
        className="text-ash hover:text-slate transition-colors"
      >
        <HelpCircle size={14} />
      </button>
      {ouvert && (
        // z-20 : au-dessus des intertitres collants des listes, qui sont en
        // z-10. Largeur bornée et non fixe pour ne pas déborder d'une carte
        // étroite sur le tableau de bord.
        <div className="absolute left-0 top-6 z-20 w-[min(22rem,80vw)] bg-white border border-line rounded-card shadow-lg p-3.5 text-[11.5px] text-ink leading-relaxed">
          <div className="text-[11px] text-slate uppercase tracking-wide mb-1.5">{label}</div>
          {children}
        </div>
      )}
    </div>
  );
}
