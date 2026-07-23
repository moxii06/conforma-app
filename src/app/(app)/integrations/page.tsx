import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { IntegrationCredentialForm } from "@/components/IntegrationCredentialForm";
import { MailboxActions } from "@/components/MailboxActions";
import { ImapMailboxForm } from "@/components/ImapMailboxForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PROVIDERS: { key: string; label: string; description: string; kind: "apiKey" | "oauth" | "stripe" }[] = [
  { key: "yousign", label: "Yousign", description: "Signature électronique des conventions et contrats — génère un document mais n'envoie pas encore de demande de signature réelle (aucun moteur de génération de PDF dans ce scaffold, voir README).", kind: "apiKey" },
  { key: "pennylane", label: "Pennylane", description: "Connecteur e-facturation (spec §5.3 / §7.2).", kind: "apiKey" },
  { key: "sellsy", label: "Sellsy", description: "Connecteur e-facturation alternatif (spec §5.3 / §7.2).", kind: "apiKey" },
  { key: "microsoft_oauth", label: "Microsoft (Outlook)", description: "Connexion de boîte mail pour le triage (spec §5.11).", kind: "oauth" },
];

const GOOGLE_ERROR_LABELS: Record<string, string> = {
  forbidden: "Action non autorisée pour ce rôle.",
  not_configured: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ne sont pas configurés côté serveur.",
  denied: "Connexion annulée.",
  invalid_state: "La demande de connexion a expiré ou est invalide — réessayez.",
  token_exchange: "Échec de l'échange du code d'autorisation avec Google.",
  no_refresh_token: "Google n'a pas fourni de jeton de rafraîchissement — réessayez la connexion.",
  userinfo: "Impossible de récupérer l'adresse du compte Google connecté.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { google_error?: string; google_connected?: string };
}) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "integrations") === "none") redirect("/dashboard");

  const [credentials, googleConnections, imapConnections] = await Promise.all([
    prisma.integrationCredential.findMany({ where: { organizationId } }),
    prisma.mailboxConnection.findMany({ where: { organizationId, provider: "gmail" }, orderBy: { connectedAt: "asc" } }),
    prisma.mailboxConnection.findMany({ where: { organizationId, provider: "imap" }, orderBy: { connectedAt: "asc" } }),
  ]);
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));

  return (
    <>
      <PageHeader title="Intégrations" subtitle="Clés et connexions pour les services tiers" />
      <div className="p-8 flex flex-col gap-4 max-w-2xl">
        <div className="text-[11.5px] text-slate">
          Ces identifiants sont chiffrés en base (jamais réaffichés en clair — laisser un champ vide en
          enregistrant ne l&apos;efface pas). La plupart des fonctionnalités ne les utilisent pas encore — le
          branchement réel (signature via Yousign, transmission via Pennylane/Sellsy, connexion Outlook) reste à
          faire. Les connexions de boîte mail (Google, IMAP/SMTP) sont en revanche réelles : synchronisation et
          réponses passent par de vrais appels aux API concernées. L&apos;IA et l&apos;envoi d&apos;emails
          (ci-dessous) sont des fonctionnalités intégrées à la plateforme — rien à configurer de votre côté.
        </div>

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

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[13px] font-semibold text-ink">Google (Gmail)</div>
            <Pill tone={googleConnections.length > 0 ? "good" : "neutral"}>
              {googleConnections.length > 0 ? `${googleConnections.length} connecté${googleConnections.length > 1 ? "s" : ""}` : "Non connecté"}
            </Pill>
          </div>
          <div className="text-[12px] text-slate mb-3">
            Connexion de boîte mail pour le triage et les réponses (spec §5.11) — réel, pas une simulation. Une
            organisation peut connecter plusieurs comptes Gmail.
          </div>
          <div className="flex flex-col gap-3">
            {googleConnections.map((conn) => (
              <div key={conn.id} className="flex flex-col gap-2 pb-3 border-b border-line last:border-b-0 last:pb-0">
                <div className="text-[12.5px] text-ink">
                  {conn.accountEmail}
                  <span className="text-slate">
                    {" — connecté le "}
                    {format(conn.connectedAt, "d MMM yyyy", { locale: fr })}
                    {conn.lastSyncedAt && `, dernière synchro le ${format(conn.lastSyncedAt, "d MMM yyyy à HH:mm", { locale: fr })}`}
                  </span>
                </div>
                <MailboxActions provider="gmail" connectionId={conn.id} />
              </div>
            ))}
            <a
              href="/api/integrations/google/connect"
              className="inline-block bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start"
            >
              {googleConnections.length > 0 ? "Connecter un autre compte Google" : "Connecter Google"}
            </a>
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[13px] font-semibold text-ink">Autre messagerie (IMAP/SMTP)</div>
            <Pill tone={imapConnections.length > 0 ? "good" : "neutral"}>
              {imapConnections.length > 0 ? `${imapConnections.length} connectée${imapConnections.length > 1 ? "s" : ""}` : "Non connecté"}
            </Pill>
          </div>
          <div className="text-[12px] text-slate mb-3">
            Pour toute messagerie hors Gmail — OVH, Ionos, Zoho, la plupart des hébergeurs — via IMAP/SMTP standard.
            Contrepartie par rapport à Google : le mot de passe du compte est stocké (chiffré) plutôt qu&apos;un
            jeton OAuth révocable. Une organisation peut connecter plusieurs boîtes.
          </div>
          <div className="flex flex-col gap-3">
            {imapConnections.map((conn) => (
              <div key={conn.id} className="flex flex-col gap-2 pb-3 border-b border-line last:border-b-0 last:pb-0">
                <div className="text-[12.5px] text-ink">
                  {conn.accountEmail}
                  <span className="text-slate">
                    {" — connecté le "}
                    {format(conn.connectedAt, "d MMM yyyy", { locale: fr })}
                    {conn.lastSyncedAt && `, dernière synchro le ${format(conn.lastSyncedAt, "d MMM yyyy à HH:mm", { locale: fr })}`}
                  </span>
                </div>
                <MailboxActions provider="imap" connectionId={conn.id} />
              </div>
            ))}
            <ImapMailboxForm />
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[13px] font-semibold text-ink">Envoi d&apos;emails (Brevo)</div>
            <Pill tone={process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL ? "good" : "neutral"}>
              {process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL ? "Actif" : "Indisponible"}
            </Pill>
          </div>
          <div className="text-[12px] text-slate">
            Invitations d&apos;équipe, convocations, test de positionnement, contrat et accès plateforme — envoyés
            par email réel. Fonctionnalité intégrée à la plateforme Conforma, incluse dans votre abonnement.
            Aucune clé à fournir de votre côté ; en cas d&apos;échec d&apos;envoi, un lien reste toujours affiché
            pour relayer manuellement.
            {!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) &&
              " (Non disponible pour le moment — clé non configurée côté serveur.)"}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[13px] font-semibold text-ink">IA (rédaction assistée)</div>
            <Pill tone={process.env.OPENAI_API_KEY ? "good" : "neutral"}>
              {process.env.OPENAI_API_KEY ? "Active" : "Indisponible"}
            </Pill>
          </div>
          <div className="text-[12px] text-slate">
            Rédaction assistée des réponses email et extraction des informations d&apos;un nouveau prospect —
            fonctionnalité intégrée à la plateforme Conforma, incluse dans votre abonnement. Aucune clé à
            fournir de votre côté.
            {!process.env.OPENAI_API_KEY && " (Non disponible pour le moment — clé non configurée côté serveur.)"}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[13px] font-semibold text-ink">Stripe</div>
            <Pill tone={byProvider.get("stripe") ? "good" : "neutral"}>
              {byProvider.get("stripe") ? "Configuré" : "Non configuré"}
            </Pill>
          </div>
          <div className="text-[12px] text-slate mb-3">
            Encaissement des factures — réel, sur votre propre compte Stripe (pas celui de Conforma) : chaque
            organisme reçoit directement le paiement de ses propres clients. Un lien de paiement Stripe peut être
            généré depuis chaque facture sur <code>/facturation</code> ; le webhook ci-dessous rapproche
            automatiquement le paiement une fois reçu (facture marquée payée sans action manuelle).
          </div>
          <IntegrationCredentialForm
            provider="stripe"
            kind="stripe"
            hasApiKey={Boolean(byProvider.get("stripe")?.apiKey)}
            hasClientSecret={Boolean(byProvider.get("stripe")?.clientSecret)}
          />
          <div className="text-[11.5px] text-slate mt-3 pt-3 border-t border-line">
            URL du webhook à configurer côté Stripe (événement <code>checkout.session.completed</code>) :
            <br />
            <code className="text-ink break-all">
              https://votre-domaine{`/api/webhooks/stripe/${organizationId}`}
            </code>
          </div>
        </div>

        {PROVIDERS.map((p) => {
          const cred = byProvider.get(p.key);
          return (
            <div key={p.key} className="bg-white border border-line rounded-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[13px] font-semibold text-ink">{p.label}</div>
                <Pill tone={cred ? "good" : "neutral"}>{cred ? "Configuré" : "Non configuré"}</Pill>
              </div>
              <div className="text-[12px] text-slate mb-3">{p.description}</div>
              <IntegrationCredentialForm
                provider={p.key}
                kind={p.kind}
                hasApiKey={Boolean(cred?.apiKey)}
                initialClientId={cred?.clientId ?? ""}
                hasClientSecret={Boolean(cred?.clientSecret)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
