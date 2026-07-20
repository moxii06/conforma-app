import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { IntegrationCredentialForm } from "@/components/IntegrationCredentialForm";

const PROVIDERS: { key: string; label: string; description: string; kind: "apiKey" | "oauth" }[] = [
  { key: "stripe", label: "Stripe", description: "Paiement des abonnements — active un essai (Subscription.status) une fois la clé secrète configurée et le webhook branché.", kind: "apiKey" },
  { key: "brevo", label: "Brevo", description: "Emailing transactionnel — relances automatiques, envoi d'invitations (spec §3).", kind: "apiKey" },
  { key: "yousign", label: "Yousign", description: "Signature électronique des conventions et contrats (spec §3).", kind: "apiKey" },
  { key: "pennylane", label: "Pennylane", description: "Connecteur e-facturation (spec §5.3 / §7.2).", kind: "apiKey" },
  { key: "sellsy", label: "Sellsy", description: "Connecteur e-facturation alternatif (spec §5.3 / §7.2).", kind: "apiKey" },
  { key: "google_oauth", label: "Google (Gmail)", description: "Connexion de boîte mail pour le triage (spec §5.11).", kind: "oauth" },
  { key: "microsoft_oauth", label: "Microsoft (Outlook)", description: "Connexion de boîte mail pour le triage (spec §5.11).", kind: "oauth" },
];

export default async function IntegrationsPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "integrations") === "none") redirect("/dashboard");

  const credentials = await prisma.integrationCredential.findMany({ where: { organizationId } });
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));

  return (
    <>
      <PageHeader title="Intégrations" subtitle="Clés et connexions pour les services tiers" />
      <div className="p-8 flex flex-col gap-4 max-w-2xl">
        <div className="text-[11.5px] text-slate">
          Ces identifiants sont stockés mais aucune fonctionnalité de l&apos;application ne les utilise encore — le
          branchement réel (envoi d&apos;emails via Brevo, signature via Yousign, transmission via Pennylane/Sellsy,
          connexion de boîte mail via Google/Microsoft) reste à faire. Le stockage n&apos;est pas non plus chiffré au
          repos pour l&apos;instant — à corriger avant d&apos;y mettre de vraies clés de production (spec §7.1).
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
                initialApiKey={cred?.apiKey ?? ""}
                initialClientId={cred?.clientId ?? ""}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
