"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Coquille de boîte de dialogue partagée par les formulaires devis et
// facture (retour client : ces deux formulaires s'ouvraient en place dans
// la page, il les veut en vraie boîte de dialogue éditable). Même forme que
// les dialogues d'envoi de document existants : voile sombre, carte
// centrée, défilement interne quand le contenu dépasse.
export function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Échap ferme, comme dans n'importe quelle boîte de dialogue — sinon la
  // seule sortie est la croix, qu'on ne trouve pas toujours du regard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      // Clic sur le voile = fermeture, mais pas un clic qui a commencé dans
      // la carte et fini sur le voile (sélection de texte qui déborde).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">{title}</div>
          <button type="button" onClick={onClose} className="text-slate hover:text-ink" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Champ étiqueté. Les formulaires ne montraient que des textes de
// substitution : dès qu'un champ était rempli, on ne savait plus ce qu'il
// contenait. min-w-0 sur le conteneur pour qu'un <select> à options longues
// s'adapte à sa colonne au lieu de la faire déborder.
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-slate uppercase tracking-wide">
        {label}
        {hint && <span className="normal-case tracking-normal text-ash"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}
