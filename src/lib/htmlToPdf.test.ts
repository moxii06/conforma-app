import { describe, expect, it } from "vitest";
import { splitIntoBlocks, splitIntoParagraphs, parseInlineRuns } from "./htmlToPdf";

// Le découpage est le seuil de vérité de tout l'export : le PDF et le .docx
// partent tous deux de là. Un bouton « liste à puces » dans l'éditeur ne vaut
// que si la puce arrive jusqu'au fichier envoyé au client — ces tests portent
// exactement sur ce que produit `document.execCommand` dans un navigateur.

describe("splitIntoBlocks — paragraphes", () => {
  it("coupe sur <p> et <div>, sans garder les balises de structure", () => {
    const blocks = splitIntoBlocks("<p>Article 1</p><div>Article 2</div>");
    expect(blocks).toEqual([
      { html: "Article 1", depth: 0 },
      { html: "Article 2", depth: 0 },
    ]);
  });

  it("garde le balisage inline intact", () => {
    const blocks = splitIntoBlocks("<p>Le <b>Bénéficiaire</b> déclare</p>");
    expect(blocks[0].html).toBe("Le <b>Bénéficiaire</b> déclare");
  });

  it("convertit <br> en saut de ligne dans le même bloc", () => {
    const blocks = splitIntoBlocks("<p>Ligne 1<br>Ligne 2</p>");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].html).toBe("Ligne 1\nLigne 2");
  });

  it("ignore les blocs vides", () => {
    expect(splitIntoBlocks("<p>A</p><p></p><p>   </p><p>B</p>")).toHaveLength(2);
  });
});

describe("splitIntoBlocks — listes", () => {
  it("rend un bloc par élément, avec sa puce", () => {
    const blocks = splitIntoBlocks("<ul><li>Un</li><li>Deux</li></ul>");
    expect(blocks).toEqual([
      { html: "Un", depth: 1, list: { kind: "bullet", marker: "•" } },
      { html: "Deux", depth: 1, list: { kind: "bullet", marker: "•" } },
    ]);
  });

  it("numérote une liste ordonnée", () => {
    const blocks = splitIntoBlocks("<ol><li>Premier</li><li>Deuxième</li><li>Troisième</li></ol>");
    expect(blocks.map((b) => b.list?.marker)).toEqual(["1.", "2.", "3."]);
    expect(blocks.every((b) => b.list?.kind === "ordered")).toBe(true);
  });

  it("repart de 1 dans une sous-liste, et rend la profondeur", () => {
    const blocks = splitIntoBlocks("<ol><li>A<ol><li>A1</li><li>A2</li></ol></li><li>B</li></ol>");
    expect(blocks).toEqual([
      { html: "A", depth: 1, list: { kind: "ordered", marker: "1." } },
      { html: "A1", depth: 2, list: { kind: "ordered", marker: "1." } },
      { html: "A2", depth: 2, list: { kind: "ordered", marker: "2." } },
      { html: "B", depth: 1, list: { kind: "ordered", marker: "2." } },
    ]);
  });

  it("mélange puces et numéros selon la liste englobante", () => {
    const blocks = splitIntoBlocks("<ul><li>Puce<ol><li>Numéro</li></ol></li></ul>");
    expect(blocks.map((b) => b.list?.kind)).toEqual(["bullet", "ordered"]);
  });

  it("accepte un <li> non fermé — du HTML valide, que les navigateurs produisent", () => {
    const blocks = splitIntoBlocks("<ul><li>Un<li>Deux</ul>");
    expect(blocks.map((b) => b.html)).toEqual(["Un", "Deux"]);
  });

  it("ne coupe pas un élément que Chrome enveloppe dans un <div>", () => {
    // Chrome produit parfois <li><div>texte</div></li> après un retour à la
    // ligne : sans ce cas, l'élément ressortait en deux blocs dont un sans puce.
    const blocks = splitIntoBlocks("<ul><li><div>Un seul élément</div></li></ul>");
    expect(blocks).toEqual([{ html: "Un seul élément", depth: 1, list: { kind: "bullet", marker: "•" } }]);
  });

  it("garde le texte autour de la liste comme paragraphes ordinaires", () => {
    const blocks = splitIntoBlocks("<p>Avant</p><ul><li>Item</li></ul><p>Après</p>");
    expect(blocks.map((b) => [b.html, b.depth, b.list?.marker ?? null])).toEqual([
      ["Avant", 0, null],
      ["Item", 1, "•"],
      ["Après", 0, null],
    ]);
  });

  it("conserve le gras à l'intérieur d'un élément de liste", () => {
    const blocks = splitIntoBlocks("<ul><li><b>Durée</b> : 14 heures</li></ul>");
    expect(parseInlineRuns(blocks[0].html).map((r) => [r.text, r.bold])).toEqual([
      ["Durée", true],
      [" : 14 heures", false],
    ]);
  });
});

