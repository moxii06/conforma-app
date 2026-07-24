import { prisma } from "@/lib/prisma";
import { richTextToPlainText } from "@/lib/richText";

// Client feedback: every plain-text composer (complaint reply, CRM message,
// inbox reply, new dossier/contact email, convocation) should be able to
// append the sender's own signature via a checkbox — resolved server-side
// from the authenticated user rather than trusted from the client, so it's
// always the current signature and can't be spoofed. The two rich-text
// composers (SendDocumentDialog/SendProspectDocumentDialog) already receive
// signatureHtml as a page-level prop and append the raw HTML themselves;
// this is the plain-text counterpart for everywhere else.
export async function getPlainTextSignature(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, emailSignature: true } });
  if (!user) return "";
  const html = user.emailSignature ?? `Cordialement,<br>${user.name}`;
  return richTextToPlainText(html).trim();
}

export function appendSignature(body: string, signature: string) {
  return signature ? `${body}\n\n${signature}` : body;
}
