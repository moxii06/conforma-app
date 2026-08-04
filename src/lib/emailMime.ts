import MailComposer from "nodemailer/lib/mail-composer";

// Shared by sendGmailReply (which needs a raw RFC822 buffer for the Gmail
// API's `raw` field — there is no other way to attach files or send HTML
// through that endpoint) and, indirectly, by nodemailer's own SMTP
// transport (imapSync.ts's sendImapReply passes the same shape straight to
// transporter.sendMail, which builds an equivalent message internally).
// MailComposer is nodemailer's own MIME builder — reusing it here instead
// of hand-rolling multipart/mixed means both providers stay behind one
// tested implementation instead of two.
export type OutgoingAttachment = { filename: string; content: Buffer; contentType?: string };

export async function buildRawMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: OutgoingAttachment[];
}): Promise<Buffer> {
  const composer = new MailComposer({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.attachments,
  });

  return new Promise((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}
