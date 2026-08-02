// Templates are stored as plain text (see mergeTemplate.ts — "\n\n" between
// paragraphs) but the send dialogs now edit everything through
// RichTextEditor's contentEditable, which needs real HTML. Client-safe (no
// sanitize-html — that's a server-only dependency), used purely to seed the
// editor right after a merge-template preview fetch.
/**
 * Ce texte est-il déjà du HTML produit par l'éditeur ?
 *
 * Nécessaire depuis que l'écran de création enregistre du HTML : un
 * brouillon commencé avant porte encore du texte brut. Le rouvrir sans
 * distinguer les deux afficherait soit un contrat en un seul bloc, soit
 * des balises `<p>` en toutes lettres au milieu des articles.
 *
 * Le test porte sur les balises de structure que produit réellement
 * plainTextToHtml — pas sur « ça contient un chevron », qu'un contrat
 * mentionnant « chiffre d'affaires > 2 M€ » déclencherait à tort.
 */
export function looksLikeHtml(text: string): boolean {
  return /<(p|br|div|h[1-6]|ul|ol|li|strong|em|u|span)\b[^>]*>/i.test(text);
}

/** Convertit du texte brut en HTML, sauf s'il l'est déjà. */
export function ensureHtml(text: string): string {
  return looksLikeHtml(text) ? text : plainTextToHtml(text);
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
