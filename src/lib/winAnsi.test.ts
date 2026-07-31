import { describe, expect, it } from "vitest";
import { toWinAnsi } from "./winAnsi";

// pdf-lib LÈVE une exception sur un caractère hors WinAnsi : ce qui n'est
// pas assaini ici ne produit pas un document dégradé, il ne produit aucun
// document. Chaque cas ci-dessous a fait, ou aurait fait, échouer une
// génération réelle.

describe("toWinAnsi", () => {
  it("remplace l'espace insécable fine des milliers français", () => {
    // Le cas qui a cassé la première facture à quatre chiffres :
    // toLocaleString("fr-FR") produit U+202F, absent de WinAnsi. Toute
    // facture de 1 000 € ou plus échouait.
    const montant = (2100).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    expect(montant).toContain(" ");
    expect(toWinAnsi(montant)).toBe("2 100,00");
    expect(toWinAnsi(montant)).not.toContain(" ");
  });

  it("garde les accents et les caractères français courants", () => {
    const s = "Sécurité incendie — déclaration d'activité n° 11 75 12345 75";
    expect(toWinAnsi(s)).toBe(s);
  });

  it("garde l'euro et les guillemets typographiques", () => {
    expect(toWinAnsi("600,00 € « devis » l'objet")).toBe("600,00 € « devis » l'objet");
    expect(toWinAnsi("“anglais” ’apostrophe")).toBe("“anglais” ’apostrophe");
  });

  it("remplace un caractère d'encodage abîmé plutôt que d'échouer", () => {
    expect(toWinAnsi("Sécurité� incendie")).toBe("Sécurité? incendie");
  });

  it("remplace ce qui n'a aucun équivalent, sans perdre le reste", () => {
    // Un emoji collé depuis un email, une lettre grecque dans un intitulé :
    // le document doit sortir, quitte à porter un « ? ».
    expect(toWinAnsi("Formation 🎓 niveau α")).toBe("Formation ? niveau ?");
  });

  it("préserve les sauts de ligne, que les découpeurs de texte gèrent", () => {
    expect(toWinAnsi("5 rue de la Paix\n75002 Paris")).toBe("5 rue de la Paix\n75002 Paris");
  });

  it("normalise les autres espaces exotiques", () => {
    expect(toWinAnsi("a b c")).toBe("a b c");
  });
});
