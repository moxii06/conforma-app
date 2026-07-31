"use client";

import { linesTotalCents, lineTotalCents, formatEuros, type DraftLine } from "@/lib/invoiceLines";

// La saisie du détail. Volontairement repliée par défaut : la majorité des
// factures d'un petit organisme tiennent en une désignation et un montant,
// et imposer un tableau à tout le monde alourdirait le cas courant pour
// servir le cas OPCO.
//
// Le total est affiché en permanence, avec l'écart quand il y en a un : le
// refus côté serveur arrive alors sans surprise, au lieu de rejeter une
// saisie qu'on croyait terminée.

export type EditableLine = { designation: string; quantity: string; unitPrice: string; unit: string };

export const LIGNE_VIDE: EditableLine = { designation: "", quantity: "1", unitPrice: "", unit: "" };

/** Convertit la saisie (des chaînes) en lignes exploitables. */
export function toDraftLines(lignes: EditableLine[]): DraftLine[] {
  return lignes
    .filter((l) => l.designation.trim() || l.unitPrice.trim())
    .map((l) => ({
      designation: l.designation.trim(),
      quantity: Number(l.quantity.replace(",", ".") || "0"),
      unitPriceCents: Math.round(Number(l.unitPrice.replace(",", ".") || "0") * 100),
      unit: l.unit.trim() || undefined,
    }));
}

export function InvoiceLinesEditor({
  lignes,
  onChange,
  amountCents,
}: {
  lignes: EditableLine[];
  onChange: (lignes: EditableLine[]) => void;
  amountCents: number;
}) {
  const draft = toDraftLines(lignes);
  const total = linesTotalCents(draft);
  const ecart = total - amountCents;

  function set(i: number, champ: keyof EditableLine, valeur: string) {
    onChange(lignes.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));
  }

  const champ = "border border-line rounded-md px-2 py-1 text-[12.5px] text-ink outline-none focus:border-seal";

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="text-[11px] text-slate uppercase tracking-wide">
        Détail (facultatif) — demandé par les OPCO sur les dossiers de prise en charge
      </div>

      {lignes.map((l, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Désignation"
            value={l.designation}
            onChange={(e) => set(i, "designation", e.target.value)}
            className={`${champ} flex-1 min-w-[160px]`}
          />
          <input
            placeholder="Qté"
            value={l.quantity}
            onChange={(e) => set(i, "quantity", e.target.value)}
            className={`${champ} w-16`}
          />
          <input
            placeholder="unité"
            value={l.unit}
            onChange={(e) => set(i, "unit", e.target.value)}
            className={`${champ} w-24`}
          />
          <input
            placeholder="P.U. €"
            value={l.unitPrice}
            onChange={(e) => set(i, "unitPrice", e.target.value)}
            className={`${champ} w-24`}
          />
          <span className="text-[12px] text-slate w-24 text-right tabular-nums">
            {draft[i] ? formatEuros(lineTotalCents(draft[i])) : ""}
          </span>
          <button
            type="button"
            onClick={() => onChange(lignes.filter((_, j) => j !== i))}
            className="text-[12px] text-slate hover:text-rust"
            aria-label={`Supprimer la ligne ${i + 1}`}
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onChange([...lignes, { ...LIGNE_VIDE }])}
          className="text-[12px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-pebble self-start"
        >
          + Ajouter une ligne
        </button>
        {draft.length > 0 && (
          <div className="text-[12px] tabular-nums">
            <span className="text-slate">Total du détail : </span>
            <span className={ecart === 0 ? "text-sage font-medium" : "text-rust font-medium"}>{formatEuros(total)}</span>
            {ecart !== 0 && (
              <span className="text-rust">
                {" "}
                — {ecart > 0 ? "dépasse" : "manque"} {formatEuros(Math.abs(ecart))} par rapport au montant saisi
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
