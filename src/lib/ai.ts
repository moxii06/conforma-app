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

export type EmailIntent = "follow_up" | "payment_reminder" | "quote_follow_up" | "custom";

const INTENT_INSTRUCTIONS: Record<EmailIntent, string> = {
  follow_up: "Rédige un email de relance commerciale amicale pour reprendre contact avec ce prospect et faire avancer son dossier.",
  payment_reminder: "Rédige un email de relance de paiement, ferme mais courtois, rappelant le montant dû et la référence de la facture.",
  quote_follow_up: "Rédige un email de relance sur un devis envoyé, pour savoir si le prospect a des questions et encourager une réponse.",
  custom: "Rédige un email à partir de l'instruction ci-dessous.",
};

// Fresh (non-reply) email drafting for the unified CRM contact record's
// intent-based composer — distinct from draftEmailReply, which replies to
// an existing inbound thread. The draft always needs an explicit human
// review + send action (see IntentEmailComposer), same as draftEmailReply.
export async function draftIntentEmail(params: {
  intent: EmailIntent;
  contactFirstName: string;
  organizationName: string;
  context?: string;
  instruction?: string;
}): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  const instruction = params.intent === "custom" && params.instruction ? params.instruction : INTENT_INSTRUCTIONS[params.intent];

  return chatCompletion(apiKey, {
    system:
      "Tu rédiges des emails professionnels, concis et courtois en français, pour un organisme de formation professionnelle (OFP), à destination d'un prospect ou client nommé. Réponds uniquement avec le texte du corps de l'email — pas de formule d'introduction, pas d'objet, pas de commentaire, juste le message prêt à relire et envoyer.",
    user: `Destinataire : ${params.contactFirstName}\nExpéditeur : ${params.organizationName}\n${params.context ? `Contexte : ${params.context}\n` : ""}\nInstruction : ${instruction}`,
    temperature: 0.6,
  });
}

// Convocation drafting for the Planning session detail page's invite
// composer — an alternative to the fixed template createSessionInvitation()
// falls back to when no custom subject/body is supplied. Always just a
// suggestion dropped into the composer's editable fields, same
// review-before-send pattern as every other AI draft in this app.
export async function draftConvocationEmail(params: {
  contactFirstName: string;
  organizationName: string;
  courseTitle: string;
  dateLabel: string;
  timeLabel: string;
  details: string;
}): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  return chatCompletion(apiKey, {
    system:
      "Tu rédiges des emails de convocation à une session de formation, professionnels et clairs, en français, pour un organisme de formation professionnelle (OFP). Réponds uniquement avec le texte du corps de l'email — pas de formule d'introduction, pas d'objet, pas de commentaire, juste le message prêt à relire et envoyer. Le message doit mentionner la formation, la date, l'heure, et les modalités pratiques fournies.",
    user: `Destinataire : ${params.contactFirstName}\nExpéditeur : ${params.organizationName}\nFormation : ${params.courseTitle}\nDate : ${params.dateLabel} à ${params.timeLabel}\nModalités pratiques : ${params.details}`,
    temperature: 0.5,
  });
}

export type RgpdRequestType = "access" | "erasure" | "portability" | "rectification";

export type RgpdClassification = {
  isRightsRequest: boolean;
  requestType: RgpdRequestType | null;
  reasoning: string;
};

const RGPD_REQUEST_TYPES = ["access", "erasure", "portability", "rectification"];

// Runs automatically on every newly-synced inbound email (see gmailSync.ts
// / imapSync.ts) to catch GDPR exercise-of-rights requests — access,
// erasure ("droit à l'oubli"), portability, rectification — that could
// otherwise sit unnoticed in a busy triage inbox until their 1-month legal
// deadline (spec §5.7) is at risk. Only ever produces a suggestion
// (EmailMessage.rgpdSuggestedType) for a human to confirm or dismiss on
// /inbox — it never creates the actual RightsRequest record itself, same
// "AI proposes, staff disposes" rule as every other AI feature in this app.
export async function classifyEmailForRgpd(params: { subject: string; body: string }): Promise<RgpdClassification> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  const raw = await chatCompletion(apiKey, {
    system:
      'Tu identifies si un email reçu par un organisme de formation constitue une demande d\'exercice de droit RGPD (accès, effacement/droit à l\'oubli, portabilité, ou rectification de données personnelles) — pas une simple question commerciale ou administrative. Réponds UNIQUEMENT avec un objet JSON valide de la forme {"isRightsRequest": true|false, "requestType": "access"|"erasure"|"portability"|"rectification"|null, "reasoning": "une phrase en français expliquant ta décision"}. Si ce n\'est pas une demande de droit RGPD, isRightsRequest doit être false et requestType null. Sois conservateur : en cas de doute réel, réponds false plutôt que de sur-signaler.',
    user: `Objet : ${params.subject}\n\n${params.body.slice(0, 3000)}`,
    json: true,
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(raw);
    const requestType =
      typeof parsed.requestType === "string" && RGPD_REQUEST_TYPES.includes(parsed.requestType)
        ? (parsed.requestType as RgpdRequestType)
        : null;
    return {
      isRightsRequest: Boolean(parsed.isRightsRequest) && requestType !== null,
      requestType,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return { isRightsRequest: false, requestType: null, reasoning: "" };
  }
}

// Powers "voir mon résumé personnalisé" on the Qualiopi Préparation audit
// tab — the official RNQ indicator label (e.g. "Indicateur 3") is
// necessarily generic across every OFP in France; this turns it into a
// plain-language explanation of what it concretely means AND what to
// gather as evidence, given this specific organization's actual offering
// (course titles, formats). Cached in AuditChecklistItem.personalizedSummary
// so it's generated once per indicator, not on every page view.
export async function summarizeQualiopiIndicator(params: {
  indicatorLabel: string;
  criterionLabel: string;
  organizationName: string;
  courseTitles: string[];
  formats: string[];
}): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error(NOT_CONFIGURED_ERROR);

  const offering =
    params.courseTitles.length > 0
      ? `Formations proposées : ${params.courseTitles.slice(0, 8).join(", ")}. Modalités utilisées : ${params.formats.join(", ") || "non renseignées"}.`
      : "Aucune formation encore renseignée dans le catalogue.";

  return chatCompletion(apiKey, {
    system:
      "Tu es expert du Référentiel National Qualité (Qualiopi) pour les organismes de formation professionnelle français. On te donne un indicateur RNQ et le profil d'un organisme de formation précis. Rédige en français, en 3 à 5 phrases maximum, une explication concrète et personnalisée de ce que cet indicateur exige POUR CET ORGANISME EN PARTICULIER (pas une définition générique), et donne 2 ou 3 exemples précis de preuves qu'il pourrait rassembler compte tenu de son activité réelle. Pas de formule d'introduction, va droit au but.",
    user: `Critère ${params.criterionLabel}\nIndicateur : ${params.indicatorLabel}\n\nOrganisme : ${params.organizationName}\n${offering}`,
    temperature: 0.4,
  });
}