describe("splitIntoBlocks — titres", () => {
  it("retient le niveau du titre", () => {
    const blocks = splitIntoBlocks("<h1>CONTRAT</h1><h2>Article 1 — Objet</h2><p>Texte.</p>");
    expect(blocks).toEqual([
      { html: "CONTRAT", depth: 0, heading: 1 },
      { html: "Article 1 — Objet", depth: 0, heading: 2 },
      { html: "Texte.", depth: 0 },
    ]);
  });

  it("ne contamine pas le paragraphe suivant", () => {
    const blocks = splitIntoBlocks("<h2>Article 2</h2><p>Le Bénéficiaire s'engage.</p><p>Suite.</p>");
    expect(blocks.map((b) => b.heading ?? null)).toEqual([2, null, null]);
  });

  it("traite h3 à h6 comme un titre de second niveau", () => {
    // L'export ne connaît que deux niveaux ; mieux vaut un titre dégradé
    // qu'un titre perdu en texte courant.
    expect(splitIntoBlocks("<h3>Sous-article</h3>")[0].heading).toBe(2);
  });

  it("laisse un paragraphe ordinaire sans niveau", () => {
    expect(splitIntoBlocks("<p>Texte.</p>")[0].heading).toBeUndefined();
  });
});

describe("splitIntoBlocks — encadré et tableau", () => {
  it("marque un <blockquote> comme encadré", () => {
    const blocks = splitIntoBlocks("<p>Avant</p><blockquote><p>Délai de rétractation : 14 jours.</p></blockquote><p>Après</p>");
    expect(blocks.map((b) => [b.html, b.callout ?? false])).toEqual([
      ["Avant", false],
      ["Délai de rétractation : 14 jours.", true],
      ["Après", false],
    ]);
  });

  it("rend un tableau en lignes de cellules, en-tête repéré", () => {
    const blocks = splitIntoBlocks(
      "<table><tr><th>Intitulé</th><th>Durée</th></tr><tr><td>Anglais B1</td><td>14 h</td></tr></table>",
    );
    expect(blocks).toEqual([
      { html: "", depth: 0, table: { header: true, rows: [["Intitulé", "Durée"], ["Anglais B1", "14 h"]] } },
    ]);
  });

  it("reconnaît un tableau sans ligne d'en-tête", () => {
    const t = splitIntoBlocks("<table><tr><td>A</td><td>B</td></tr></table>")[0].table;
    expect(t?.header).toBe(false);
    expect(t?.rows).toEqual([["A", "B"]]);
  });

  it("garde le balisage inline dans une cellule", () => {
    const t = splitIntoBlocks("<table><tr><td><b>Prix</b> TTC</td></tr></table>")[0].table;
    expect(t?.rows[0][0]).toBe("<b>Prix</b> TTC");
  });

  it("reprend le texte qui suit le tableau", () => {
    const blocks = splitIntoBlocks("<p>Avant</p><table><tr><td>X</td></tr></table><p>Après</p>");
    expect(blocks.map((b) => b.html)).toEqual(["Avant", "", "Après"]);
    expect(blocks[1].table?.rows).toEqual([["X"]]);
  });

  it("survit à un <table> jamais fermé sans avaler le reste en silence", () => {
    const blocks = splitIntoBlocks("<p>Avant</p><table><tr><td>X</td></tr>");
    expect(blocks[0].html).toBe("Avant");
    expect(blocks[1].table?.rows).toEqual([["X"]]);
  });
});

describe("splitIntoParagraphs", () => {
  it("reste la vue « texte seul » du même découpage", () => {
    const html = "<p>Intro</p><ul><li>Un</li><li>Deux</li></ul>";
    expect(splitIntoParagraphs(html)).toEqual(["Intro", "Un", "Deux"]);
    expect(splitIntoParagraphs(html)).toEqual(splitIntoBlocks(html).map((b) => b.html));
  });
});
