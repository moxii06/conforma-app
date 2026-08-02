import { describe, expect, it } from "vitest";
import { plainTextToHtml, looksLikeHtml, ensureHtml } from "./plainTextToHtml";

// Cette fonction est porteuse dans cinq chemins, dont la génération de
// contrats — et elle n'avait aucun test. C'est le profil qui casse en
// silence : elle ne lèvera jamais d'exception, elle produira juste un
// contrat mal découpé que personne ne relira avant l'envoi.

describe("plainTextToHtml", () => {
  it("fait un paragraphe par bloc séparé d'une ligne vide", () => {
    expect(plainTextToHtml("Article 1.\n\nArticle 2.")).toBe("<p>Article 1.</p><p>Article 2.</p>");
  });

  it("garde un saut de ligne simple à l'intérieur d'un paragraphe", () => {
    // Une adresse tient sur deux lignes sans être deux paragraphes.
    expect(plainTextToHtml("5 rue de la Paix\n75002 Paris")).toBe("<p>5 rue de la Paix<br>75002 Paris</p>");
  });

  it("échappe ce qui serait interprété comme du balisage", () => {
    // Un contrat qui stipule « chiffre d'affaires > 2 M€ » ne doit pas
    // devenir du HTML cassé.
    expect(plainTextToHtml("CA > 2 M€ & marge < 10 %")).toBe("<p>CA &gt; 2 M€ &amp; marge &lt; 10 %</p>");
  });

  it("ne casse pas les balises de fusion", () => {
    // {{...}} doit survivre intact : c'est lui qui porte le nom du
    // stagiaire jusqu'à la génération.
    expect(plainTextToHtml("Entre {{contact.firstName}} et l'organisme.")).toContain("{{contact.firstName}}");
  });

  it("absorbe plusieurs lignes vides consécutives sans produire de vide", () => {
    expect(plainTextToHtml("A.\n\n\n\nB.")).toBe("<p>A.</p><p>B.</p>");
  });
});

describe("looksLikeHtml", () => {
  it("reconnaît ce que produit plainTextToHtml", () => {
    expect(looksLikeHtml(plainTextToHtml("Article 1.\n\nArticle 2."))).toBe(true);
  });

  it("reconnaît le balisage de l'éditeur riche", () => {
    expect(looksLikeHtml("<p>Texte en <strong>gras</strong></p>")).toBe(true);
  });

  it("ne prend pas un chevron de contrat pour du balisage", () => {
    // LE piège : « chiffre d'affaires > 2 M€ » n'est pas du HTML. Le
    // confondre convertirait un contrat en texte brut en « déjà HTML »,
    // et il s'afficherait en un seul bloc illisible.
    expect(looksLikeHtml("Chiffre d'affaires > 2 M€, marge < 10 %.")).toBe(false);
    expect(looksLikeHtml("Article 1 — Objet\n\nLa formation se tiendra…")).toBe(false);
  });
});

describe("ensureHtml", () => {
  it("convertit du texte brut", () => {
    expect(ensureHtml("A.\n\nB.")).toBe("<p>A.</p><p>B.</p>");
  });

  it("laisse le HTML intact plutôt que de le ré-échapper", () => {
    // Sans ce garde-fou, rouvrir un brouillon deux fois afficherait
    // « &lt;p&gt; » en toutes lettres dans le contrat.
    const html = "<p>Article <strong>1</strong></p>";
    expect(ensureHtml(html)).toBe(html);
    expect(ensureHtml(ensureHtml(html))).toBe(html);
  });
});
