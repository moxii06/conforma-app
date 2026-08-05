"use client";

/**
 * Les deux contrôles de réglage de Jalon, en un seul endroit.
 *
 * Ils vivent ici et non dans ui.tsx parce que ui.tsx n'est pas un module
 * client : il est importé par des composants serveur, et un contrôle qui
 * reçoit un gestionnaire de clic ne peut pas y figurer.
 *
 * QUAND UTILISER L'UN, QUAND UTILISER L'AUTRE — la règle a été posée avec
 * le client et vaut pour tout l'écran :
 *
 *   Switch            un réglage qui prend effet IMMÉDIATEMENT sur quelque
 *                     chose qui existe déjà, dont un des deux états est la
 *                     norme. Jamais un champ dans un formulaire qu'on
 *                     valide ensuite.
 *
 *   SegmentedControl  2 à 4 options exclusives, TOUTES lisibles d'un coup,
 *                     aux libellés courts. Il remplace un menu déroulant,
 *                     jamais une liste.
 *
 * Ni l'un ni l'autre pour : choisir dans une liste (action groupée sur
 * quarante lignes, responsables, apprenants) — la case à cocher reste le
 * bon outil ; et pour un CONSENTEMENT (cookies, RGPD, renonciation à
 * rétractation), où la case est la convention juridique et se lit « j'ai
 * activement accepté », là où un interrupteur se lit « réglage ».
 */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  /** Repris en aria-label : l'interrupteur n'a pas de texte propre. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`w-[34px] h-5 rounded-full shrink-0 relative transition-colors disabled:opacity-50 ${
        checked ? "bg-sage" : "bg-pebble"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

/**
 * Un interrupteur avec son libellé, son sous-titre et — quand le choix le
 * mérite — la CONSÉQUENCE du choix inverse en clair.
 *
 * C'est cette dernière ligne qui fait le travail. « Déblocage séquentiel »
 * n'apprend rien à qui ne connaît pas déjà la réponse ; « décoché, tous les
 * modules s'ouvrent d'un coup » se tranche sans documentation.
 */
export function SwitchRow({
  checked,
  onChange,
  titre,
  sous,
  consequence,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  titre: string;
  sous?: string;
  consequence?: string;
  disabled?: boolean;
  /** Contenu supplémentaire sous la règle (lien à copier, champ lié…). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 items-start py-3 border-b border-line last:border-b-0">
      <div className="mt-0.5">
        <Switch checked={checked} onChange={onChange} label={titre} disabled={disabled} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">{titre}</div>
        {sous && <div className="text-[12px] text-slate mt-0.5">{sous}</div>}
        {consequence && (
          <div className="text-[11.5px] text-slate mt-1.5 border-l-2 border-seal pl-2.5 py-0.5">{consequence}</div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Choix exclusif entre 2 et 4 options, toutes visibles.
 *
 * `flex-wrap` plutôt qu'un défilement : dans une colonne étroite les
 * options passent à la ligne, elles ne se coupent pas. Une option tronquée
 * ne se choisit pas.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  /** Rend le groupe annonçable ; à donner quand aucun <label> ne le précède. */
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex border border-line rounded-md overflow-hidden w-fit max-w-full flex-wrap bg-white"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 text-[12.5px] border-r border-line last:border-r-0 disabled:opacity-50 ${
            value === o.value ? "bg-ink text-white font-medium" : "text-slate hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Les jeux d'options qui reviennent sur plusieurs écrans. */
export const FORMAT_OPTIONS = [
  { value: "IN_PERSON", label: "Présentiel" },
  { value: "REMOTE", label: "Distanciel" },
  { value: "HYBRID", label: "Mixte" },
] as const;

export const RYTHME_OPTIONS = [
  { value: "FIXED_DATE", label: "Session à date fixe" },
  { value: "ROLLING", label: "En continu — chacun son calendrier" },
] as const;
