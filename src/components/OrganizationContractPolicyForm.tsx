"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type ContractPolicy = {
  withdrawalAccessPolicy: string;
  cancellationFeePercent: number | null;
  regionPrefecture: string;
  mediatorName: string;
  mediatorContact: string;
};

export function OrganizationContractPolicyForm({ initial }: { initial: ContractPolicy }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ContractPolicy>(key: K, value: ContractPolicy[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/organization/contract-policy", {
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
    <div className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">Accès LMS pendant le délai de rétractation</span>
        <select
          value={values.withdrawalAccessPolicy}
          onChange={(e) => set("withdrawalAccessPolicy", e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal bg-white"
        >
          <option value="closed">Fermé — tout ouvre à la fin des 14 jours, sauf demande d&apos;accès anticipé</option>
          <option value="partial">Partiel — les modules cochés « Ouvert pendant rétractation » restent accessibles</option>
        </select>
        <span className="text-[11px] text-slate leading-relaxed">
          S&apos;applique le temps du délai de rétractation qui suit la signature d&apos;un contrat hors CPF, sauf
          renonciation expresse de l&apos;apprenant. En mode partiel, choisissez les modules concernés depuis
          l&apos;onglet Contenu de chaque formation — réservez-le à ce qui précède vraiment la formation (livret
          d&apos;accueil, programme, règlement intérieur, test de positionnement).
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">
          Indemnité de résiliation anticipée (% du prix, réciproque)
        </span>
        <div className="flex items-center gap-1.5 w-32">
          <input
            type="number"
            min={0}
            max={100}
            value={values.cancellationFeePercent ?? ""}
            onChange={(e) => set("cancellationFeePercent", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="—"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-full"
          />
          <span className="text-[12.5px] text-slate">%</span>
        </div>
        <span className="text-[11px] text-slate leading-relaxed">
          Reprise dans les contrats générés (clause d&apos;indemnité et son pendant réciproque). Un contrat
          présumé le pratiquer à sens unique — pénalisant seulement le client — est une clause présumée abusive
          (art. R.212-2, 3° du Code de la consommation) ; laissez vide pour ne stipuler aucune indemnité.
        </span>
      </label>

      <div className="border-t border-line pt-3.5 flex flex-col gap-2.5">
        <div className="text-[12px] text-ink font-medium">Médiation de la consommation</div>
        <p className="text-[11px] text-slate leading-relaxed">
          Coordonnées du médiateur à mentionner dans les contrats destinés à un particulier (art. L.616-1 du Code
          de la consommation).
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Préfecture de région compétente</span>
            <input
              value={values.regionPrefecture}
              onChange={(e) => set("regionPrefecture", e.target.value)}
              placeholder="Préfecture de la région Île-de-France"
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Médiateur</span>
            <input
              value={values.mediatorName}
              onChange={(e) => set("mediatorName", e.target.value)}
              placeholder="Médiateur de la formation professionnelle…"
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate uppercase tracking-wide">Coordonnées du médiateur</span>
          <input
            value={values.mediatorContact}
            onChange={(e) => set("mediatorContact", e.target.value)}
            placeholder="Adresse postale, e-mail ou site web"
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </label>
      </div>

      <div className="flex items-center gap-2.5 mt-1">
        <Button type="button" size="sm" className="self-start" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
        {saved && <span className="text-[12px] text-sage">Enregistré.</span>}
        {error && <span className="text-[12px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
