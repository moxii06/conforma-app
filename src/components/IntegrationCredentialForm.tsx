"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export function IntegrationCredentialForm({
  provider,
  kind,
  hasApiKey,
  initialClientId,
  hasClientSecret,
  apiKeyPlaceholder,
  clientSecretPlaceholder,
}: {
  provider: string;
  kind: "apiKey" | "oauth" | "apiKeyWithSecret";
  hasApiKey?: boolean;
  initialClientId?: string;
  hasClientSecret?: boolean;
  apiKeyPlaceholder?: string;
  clientSecretPlaceholder?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/integrations/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "apiKey"
          ? { provider, apiKey: apiKey || undefined }
          : kind === "apiKeyWithSecret"
            ? { provider, apiKey: apiKey || undefined, clientSecret: clientSecret || undefined }
            : { provider, clientId, clientSecret: clientSecret || undefined }
      ),
    });
    setSaving(false);
    toast.success("Identifiants enregistrés.");
    setApiKey("");
    setClientSecret("");
    router.refresh();
  }

  if (kind === "apiKey") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="password"
          placeholder={hasApiKey ? "•••••••• (laisser vide pour ne pas changer)" : "Clé API"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
        />
        <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>
    );
  }

  if (kind === "apiKeyWithSecret") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder={hasApiKey ? "•••••••• (laisser vide pour ne pas changer)" : apiKeyPlaceholder ?? "Clé API"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder={hasClientSecret ? "•••••••• (laisser vide pour ne pas changer)" : clientSecretPlaceholder ?? "Secret de signature du webhook"}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
          />
          <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
            {saving ? "…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        placeholder="Client ID"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
      />
      <input
        type="password"
        placeholder={hasClientSecret ? "•••••••• (laisser vide pour ne pas changer)" : "Client Secret"}
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
      />
      <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
        {saving ? "…" : "Enregistrer"}
      </Button>
    </div>
  );
}
