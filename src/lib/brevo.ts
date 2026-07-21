// Transactional email — platform-level, same reasoning as src/lib/ai.ts:
// one Conforma-operated Brevo account sends for every tenant, rather than
// each organization bringing their own Brevo API key. The sender address
// has to be a domain verified in Brevo (can't send arbitrary "from"
// addresses), so the organization's identity is carried via the sender
// *name* instead — recipients see "Formations Nova" as the sender name,
// while the underlying verified address stays Conforma's own. replyTo can
// point at a real staff member so a reply still reaches a human.
function isConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendTransactionalEmail(params: {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  senderName: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error("Envoi d'email indisponible — BREVO_API_KEY/BREVO_SENDER_EMAIL non configurés côté serveur.");
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: params.senderName },
      to: [{ email: params.to, name: params.toName }],
      ...(params.replyTo ? { replyTo: { email: params.replyTo } } : {}),
      subject: params.subject,
      textContent: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.message as string | undefined;
    throw new Error(message ? `Erreur Brevo : ${message}` : `Erreur Brevo (HTTP ${res.status}).`);
  }
}

export { isConfigured as isBrevoConfigured };
