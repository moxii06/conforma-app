import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Button } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { IntegrationCredentialForm } from "@/components/IntegrationCredentialForm";
import { IntegrationRequestForm } from "@/components/IntegrationRequestForm";
import { ApiAccessPanel } from "@/components/ApiAccessPanel";
import { MailboxActions } from "@/components/MailboxActions";
import { ImapMailboxForm } from "@/components/ImapMailboxForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// Connectors that have a settings form but nothing behind it yet. Kept
// visible on purpose — an OF choosing a tool wants to know what's coming —
// but labelled so nobody configures one expecting it to work. Do NOT move a
// provider out of this list before its integration is actually wired.
const UPCOMING = [
  {
    key: "pennylane",
    label: "Pennylane",
    tab: "paiement",
    description: "Export des factures vers votre comptabilité.",
  },
  {
    key: "sellsy",
    label: "Sellsy",
    tab: "paiement",
    description: "Alternative à Pennylane pour l'export comptable.",
  },
  {
    key: "microsoft_oauth",
    label: "Microsoft (Outlook)",
    tab: "messagerie",
    description: "Connexion Outlook en un clic. En attendant, une boîte Outlook se connecte déjà via IMAP/SMTP.",
  },
];

const GOOGLE_ERROR_LABELS: Record<string, string> = {
  forbidden: "Action non autorisée pour ce rôle.",
  not_configured: "La connexion Google n'est pas disponible sur cette installation.",
  denied: "Connexion annulée.",
  invalid_state: "La demande de connexion a expiré ou est invalide — réessayez.",
  token_exchange: "Échec de l'échange du code d'autorisation avec Google.",
  no_refresh_token: "Google n'a pas fourni de jeton de rafraîchissement — réessayez la connexion.",
  userinfo: "Impossible de récupérer l'adresse du compte Google connecté.",
};

const TABS = [
  { key: "messagerie", label: "Messagerie" },
  { key: "paiement", label: "Paiement & comptabilité" },
  { key: "signature", label: "Signature électronique" },
  { key: "incluses", label: "Incluses dans Jalon" },
  { key: "api", label: "API & webhooks" },
];

function Card({
  title,
  status,
  tone = "neutral",
  description,
  children,
}: {
  title: string;
  status: string;
  tone?: "neutral" | "good" | "warn" | "danger";
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-[13.5px] font-semibold text-ink">{title}</div>
        <Pill tone={tone}>{status}</Pill>
      </div>
      <div className="text-[12px] text-slate mb-3 last:mb-0">{description}</div>
      {children}
    </div>
  );
}

