"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IntegrationCredentialForm({
  provider,
  kind,
  hasApiKey,
  initialClientId,
  hasClientSecret,
}: {
  provider: string;
  kind: "apiKey" | "oauth";
  hasApiKey?: boolean;
  initialClientId?: string;
  hasClientSecret?: boolean;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/integrations/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "apiKey"
          ? { provider, apiKey: apiKey || undefined }
          : { provider, clientId, clientSecret: clientSecret || undefined }
      ),
    });
    setSaving(false);
    setSaved(true);
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
        <button onClick={handleSave} disabled={saving} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 shrink-0">
          {saving ? "…" : "Enregistrer"}
        </button>
        {saved && <span className="text-[12px] text-sage shrink-0">Enregistré</span>}
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
      <button onClick={handleSave} disabled={saving} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 shrink-0">
        {saving ? "…" : "Enregistrer"}
      </button>
      {saved && <span className="text-[12px] text-sage shrink-0">Enregistré</span>}
    </div>
  );
}
