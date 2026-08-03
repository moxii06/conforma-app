"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";
import { API_SCOPES, API_SCOPE_LABELS, WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type ApiScope, type WebhookEvent } from "@/lib/apiKeys";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
};

export function ApiAccessPanel({
  apiKeys,
  webhooks,
  baseUrl,
}: {
  apiKeys: ApiKeyRow[];
  webhooks: WebhookRow[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["read:dossiers"]);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [creatingHook, setCreatingHook] = useState(false);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>(["dossier.created"]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeKeys = apiKeys.filter((k) => !k.revokedAt);
  const revokedKeys = apiKeys.filter((k) => k.revokedAt);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName, scopes }),
    });
    setLoading(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "La création a échoué.");
      return;
    }
    setFreshKey(body.plainKey);
    setCreatingKey(false);
    setKeyName("");
    router.refresh();
  }

  async function revokeKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function createHook(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/webhooks-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: hookUrl, events: hookEvents }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "La création a échoué.");
      return;
    }
    setCreatingHook(false);
    setHookUrl("");
    router.refresh();
  }

  async function deleteHook(id: string) {
    await fetch(`/api/webhooks-config?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const field =
    "w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal placeholder:text-ash";
  const label = "text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1";

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[11.5px] text-slate">
        Branchez Jalon sur vos autres outils — tableur, Slack, outil d&apos;emailing, Zapier, Make. L&apos;API est en
        lecture seule : elle expose vos données, elle n&apos;en modifie aucune.
      </div>

      {error && <div className="bg-[#E9D8D3] text-rust text-[12px] rounded-md px-3 py-2">{error}</div>}

      {/* The one moment the key is visible. Made deliberately hard to miss. */}
      {freshKey && (
        <div className="bg-[#F0E7D4] border border-seal rounded-card p-4">
          <div className="text-[12.5px] font-semibold text-seal-dark mb-1">Copiez cette clé maintenant</div>
          <div className="text-[11.5px] text-seal-dark mb-2.5">
            Elle ne sera plus jamais affichée : nous n&apos;en gardons qu&apos;une empreinte, pas la clé elle-même.
            Si vous la perdez, il faudra en créer une nouvelle.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[11.5px] text-ink break-all font-mono">
              {freshKey}
            </code>
            <Button
              size="sm"
              className="shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(freshKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copié ✓" : "Copier"}
            </Button>
          </div>
          <button onClick={() => setFreshKey(null)} className="text-[11.5px] text-seal-dark underline mt-2.5">
            J&apos;ai copié la clé
          </button>
        </div>
      )}

      <div className="bg-white border border-line rounded-card p-4">
        <div className="text-[13px] font-semibold text-ink mb-1">Clés d&apos;API</div>
        <div className="text-[12px] text-slate mb-3">
          Chaque clé porte ses propres permissions. Créez-en une par outil : révoquer l&apos;une n&apos;interrompt
          pas les autres.
        </div>

        {activeKeys.length === 0 ? (
          <div className="text-[12px] text-slate">Aucune clé active.</div>
        ) : (
          <div className="flex flex-col">
            {activeKeys.map((k) => (
              <div key={k.id} className="flex items-start gap-3 border-t border-line first:border-t-0 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium text-ink">{k.name}</div>
                  <code className="text-[11px] text-slate font-mono">{k.keyPrefix}…</code>
                  <div className="text-[11px] text-slate mt-0.5">
                    {k.scopes.map((s) => API_SCOPE_LABELS[s as ApiScope] ?? s).join(" · ")}
                  </div>
                  <div className="text-[10.5px] text-ash mt-0.5">
                    {k.lastUsedAt
                      ? `Dernière utilisation le ${new Date(k.lastUsedAt).toLocaleDateString("fr-FR")}`
                      : "Jamais utilisée"}
                  </div>
                </div>
                <button onClick={() => revokeKey(k.id)} className="text-[11.5px] text-slate hover:text-rust shrink-0">
                  Révoquer
                </button>
              </div>
            ))}
          </div>
        )}

        {!creatingKey ? (
          <button
            onClick={() => {
              setCreatingKey(true);
              setError(null);
            }}
            className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink mt-3"
          >
            + Créer une clé
          </button>
        ) : (
          <form onSubmit={createKey} className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-line">
            <div>
              <label className={label}>Nom de la clé</label>
              <input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
                minLength={2}
                placeholder="ex. Zapier — export comptable"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Permissions</label>
              <div className="flex flex-col gap-1">
                {API_SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={scopes.includes(s)}
                      onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
                      className="accent-sage"
                    />
                    {API_SCOPE_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Button type="submit" size="sm" disabled={loading || scopes.length === 0}>
                {loading ? "…" : "Créer la clé"}
              </Button>
              <Button type="button" variant="tertiary" size="sm" onClick={() => setCreatingKey(false)}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        {revokedKeys.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">
              Révoquées ({revokedKeys.length})
            </div>
            {revokedKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-2 text-[11.5px] text-slate py-0.5">
                <span className="flex-1 truncate">{k.name}</span>
                <code className="font-mono text-[10.5px]">{k.keyPrefix}…</code>
                <span className="text-[10.5px]">
                  révoquée le {new Date(k.revokedAt!).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-line rounded-card p-4">
        <div className="text-[13px] font-semibold text-ink mb-1">Webhooks</div>
        <div className="text-[12px] text-slate mb-3">
          Jalon appelle votre URL dès qu&apos;un événement se produit — sans attendre que vous veniez demander.
          C&apos;est ce qui permet aux automatisations Zapier ou Make de réagir à la seconde.
        </div>

        {webhooks.length === 0 ? (
          <div className="text-[12px] text-slate">Aucun webhook configuré.</div>
        ) : (
          <div className="flex flex-col">
            {webhooks.map((h) => (
              <div key={h.id} className="flex items-start gap-3 border-t border-line first:border-t-0 py-2.5">
                <div className="flex-1 min-w-0">
                  <code className="text-[11.5px] text-ink break-all font-mono">{h.url}</code>
                  <div className="text-[11px] text-slate mt-0.5">
                    {h.events.map((e) => WEBHOOK_EVENT_LABELS[e as WebhookEvent] ?? e).join(" · ")}
                  </div>
                  <div className="text-[10.5px] text-slate mt-1">
                    Secret de signature : <code className="font-mono">{h.secret}</code>
                  </div>
                  {h.lastDeliveryAt && (
                    <div className="mt-1">
                      <Pill tone={h.lastDeliveryStatus && h.lastDeliveryStatus < 300 ? "good" : "danger"}>
                        {h.lastDeliveryStatus && h.lastDeliveryStatus > 0
                          ? `Dernier envoi : ${h.lastDeliveryStatus}`
                          : "Dernier envoi : injoignable"}
                      </Pill>
                    </div>
                  )}
                </div>
                <button onClick={() => deleteHook(h.id)} className="text-[11.5px] text-slate hover:text-rust shrink-0">
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}

        {!creatingHook ? (
          <button
            onClick={() => {
              setCreatingHook(true);
              setError(null);
            }}
            className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink mt-3"
          >
            + Ajouter un webhook
          </button>
        ) : (
          <form onSubmit={createHook} className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-line">
            <div>
              <label className={label}>URL de destination (HTTPS)</label>
              <input
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                required
                type="url"
                placeholder="https://hooks.zapier.com/…"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Événements</label>
              <div className="flex flex-col gap-1">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={hookEvents.includes(ev)}
                      onChange={(e) =>
                        setHookEvents(e.target.checked ? [...hookEvents, ev] : hookEvents.filter((x) => x !== ev))
                      }
                      className="accent-sage"
                    />
                    <span>
                      {WEBHOOK_EVENT_LABELS[ev]} <code className="text-[10.5px] text-slate font-mono">{ev}</code>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Button type="submit" size="sm" disabled={loading || hookEvents.length === 0}>
                {loading ? "…" : "Ajouter"}
              </Button>
              <Button type="button" variant="tertiary" size="sm" onClick={() => setCreatingHook(false)}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-linen border border-line rounded-card p-4">
        <div className="text-[12.5px] font-semibold text-ink mb-2">Comment appeler l&apos;API</div>
        <code className="block bg-white border border-line rounded-md px-2.5 py-2 text-[11px] text-ink font-mono break-all">
          curl -H &quot;Authorization: Bearer VOTRE_CLE&quot; {baseUrl}/api/v1/dossiers
        </code>
        <div className="text-[11.5px] text-slate mt-2.5">
          Ressources disponibles : <code className="font-mono">/dossiers</code>,{" "}
          <code className="font-mono">/contacts</code>, <code className="font-mono">/sessions</code>,{" "}
          <code className="font-mono">/courses</code>, <code className="font-mono">/invoices</code>. Pagination via{" "}
          <code className="font-mono">?limit=</code> (100 max) et <code className="font-mono">?offset=</code>.
        </div>
        <div className="text-[11.5px] text-slate mt-1.5">
          Chaque webhook est signé : l&apos;en-tête <code className="font-mono">X-Jalon-Signature</code>{" "}
          contient un HMAC-SHA256 du corps du message avec votre secret. Vérifiez-le avant de traiter l&apos;appel —
          sans cela, votre URL accepterait n&apos;importe quel expéditeur.
        </div>
      </div>
    </div>
  );
}
