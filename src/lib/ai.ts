// AI is a Conforma-operated feature, not something each organization brings
// their own key for — one OPENAI_API_KEY (platform env var, billed to
// Conforma) powers it for every tenant, the same "platform owns the app
// credentials, tenants just use the feature" pattern as the Gmail OAuth
// client (GOOGLE_CLIENT_ID/SECRET). No per-org IntegrationCredential
// lookup, unlike the other /integrations providers.
//
// Cost-control note: every organization draws on the same OpenAI account.
// There's no per-tenant usage quota or rate limiting here yet — a single
// heavy user could run up the whole platform's AI bill. Worth adding
// (e.g. a monthly call cap per organization) before opening this to real
// paying customers at any scale.
const OPENAI_MODEL = "gpt-4o-mini";

function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

async function chatCompletion(
  apiKey: string,
  params: { system: string; user: string; json?: boolean; temperature?: number }
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      temperature: params.temperature ?? 0.5,
      ...(params.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message as string | undefined;
    throw new Error(message ? `Erreur OpenAI : ${message}` : `Erreur OpenAI (HTTP ${res.status}).`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Réponse vide de l'IA.");
  return text;
}

const NOT_CONFIGURED_ERROR =
  "Rédaction assistée par IA momentanément indisponible — la clé OpenAI de la plateforme n'est pas configurée côté serveur (OPENAI_API_KEY).";

// Drafts a reply to an inbound email — used by
// /api/inbox/messages/[id]/ai-draft. The draft is only ever a suggestion
// dropped into the reply composer's textarea; sending is still a separate,
// explicit human action (see EmailReplyComposer).
export async function draftEmailReply(
  params: { fromName: string | null; fromAddress: string; subject: string; body: string; organizationName: string }
): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  const sender = params.fromName ? `${params.fromName} <${params.fromAddress}>` : params.fromAddress;
  return chatCompletion(apiKey, {
    system:
      "Tu rédiges des brouillons de réponses email professionnelles, concises et courtoises en français, pour un organisme de formation professionnelle (OFP). Réponds uniquement avec le texte du brouillon de réponse — pas de formule d'introduction du type « Voici un brouillon », pas de commentaire, pas d'objet, juste le corps du message prêt à relire et envoyer.",
    user: `Email reçu de ${sender} :\nObjet : ${params.subject}\n\n${params.body}\n\nRédige un brouillon de réponse au nom de ${params.organizationName}.`,
    temperature: 0.5,
  });
}

export type ProspectExtraction = {
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
};

// Extracts prospect details from an unmatched inbound email's content
// (body/signature) — goes beyond the non-AI header-parsing pre-fill
// (InboxMessageActions' splitName()) which can only ever get a display
// name, never a phone number or company. Used by
// /api/inbox/messages/[id]/ai-extract.
export async function extractProspectInfo(emailBody: string): Promise<ProspectExtraction> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  const raw = await chatCompletion(apiKey, {
    system:
      'Tu extrais des informations de contact depuis le corps d\'un email (souvent une signature en bas de message). Réponds UNIQUEMENT avec un objet JSON valide de la forme {"firstName": "", "lastName": "", "phone": "", "companyName": ""} — chaîne vide pour tout champ que tu ne peux pas déterminer avec confiance. Aucun texte en dehors du JSON.',
    user: emailBody.slice(0, 3000),
    json: true,
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(raw);
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
    };
  } catch {
    throw new Error("Réponse de l'IA illisible — réessayez.");
  }
}
