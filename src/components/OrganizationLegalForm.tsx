"use client";

import { useState } from "react";

type LegalInfo = {
  legalForm: string;
  shareCapital: string;
  legalAddress: string;
  rcsCity: string;
  rcsNumber: string;
  legalRepresentativeName: string;
};

export function OrganizationLegalForm({ initial }: { initial: LegalInfo }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof LegalInfo>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/organization/legal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Forme juridique</span>
          <input
            value={values.legalForm}
            onChange={(e) => set("legalForm", e.target.value)}
            placeholder="SARL, SAS, EI…"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Capital social</span>
          <input
            value={values.shareCapital}
            onChange={(e) => set("shareCapital", e.target.value)}
            placeholder="10 000 €"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">Adresse postale complète (siège social)</span>
        <input
          value={values.legalAddress}
          onChange={(e) => set("legalAddress", e.target.value)}
          placeholder="12 rue des Formateurs, 75011 Paris"
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Ville du RCS</span>
          <input
            value={values.rcsCity}
            onChange={(e) => set("rcsCity", e.target.value)}
            placeholder="Paris"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Numéro RCS</span>
          <input
            value={values.rcsNumber}
            onChange={(e) => set("rcsNumber", e.target.value)}
            placeholder="123 456 789"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">Représentant légal</span>
        <input
          value={values.legalRepresentativeName}
          onChange={(e) => set("legalRepresentativeName", e.target.value)}
          placeholder="Marie Lefèvre, gérante"
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        />
      </label>
      <div className="flex items-center gap-2.5 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        {saved && <span className="text-[12px] text-sage">Enregistré.</span>}
        {error && <span className="text-[12px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
