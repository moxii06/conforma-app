// Reconnaître une date tapée dans la recherche globale.
//
// Une session n'a pas de nom : elle s'appelle « la formation X du 12 mars ».
// Chercher « 12/03 » ne donnait donc rien, alors que c'est exactement ce
// qu'on tape quand on cherche une journée précise dans le planning.
//
// On ne devine pas au-delà de ce qui est écrit : sans année, on prend
// l'année en cours plutôt que d'aller chercher la date « la plus probable »
// — un résultat faux mais confiant est pire qu'un résultat absent.

const MOIS: Record<string, number> = {
  janvier: 0, janv: 0, jan: 0,
  fevrier: 1, fev: 1, février: 1, févr: 1,
  mars: 2,
  avril: 3, avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6, juil: 6,
  aout: 7, août: 7,
  septembre: 8, sept: 8, sep: 8,
  octobre: 9, oct: 9,
  novembre: 10, nov: 10,
  decembre: 11, décembre: 11, dec: 11, déc: 11,
};

export type DateRange = { from: Date; to: Date };

function jour(year: number, month: number, day: number): DateRange | null {
  const from = new Date(year, month, day, 0, 0, 0, 0);
  // Rejette le 31 février : le constructeur Date déborde silencieusement sur
  // mars, et une recherche qui répond à côté sans le dire est un piège.
  if (from.getMonth() !== month || from.getDate() !== day) return null;
  return { from, to: new Date(year, month, day, 23, 59, 59, 999) };
}

function moisEntier(year: number, month: number): DateRange {
  return { from: new Date(year, month, 1, 0, 0, 0, 0), to: new Date(year, month + 1, 0, 23, 59, 59, 999) };
}

function anneeComplete(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Interprète la requête comme une date. Renvoie null dès qu'il y a le
 * moindre doute — la recherche textuelle prend alors le relais.
 */
export function parseDateQuery(query: string, now: Date): DateRange | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 12/03, 12/03/2026, 12-3-26, 12.03
  const numerique = q.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (numerique) {
    const day = Number(numerique[1]);
    const month = Number(numerique[2]) - 1;
    if (month < 0 || month > 11) return null;
    return jour(numerique[3] ? anneeComplete(Number(numerique[3])) : now.getFullYear(), month, day);
  }

  // « 12 mars », « 12 mars 2026 »
  const jourMois = q.match(/^(\d{1,2})\s+([a-zéûà]+)(?:\s+(\d{4}))?$/);
  if (jourMois) {
    const month = MOIS[jourMois[2]];
    if (month === undefined) return null;
    return jour(jourMois[3] ? Number(jourMois[3]) : now.getFullYear(), month, Number(jourMois[1]));
  }

  // « mars », « mars 2026 » — le mois entier, utile pour balayer une période.
  const seulMois = q.match(/^([a-zéûà]+)(?:\s+(\d{4}))?$/);
  if (seulMois) {
    const month = MOIS[seulMois[1]];
    if (month === undefined) return null;
    return moisEntier(seulMois[2] ? Number(seulMois[2]) : now.getFullYear(), month);
  }

  return null;
}
