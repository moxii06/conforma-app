import sanitizeHtml from "sanitize-html";

// Narrow allowlist matching exactly what RichTextEditor's toolbar can
// produce (bold/italic/highlight/font family) — this is staff-authored
// content that ends up rendered in another person's browser (a learner's
// mon-espace, an email), so it's a real stored-XSS surface even though the
// author is trusted, not just cosmetic cleanup.
// "img" is here only for the email signature's optional logo (uploaded via
// /profil, see SignatureEditor) — the RichTextEditor toolbar never exposes
// image insertion for the document-body editor, since generatePdfFromRichText
// (htmlToPdf.ts) is text-only and would silently drop it. allowedSchemesByTag
// keeps img src to https (blocks data: URIs and anything else), since this
// HTML can end up rendered in another user's inbox/browser.
// ul/ol/li : la liste blanche décide seule de ce qui survit à
// l'enregistrement. Sans elles, les boutons « liste » de la barre d'outils
// auraient produit une liste à l'écran, puis un paragraphe unique aux
// éléments collés bout à bout dès le rechargement du brouillon — un bug
// invisible au moment de la saisie, et visible seulement chez le client.
// prettier-ignore
const ALLOWED_TAGS = [
  "b", "strong", "i", "em", "u", "span", "font", "p", "br", "div", "mark", "img",
  "ul", "ol", "li",
  // Titres d'article, encadré d'avertissement, tableau récapitulatif et bloc
  // signatures. Chaque balise ajoutée ici l'est APRÈS que le PDF et le .docx
  // savent la rendre : l'inverse produirait une mise en forme visible à
  // l'écran et absente du fichier envoyé au client.
  "h1", "h2", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
];
const ALLOWED_STYLES = {
  "*": {
    color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
    "background-color": [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
    "font-family": [/^[\w\s,'"-]+$/],
    "font-weight": [/^(bold|normal|[1-9]00)$/],
    "font-style": [/^(italic|normal)$/],
    "text-decoration": [/^(underline|none)$/],
    "max-height": [/^\d+px$/],
    "vertical-align": [/^(middle|top|bottom)$/],
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      span: ["style"],
      font: ["face", "style"],
      p: ["style"],
      div: ["style"],
      li: ["style"],
      th: ["style", "colspan", "rowspan"],
      td: ["style", "colspan", "rowspan"],
      img: ["src", "alt", "style"],
    },
    allowedStyles: ALLOWED_STYLES,
    allowedSchemesByTag: { img: ["https"] },
    disallowedTagsMode: "discard",
  });
}

// Plain-text fallback for contexts that can't render HTML (e.g. the email
// "text" alternative body) — block-level tags become line breaks first,
// since sanitize-html's tag-stripping alone would run paragraphs together
// with no separator.
export function richTextToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    // Les titres, éléments de liste et cellules comptent aussi comme des
    // coupures : sans eux, une liste de huit engagements ressortait en une
    // seule phrase dans la version texte de l'email.
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<\/(th|td)>/gi, " · ")
    .replace(/<(p|div|h[1-6]|li|tr|th|td|blockquote)[^>]*>/gi, "");
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
