import sanitizeHtml from "sanitize-html";

// Le HTML d'un e-mail REÇU. Rien à voir avec sanitizeRichText.
//
// richText.ts assainit ce que NOTRE éditeur produit : une liste blanche
// étroite suffit, on connaît la barre d'outils. Ici, l'auteur est l'URSSAF,
// un OPCO ou une campagne marketing, et le HTML d'e-mail est un monde à part —
// tables imbriquées sur quatre niveaux, styles en attribut, largeurs en
// pixels. Passer un e-mail dans la liste blanche de l'éditeur ne laisse que
// du texte : c'est exactement ce qui se produisait, et pourquoi un message
// s'affichait en un seul pavé sans paragraphes.
//
// La sécurité ne repose donc PAS sur l'étroitesse de la liste. Elle repose sur
// deux barrières indépendantes :
//
//  1. Ici : plus aucun script, cadre, formulaire ni gestionnaire d'événement
//     n'est enregistré en base. Ce qui n'est pas stocké ne peut pas fuir.
//  2. À l'affichage : le message est rendu dans une iframe `sandbox` sans
//     allow-scripts ni allow-same-origin. Même un HTML hostile qui aurait
//     franchi la première barrière n'y exécute rien et ne voit pas la session.
//
// Une seule des deux aurait suffi sur le papier. Les deux sont là parce que
// c'est du contenu écrit par des inconnus, rendu dans le navigateur d'un
// organisme connecté à ses données clients.

// prettier-ignore
const BALISES_AUTORISEES = [
  // Structure et texte
  "p", "div", "span", "br", "hr", "b", "strong", "i", "em", "u", "s", "strike",
  "sub", "sup", "small", "big", "font", "center", "mark", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  // Le squelette de tout e-mail HTML : sans ces balises, une mise en page en
  // tableaux — c'est-à-dire la quasi-totalité des e-mails — s'effondre en une
  // colonne de texte.
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "a", "img",
];

// Ce qui n'est PAS dans la liste et qui compte : script, style, link, meta,
// base, iframe, frame, object, embed, applet, form, input, button, select,
// textarea, svg, math. sanitize-html les retire par défaut du seul fait de la
// liste blanche ; `style` et `script` sont en plus vidés de leur contenu (voir
// nonTextTags), sans quoi le CSS ou le code se retrouverait affiché en clair
// au milieu du message — un défaut déjà corrigé une fois ici.

/**
 * Assainit le HTML d'un e-mail entrant, pour stockage puis affichage.
 *
 * Les images DISTANTES sont désamorcées : leur `src` devient `data-src`. Ce
 * n'est pas une précaution de sécurité mais de vie privée — le pixel invisible
 * d'un e-mail marketing signale l'ouverture, l'heure et l'adresse IP dès que
 * le navigateur va le chercher. Les charger sans le dire reviendrait à
 * accuser réception à l'expéditeur au nom de l'organisme. L'écran propose de
 * les afficher ; tant qu'on ne l'a pas demandé, rien ne part.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: BALISES_AUTORISEES,
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "dir", "lang", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "data-src", "alt", "width", "height", "border", "hspace", "vspace"],
      table: ["width", "height", "border", "cellpadding", "cellspacing", "bgcolor", "background"],
      td: ["width", "height", "colspan", "rowspan", "bgcolor", "background", "nowrap"],
      th: ["width", "height", "colspan", "rowspan", "bgcolor", "background", "nowrap"],
      tr: ["height", "bgcolor"],
      col: ["width", "span"],
      colgroup: ["width", "span"],
      font: ["color", "face", "size"],
      ol: ["start", "type"],
      // Aucun `on*` n'est listé nulle part : les gestionnaires d'événement
      // disparaissent du seul fait de cette liste, pas d'un filtre à part.
    },
    // Les styles en attribut sont ce qui donne son allure à un e-mail. On les
    // garde tels quels : ils ne s'appliqueront qu'à l'intérieur de l'iframe,
    // donc ils ne peuvent ni déborder sur l'application ni la recouvrir.
    allowedStyles: undefined,
    // http(s) et mailto/tel pour les liens ; les images inline en data: URI
    // sont admises (une signature scannée en est souvent une), mais pas les
    // schémas exécutables.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: true,
    // Vider le contenu, pas seulement la balise : sinon le CSS d'un e-mail
    // s'affiche comme du texte au début du message.
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "title", "head"],
    transformTags: {
      // Un lien d'e-mail ouvre un site tiers : nouvel onglet, et surtout
      // noopener — sans lui, la page ouverte peut réécrire l'onglet d'origine.
      a: (nomBalise, attribs) => ({
        tagName: nomBalise,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (nomBalise, attribs) => {
        const src = attribs.src ?? "";
        // Une image déjà embarquée (data:) ne joint personne : elle reste.
        // Une image `cid:` désigne une pièce jointe du message que nous
        // n'extrayons pas — elle ne s'affichera pas, autant la retirer.
        if (src.startsWith("data:")) return { tagName: nomBalise, attribs };
        const { src: _retire, ...reste } = attribs;
        return { tagName: nomBalise, attribs: { ...reste, "data-src": src } };
      },
    },
  });
}

/** Y a-t-il des images en attente d'accord ? Décide l'affichage du bandeau. */
export function contientImagesDistantes(html: string): boolean {
  return /<img[^>]+data-src=/i.test(html);
}

/**
 * Rétablit les images distantes — appelé seulement sur demande explicite.
 *
 * Volontairement l'exacte inverse de la transformation ci-dessus, et rien de
 * plus : elle ne réintroduit pas d'attribut, elle renomme celui qui avait été
 * mis de côté.
 */
export function retablirImagesDistantes(html: string): string {
  return html.replace(/(<img[^>]*?)\sdata-src=/gi, "$1 src=");
}
