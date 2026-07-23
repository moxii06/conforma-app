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
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "span", "font", "p", "br", "div", "mark", "img"];
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
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<(p|div)[^>]*>/gi, "");
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
