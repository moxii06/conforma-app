"use client";

/**
 * Une règle du parcours : un interrupteur, son libellé, et sa CONSÉQUENCE.
 *
 * Partagé par l'assistant de création (étape 3) et la fiche formation, pour
 * une raison qui n'est pas l'économie de code : ce qu'on règle en créant, on
 * doit le retrouver à l'identique en modifiant. Deux présentations
 * différentes du même réglage font douter qu'il s'agisse du même.
 *
 * La phrase de conséquence est ce qui porte la décision. Un interrupteur
 * nommé « déblocage séquentiel » n'apprend rien à qui ne connaît pas déjà la
 * réponse ; « décoché, tous les modules s'ouvrent d'un coup » se tranche
 * sans aller lire une documentation.
 */
export function ParcoursRuleRow({
  actif,
  onToggle,
  titre,
  sous,
  consequence,
  disabled,
}: {
  actif: boolean;
  onToggle: () => void;
  titre: string;
  sous: string;
  consequence?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3 items-start py-3 border-b border-line last:border-b-0">
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-label={titre}
        onClick={onToggle}
        disabled={disabled}
        className={`w-[34px] h-5 rounded-full shrink-0 mt-0.5 relative transition-colors disabled:opacity-50 ${
          actif ? "bg-sage" : "bg-pebble"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${actif ? "left-4" : "left-0.5"}`}
        />
      </button>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink">{titre}</div>
        <div className="text-[12px] text-slate mt-0.5">{sous}</div>
        {consequence && (
          <div className="text-[11.5px] text-slate mt-1.5 border-l-2 border-seal pl-2.5 py-0.5">{consequence}</div>
        )}
      </div>
    </div>
  );
}
