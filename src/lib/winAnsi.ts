// Rendre un texte encodable par les polices standard de pdf-lib.
//
// Helvetica & co. sont encodées en WinAnsi (CP1252). pdf-lib ne se contente
// pas d'ignorer un caractère hors table : il LÈVE UNE EXCEPTION, et toute la
// génération du document échoue.
//
// Ce n'est pas théorique. `(2100).toLocaleString("fr-FR")` produit
// « 2 100 » avec U+202F, l'espace insécable fine des milliers en typographie
// française — absente de WinAnsi. Autrement dit, toute facture de 1 000 €
// ou plus faisait planter la génération du PDF, ce qui est à peu près toute
// facture de formation réelle. Le même piège attend n'importe quel
// caractère collé depuis un traitement de texte dans un contrat.
//
// On normalise donc ce qui a un équivalent évident, et on remplace le reste
// par « ? » plutôt que d'échouer : un document avec un caractère approximatif
// est infiniment préférable à un document qui n'existe pas.

const REMPLACEMENTS: Record<string, string> = {
  " ": " ", // espace insécable fine (séparateur de milliers français)
  " ": " ", // espace fine
  " ": " ", // espace insécable
  " ": " ", // espace tabulaire
  "‑": "-", // trait d'union insécable
  "−": "-", // signe moins mathématique
  "�": "?", // caractère de remplacement (encodage abîmé en amont)
};

// La plage réellement encodable : Latin-1 imprimable, plus les caractères
// propres à CP1252 entre 0x80 et 0x9F (dont €, les guillemets typographiques
// et les tirets cadratins), que pdf-lib sait rendre.
const CP1252_EXTRAS =
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ" +
  "‘’“”•–—˜™š›œžŸ";

const EXTRAS = new Set([...CP1252_EXTRAS]);

function encodable(c: string): boolean {
  const code = c.codePointAt(0)!;
  // Tabulation et saut de ligne sont gérés en amont par les découpeurs de
  // texte ; on les laisse passer pour ne pas les transformer en « ? ».
  if (c === "\n" || c === "\t") return true;
  if (code >= 0x20 && code <= 0x7e) return true; // ASCII imprimable
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplément
  return EXTRAS.has(c);
}

export function toWinAnsi(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    const remplace = REMPLACEMENTS[c];
    if (remplace !== undefined) {
      sortie += remplace;
      continue;
    }
    sortie += encodable(c) ? c : "?";
  }
  return sortie;
}
