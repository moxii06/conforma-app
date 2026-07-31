// Le calcul du détail d'un devis ou d'une facture.
//
// Le montant global (`amountCents`) reste la référence : c'est lui que
// lisent les paiements, le rapprochement bancaire et les totaux du tableau
// de bord. Les lignes sont un détail facultatif qui doit lui correspondre —
// deux sources de vérité sur un montant, c'est un écart qui finit par se
// voir en comptabilité, et toujours du mauvais côté.

export type DraftLine = {
  designation: string;
  quantity: number;
  unitPriceCents: number;
  unit?: string | null;
};

/** Le total d'une ligne. Arrondi au centime : 1,5 × 333 ne fait pas 499,5. */
export function lineTotalCents(line: Pick<DraftLine, "quantity" | "unitPriceCents">): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function linesTotalCents(lines: Pick<DraftLine, "quantity" | "unitPriceCents">[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export type LinesCheck = { ok: true } | { ok: false; error: string };

/**
 * Vérifie qu'un détail est utilisable, avant de l'enregistrer.
 *
 * Le total des lignes doit tomber exactement sur le montant du document.
 * Pas de tolérance : un écart d'un centime entre le détail et le total est
 * précisément ce qu'un OPCO ou un comptable relève, et laisser passer
 * « c'est à peu près ça » reviendrait à produire des factures qu'il faudra
 * corriger une par une plus tard.
 */
export function checkLines(lines: DraftLine[], amountCents: number): LinesCheck {
  if (lines.length === 0) return { ok: true };

  for (const [i, l] of lines.entries()) {
    if (!l.designation.trim()) return { ok: false, error: `Ligne ${i + 1} : la désignation est obligatoire.` };
    if (!(l.quantity > 0)) return { ok: false, error: `Ligne ${i + 1} : la quantité doit être supérieure à zéro.` };
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) {
      return { ok: false, error: `Ligne ${i + 1} : le prix unitaire est invalide.` };
    }
  }

  const total = linesTotalCents(lines);
  if (total !== amountCents) {
    return {
      ok: false,
      error:
        `Le détail totalise ${formatEuros(total)} alors que le document est à ${formatEuros(amountCents)}. ` +
        `Corrigez les lignes ou le montant.`,
    };
  }
  return { ok: true };
}

export function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** « 3 jours × 350,00 € », ou juste le prix quand la quantité est 1 sans unité. */
export function lineDetailLabel(line: DraftLine): string {
  const quantite = line.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const unite = line.unit?.trim();
  if (line.quantity === 1 && !unite) return formatEuros(line.unitPriceCents);
  return `${quantite}${unite ? ` ${unite}` : ""} × ${formatEuros(line.unitPriceCents)}`;
}
