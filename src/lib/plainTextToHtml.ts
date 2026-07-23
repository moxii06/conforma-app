// Templates are stored as plain text (see mergeTemplate.ts — "\n\n" between
// paragraphs) but the send dialogs now edit everything through
// RichTextEditor's contentEditable, which needs real HTML. Client-safe (no
// sanitize-html — that's a server-only dependency), used purely to seed the
// editor right after a merge-template preview fetch.
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
