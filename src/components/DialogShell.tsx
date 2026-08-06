"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Coquille de boîte de dialogue partagée par les formulaires de saisie
// (devis, facture, nouveau prospect depuis la boîte mail). Née du retour
// client sur devis/facture — « il faut que cela fasse une nouvelle boite de
// dialogue dans laquelle je peux éditer » — puis reprise telle quelle
// partout où un formulaire s'ouvrait en place au milieu d'une liste. Même
// forme que les dialogues d'envoi de document existants : voile sombre,
// carte centrée, défilement interne quand le contenu dépasse.
export function DialogShell({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-lg",
  dense = false,
}: {
  title: string;
  /** De quoi parle cette boîte — le document concerné, la portée d'un envoi. */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  /**
   * Le corps gère lui-même sa mise en page.
   *
   * Par défaut la coquille empile son contenu (p-5, colonne, gap) : c'est ce
   * dont a besoin un formulaire, et c'est la quasi-totalité des cas. L'envoi
   * groupé, lui, est un plan de travail en deux colonnes avec ses propres
   * sections — lui imposer l'empilement reviendrait à ce qu'il le défasse.
   * L'en-tête reste commun dans les deux cas : c'est ça, l'harmonisation.
   */
  dense?: boolean;
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
      // Un clic DANS la boîte ne doit jamais atteindre ce qu'il y a derrière.
      // Ce n'est pas une précaution théorique : plusieurs de ces dialogues sont
      // rendus à l'intérieur d'une ligne de tableau cliquable (le CRM ouvre la
      // fiche du prospect au clic sur la ligne). Sans cette barrière, choisir
      // un modèle dans la liste ferait aussi naviguer vers la fiche.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-card border border-line w-full ${maxWidth} max-h-[85vh] overflow-y-auto ${
          dense ? "" : "p-5 flex flex-col gap-3.5"
        }`}
      >
        <div className={`flex items-start justify-between gap-3 ${dense ? "px-5 py-4 border-b border-line" : ""}`}>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink">{title}</div>
            {subtitle && <div className="text-[12px] text-slate mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-slate hover:text-ink shrink-0" aria-label="Fermer">
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