export default async function IntegrationsPage(props: {
  searchParams: Promise<{ tab?: string; google_error?: string; google_connected?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { organizationId, roles } = await requireSessionContext();
  if (can(roles, "integrations") === "none") redirect("/dashboard");

  const activeTab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "messagerie";

  // Only loaded for its own tab — see the same reasoning on the funders tab.
  const [apiKeys, webhooks] =
    activeTab === "api"
      ? await Promise.all([
          prisma.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
          prisma.webhook.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
        ])
      : [[], []];

  const [credentials, googleConnections, imapConnections, requests] = await Promise.all([
    prisma.integrationCredential.findMany({ where: { organizationId } }),
    prisma.mailboxConnection.findMany({ where: { organizationId, provider: "gmail" }, orderBy: { connectedAt: "asc" } }),
    prisma.mailboxConnection.findMany({ where: { organizationId, provider: "imap" }, orderBy: { connectedAt: "asc" } }),
    prisma.integrationRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));

  const brevoReady = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
  const aiReady = Boolean(process.env.OPENAI_API_KEY);

  const upcomingForTab = UPCOMING.filter((p) => p.tab === activeTab);

  return (
    <>
      <PageHeader title="Intégrations" subtitle="Connectez Jalon aux outils que vous utilisez déjà" />
      <Tabs basePath="/integrations" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-2xl">
        {searchParams.google_error && (
          <div className="bg-white border border-rust/40 rounded-card p-3 text-[12.5px] text-rust">
            {GOOGLE_ERROR_LABELS[searchParams.google_error] ?? "Erreur lors de la connexion Google."}
          </div>
        )}
        {searchParams.google_connected && (
          <div className="bg-white border border-line rounded-card p-3 text-[12.5px] text-sage">
            Boîte Gmail connectée avec succès.
          </div>
        )}

        {activeTab === "messagerie" && (
          <>
            <div className="text-[11.5px] text-slate">
              Connecter une boîte permet de trier vos emails dans Jalon, de les rattacher aux bons contacts et de
              répondre sans changer d&apos;outil. Vos identifiants sont chiffrés en base et jamais réaffichés en clair.
            </div>

            <Card
              title="Google (Gmail)"
              tone={googleConnections.length > 0 ? "good" : "neutral"}
              status={
                googleConnections.length > 0
                  ? `${googleConnections.length} connecté${googleConnections.length > 1 ? "s" : ""}`
                  : "Non connecté"
              }
              description="Connexion en un clic, sans mot de passe à stocker. Vous pouvez connecter plusieurs comptes Gmail."
            >
              <div className="flex flex-col gap-3">
                {googleConnections.map((conn) => (
                  <div key={conn.id} className="flex flex-col gap-2 pb-3 border-b border-line last:border-b-0 last:pb-0">
                    <div className="text-[12.5px] text-ink">
                      {conn.accountEmail}
                      <span className="text-slate">
                        {" — connecté le "}
                        {format(conn.connectedAt, "d MMM yyyy", { locale: fr })}
                        {conn.lastSyncedAt &&
                          `, dernière synchro le ${format(conn.lastSyncedAt, "d MMM yyyy à HH:mm", { locale: fr })}`}
                      </span>
                    </div>
                    <MailboxActions provider="gmail" connectionId={conn.id} syncEnabled={conn.syncEnabled} />
                  </div>
                ))}
                <Button href="/api/integrations/google/connect" size="sm" className="self-start">
                  {googleConnections.length > 0 ? "Connecter un autre compte Google" : "Connecter Google"}
                </Button>
              </div>
            </Card>

            <Card
              title="Autre messagerie (IMAP/SMTP)"
              tone={imapConnections.length > 0 ? "good" : "neutral"}
              status={
                imapConnections.length > 0
                  ? `${imapConnections.length} connectée${imapConnections.length > 1 ? "s" : ""}`
                  : "Non connecté"
              }
              description="Pour toute messagerie hors Gmail — OVH, Ionos, Zoho, Outlook, la plupart des hébergeurs. Contrepartie par rapport à Google : le mot de passe du compte est stocké (chiffré) plutôt qu'un jeton révocable."
            >
              <div className="flex flex-col gap-3">
                {imapConnections.map((conn) => (
                  <div key={conn.id} className="flex flex-col gap-2 pb-3 border-b border-line last:border-b-0 last:pb-0">
                    <div className="text-[12.5px] text-ink">
                      {conn.accountEmail}
                      <span className="text-slate">
                        {" — connecté le "}
                        {format(conn.connectedAt, "d MMM yyyy", { locale: fr })}
                        {conn.lastSyncedAt &&
                          `, dernière synchro le ${format(conn.lastSyncedAt, "d MMM yyyy à HH:mm", { locale: fr })}`}
                      </span>
                    </div>
                    <MailboxActions provider="imap" connectionId={conn.id} syncEnabled={conn.syncEnabled} />
                  </div>
                ))}
                <ImapMailboxForm />
              </div>
            </Card>
          </>
        )}

        {activeTab === "paiement" && (
          <>
            <div className="text-[11.5px] text-slate">
              Encaissez vos formations et transmettez vos écritures à votre comptabilité. L&apos;argent va toujours
              sur votre propre compte — Jalon ne s&apos;interpose jamais entre vous et vos clients.
            </div>

            <Card
              title="Stripe"
              tone={byProvider.get("stripe") ? "good" : "neutral"}
              status={byProvider.get("stripe") ? "Configuré" : "Non configuré"}
              description={
                <>
                  Paiement en ligne de vos factures, sur <strong>votre</strong> compte Stripe. Une fois configuré, un
                  bouton « Créer un lien de paiement » apparaît sur chaque facture non payée ; le paiement reçu
                  bascule la facture en « Payé » sans action de votre part.
                </>
              }
            >
              <IntegrationCredentialForm
                provider="stripe"
                kind="apiKeyWithSecret"
                hasApiKey={Boolean(byProvider.get("stripe")?.apiKey)}
                hasClientSecret={Boolean(byProvider.get("stripe")?.clientSecret)}
                apiKeyPlaceholder="Clé secrète Stripe (sk_...)"
                clientSecretPlaceholder="Secret de signature du webhook (whsec_...)"
              />
              <div className="text-[11.5px] text-slate mt-3 pt-3 border-t border-line">
                URL du webhook à déclarer dans Stripe (événement <code>checkout.session.completed</code>) :
                <br />
                <code className="text-ink break-all">
                  https://votre-domaine{`/api/webhooks/stripe/${organizationId}`}
                </code>
              </div>
            </Card>
          </>
        )}

        {activeTab === "signature" && (
          <>
            <div className="text-[11.5px] text-slate">
              Faire signer conventions et contrats à distance, avec une valeur probante opposable en audit.
            </div>

            <Card
              title="Yousign / Youtrust"
              tone={byProvider.get("yousign") ? "good" : "neutral"}
              status={byProvider.get("yousign") ? "Configuré" : "Non configuré"}
              description={
                <>
                  Signature électronique réelle des documents envoyés depuis un dossier (case « Demander une
                  signature électronique »). Yousign s&apos;appelle Youtrust depuis juillet 2026 — même entreprise,
                  même moteur, la clé et le webhook se configurent au même endroit dans votre compte.
                  <br />
                  <br />
                  <strong>Sans clé, la signature fonctionne quand même</strong>{" "}: elle reste gérée en interne,
                  l&apos;apprenant signe depuis son espace personnel.
                </>
              }
            >
              <IntegrationCredentialForm
                provider="yousign"
                kind="apiKeyWithSecret"
                hasApiKey={Boolean(byProvider.get("yousign")?.apiKey)}
                hasClientSecret={Boolean(byProvider.get("yousign")?.clientSecret)}
                apiKeyPlaceholder="Clé API Yousign / Youtrust"
                clientSecretPlaceholder="Secret de signature du webhook"
              />
              <div className="text-[11.5px] text-slate mt-3 pt-3 border-t border-line">
                URL du webhook à créer côté Yousign (événement <code>signature_request.done</code>) :
                <br />
                <code className="text-ink break-all">
                  https://votre-domaine{`/api/webhooks/yousign/${organizationId}`}
                </code>
              </div>
            </Card>
          </>
        )}

        {activeTab === "incluses" && (
          <>
            <div className="text-[11.5px] text-slate">
              Ces services font partie de votre abonnement. Rien à configurer, aucune clé à fournir, aucun compte à
              ouvrir de votre côté.
            </div>

            <Card
              title="Envoi d'emails"
              tone={brevoReady ? "good" : "neutral"}
              status={brevoReady ? "Actif" : "Indisponible"}
              description={
                <>
                  Invitations d&apos;équipe, convocations, tests de positionnement, contrats et accès plateforme
                  partent par email réel, à l&apos;en-tête de votre organisme. En cas d&apos;échec d&apos;envoi, un
                  lien à transmettre manuellement reste toujours affiché — rien n&apos;est perdu silencieusement.
                  {!brevoReady && " (Indisponible sur cette installation pour le moment.)"}
                </>
              }
            />

            <Card
              title="Rédaction assistée par IA"
              tone={aiReady ? "good" : "neutral"}
              status={aiReady ? "Active" : "Indisponible"}
              description={
                <>
                  Brouillons de réponses, extraction des informations d&apos;un prospect, ébauche de programme,
                  résumés Qualiopi personnalisés. Ce que l&apos;IA propose est toujours un brouillon relu et validé
                  par vous — rien n&apos;est enregistré automatiquement.
                  {!aiReady && " (Indisponible sur cette installation pour le moment.)"}
                </>
              }
            />
          </>
        )}

        {activeTab === "api" && (
          <ApiAccessPanel
            baseUrl={process.env.NEXTAUTH_URL ?? "https://votre-domaine"}
            apiKeys={apiKeys.map((k) => ({
              id: k.id,
              name: k.name,
              keyPrefix: k.keyPrefix,
              scopes: k.scopes,
              lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
              revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
              createdAt: k.createdAt.toISOString(),
            }))}
            webhooks={webhooks.map((h) => ({
              id: h.id,
              url: h.url,
              events: h.events,
              secret: h.secret,
              lastDeliveryAt: h.lastDeliveryAt ? h.lastDeliveryAt.toISOString() : null,
              lastDeliveryStatus: h.lastDeliveryStatus,
            }))}
          />
        )}

        {upcomingForTab.length > 0 && (
          <>
            <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mt-2">Prévu</div>
            {upcomingForTab.map((p) => (
              <Card key={p.key} title={p.label} tone="warn" status="Bientôt" description={p.description} />
            ))}
          </>
        )}

        <IntegrationRequestForm
          pastRequests={requests.map((r) => ({
            id: r.id,
            toolName: r.toolName,
            status: r.status,
            createdAt: format(r.createdAt, "d MMM yyyy", { locale: fr }),
          }))}
        />
      </div>
    </>
  );
}
