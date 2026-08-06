"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Un menu qui pilote un paramètre d'URL, rien de plus.
//
// L'état vit dans l'URL et non dans le composant : c'est ce qui rend un tri
// ou un filtre partageable, replaçable par le bouton Précédent, et surtout
// lisible par le serveur — la page se recalcule avec, plutôt que de tout
// charger puis de cacher côté client ce qui ne correspond pas.

const STYLE =
  "border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink bg-white outline-none focus:border-seal max-w-[220px]";

export type OptionMenu = { value: string; label: string; count?: number };

function useParamUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return {
    lire: (param: string) => searchParams.get(param) ?? "",
    poser: (param: string, valeur: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (valeur) params.set(param, valeur);
      else params.delete(param);
      // Filtrer ou reclasser rebat entièrement les cartes : rester en page 7
      // renverrait sur une page vide, ce qui se lit comme « aucun résultat ».
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
  };
}

/**
 * Un filtre : une option « tout » en tête, puis les valeurs proposées.
 *
 * Ne s'affiche pas quand il n'y a rien à proposer — un menu dont le seul
 * contenu est « Toutes les formations » occupe de la place pour rien et
 * suggère une fonctionnalité en panne.
 */
export function QueryFilterSelect({
  param,
  allLabel,
  options,
  showCounts = true,
}: {
  param: string;
  allLabel: string;
  options: OptionMenu[];
  showCounts?: boolean;
}) {
  const { lire, poser } = useParamUrl();
  if (options.length === 0) return null;
  return (
    <select
      aria-label={allLabel}
      value={lire(param)}
      onChange={(e) => poser(param, e.target.value)}
      className={STYLE}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
          {showCounts && o.count !== undefined ? ` (${o.count})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Un choix de vue : toujours une valeur, précédée de son intitulé. */
export function QueryChoiceSelect({
  param,
  label,
  options,
  value,
}: {
  param: string;
  label: string;
  options: OptionMenu[];
  value: string;
}) {
  const { poser } = useParamUrl();
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-slate whitespace-nowrap">
      {label}
      <select value={value} onChange={(e) => poser(param, e.target.value)} className={STYLE}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
