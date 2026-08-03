"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

type LegalInfo = {
  siret: string;
  legalForm: string;
  shareCapital: string;
  legalAddress: string;
  rcsCity: string;
  rcsNumber: string;
  legalRepresentativeName: string;
  activityDeclarationNumber: string;
  vatRegime: string;
  vatRatePercent: string;
  vatNumber: string;
};

export function OrganizationLegalForm({ initial }: { initial: LegalInfo }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function set<K extends keyof LegalInfo>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/organization/legal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        vatRegime: values.vatRegime,
        vatRatePercent: values.vatRegime === "standard" ? Number(values.vatRatePercent || "20") : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    toast.success("Informations légales enregistrées.");
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
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">SIRET</span>
        <input
          value={values.siret}
          onChange={(e) => set("siret", e.target.value.replace(/\s+/g, ""))}
          placeholder="12345678900012 (14 chiffres)"
          inputMode="numeric"
          maxLength={14}
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
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Représentant légal</span>
          <input
            value={values.legalRepresentativeName}
            onChange={(e) => set("legalRepresentativeName", e.target.value)}
            placeholder="Marie Lefèvre, gérante"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">N° de déclaration d&apos;activité</span>
          <input
            value={values.activityDeclarationNumber}
            onChange={(e) => set("activityDeclarationNumber", e.target.value)}
            placeholder="11 75 12345 75"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
      </div>

      {/* Le régime de TVA décide de la mention portée sur chaque facture.
          Exonéré est le cas le plus fréquent chez les organismes déclarés,
          d'où le défaut — mais c'est l'organisme qui le confirme, pas nous. */}
      <div className="border-t border-line pt-3 mt-1 flex flex-col gap-2.5">
        <div className="text-[11px] text-slate uppercase tracking-wide">TVA sur vos factures</div>
        <label className="flex items-start gap-2 text-[12.5px] text-ink cursor-pointer">
          <input
            type="radio"
            name="vatRegime"
            checked={values.vatRegime !== "standard"}
            onChange={() => set("vatRegime", "exempt")}
            className="mt-0.5 accent-sage"
          />
          <span>
            Exonéré de TVA
            <span className="text-slate"> — article 261-4-4°a du CGI, sur attestation de la DREETS.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[12.5px] text-ink cursor-pointer">
          <input
            type="radio"
            name="vatRegime"
            checked={values.vatRegime === "standard"}
            onChange={() => set("vatRegime", "standard")}
            className="mt-0.5 accent-sage"
          />
          <span>Assujetti à la TVA</span>
        </label>
        {values.vatRegime === "standard" && (
          <div className="grid grid-cols-2 gap-2.5 pl-6">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">Taux (%)</span>
              <input
                value={values.vatRatePercent}
                onChange={(e) => set("vatRatePercent", e.target.value)}
                placeholder="20"
                className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">N° de TVA intracommunautaire</span>
              <input
                value={values.vatNumber}
                onChange={(e) => set("vatNumber", e.target.value)}
                placeholder="FR12345678901"
                className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 mt-1">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="self-start">
          {saving ? "…" : "Enregistrer"}
        </Button>
        {error && <span className="text-[12px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
