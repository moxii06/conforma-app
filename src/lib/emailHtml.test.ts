import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml, contientImagesDistantes, retablirImagesDistantes } from "./emailHtml";

describe("sanitizeEmailHtml", () => {
  it("garde la mise en page en tableaux, qui est le squelette de tout e-mail", () => {
    const html =
      '<table width="600" cellpadding="0" bgcolor="#ffffff"><tr><td align="center" style="padding:20px">Bonjour</td></tr></table>';
    const propre = sanitizeEmailHtml(html);
    expect(propre).toContain("<table");
    expect(propre).toContain('width="600"');
    expect(propre).toContain('bgcolor="#ffffff"');
    expect(propre).toContain('style="padding:20px"');
  });

  it("garde les paragraphes — c'est ce qui manquait quand le corps était aplati en texte", () => {
    const propre = sanitizeEmailHtml("<p>Premier</p><p>Second</p>");
    expect(propre).toBe("<p>Premier</p><p>Second</p>");
  });

  it("retire les scripts ET leur contenu", () => {
    const propre = sanitizeEmailHtml('<p>Bonjour</p><script>alert("xss")</script>');
    expect(propre).not.toContain("script");
    expect(propre).not.toContain("alert");
  });

  it("retire le CSS au lieu de l'afficher comme du texte", () => {
    const propre = sanitizeEmailHtml("<style>.a{color:red}</style><p>Bonjour</p>");
    expect(propre).not.toContain("color:red");
    expect(propre).toBe("<p>Bonjour</p>");
  });

  it("retire les gestionnaires d'événement", () => {
    const propre = sanitizeEmailHtml('<div onclick="voler()" onmouseover="x()">Texte</div>');
    expect(propre).not.toContain("onclick");
    expect(propre).not.toContain("onmouseover");
    expect(propre).toContain("Texte");
  });

  it("retire les cadres et les formulaires", () => {
    const propre = sanitizeEmailHtml(
      '<iframe src="https://x.test"></iframe><form action="https://x.test"><input name="mdp"></form><p>Reste</p>',
    );
    expect(propre).not.toContain("iframe");
    expect(propre).not.toContain("<form");
    expect(propre).not.toContain("<input");
    expect(propre).toContain("Reste");
  });

  it("refuse un lien javascript: mais garde un lien normal", () => {
    const propre = sanitizeEmailHtml('<a href="javascript:alert(1)">Piège</a><a href="https://urssaf.fr">Vrai</a>');
    expect(propre).not.toContain("javascript:");
    expect(propre).toContain('href="https://urssaf.fr"');
  });

  it("ouvre les liens dans un nouvel onglet, avec noopener", () => {
    const propre = sanitizeEmailHtml('<a href="https://exemple.test">Lien</a>');
    expect(propre).toContain('target="_blank"');
    expect(propre).toContain("noopener");
  });

  // Le pixel espion : le charger signalerait l'ouverture à l'expéditeur.
  it("désamorce les images distantes sans les perdre", () => {
    const propre = sanitizeEmailHtml('<img src="https://tracker.test/pixel.gif" width="1" alt="">');
    // `data-src=` contient « src= » : on vérifie l'attribut, pas la sous-chaîne.
    expect(propre).not.toMatch(/\ssrc=/);
    expect(propre).toContain('data-src="https://tracker.test/pixel.gif"');
    expect(propre).toContain('width="1"');
    expect(contientImagesDistantes(propre)).toBe(true);
  });

  it("laisse passer une image déjà embarquée : elle ne joint personne", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    const propre = sanitizeEmailHtml(`<img src="${dataUri}">`);
    expect(propre).toContain(`src="${dataUri}"`);
    expect(contientImagesDistantes(propre)).toBe(false);
  });

  it("rétablit exactement ce qui avait été mis de côté", () => {
    const propre = sanitizeEmailHtml('<img src="https://cdn.test/logo.png" alt="Logo">');
    const retabli = retablirImagesDistantes(propre);
    expect(retabli).toContain('src="https://cdn.test/logo.png"');
    expect(retabli).not.toContain("data-src");
    expect(contientImagesDistantes(retabli)).toBe(false);
  });

  it("ne signale pas d'images à afficher quand il n'y en a pas", () => {
    expect(contientImagesDistantes(sanitizeEmailHtml("<p>Texte seul</p>"))).toBe(false);
  });

  it("survit à un corps vide", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });
});
