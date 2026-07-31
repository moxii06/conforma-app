"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEGAL_BASES, type LegalBasisKey } from "@/lib/rgpdLegalBases";

// Le formulaire ne demandait que quatre champs, dont une base légale en
// texte libre. Il en manquait cinq pour que la ligne produite tienne devant
// un contrôle : finalité, personnes concernées, catégories de données,
// destinataires, transferts. D'où une mise en page en colonnes plutôt qu'en
// ligne — remplir un registre n'est pas une saisie éclair.

export function AddProcessingActivityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [legalBasis, setLegalBasis] = useState<LegalBasisKey>("contract");
  const [dataSubjects, setDataSubjects] = useState("");
  const [dataCategories, setDataCategories] = useState("");
  const [recipients, setRecipients] = useState("");
  const [transferOutsideEu, setTransferOutsideEu] = useState(false);
  const [transferDetails, setTransferDetails] = useState("");
  const [securityMeasures, setSecurityMeasures] = useState("");
  const [retentionPeriod, setRetentionPeriod] = useState("");
  const [riskFlag, setRiskFlag] = useState<"ok" | "to_review">("ok");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const baseChoisie = LEGAL_BASES.find((b) => b.key === legalBasis);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/rgpd/processing-activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        purpose,
        legalBasis,
        dataSubjects,
        dataCategories,
        recipients: recipients || undefined,
        transferOutsideEu,
        transferDetails: transferOutsideEu && transferDetails ? transferDetails : undefined,
        securityMeasures: securityMeasures || undefined,
        retentionPeriod,
        riskFlag,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'enregistrement.");
      return;
    }

    setName("");
    setPurpose("");
    setDataSubjects("");
    setDataCategories("");
    setRecipients("");
    setTransferOutsideEu(false);
    setTransferDetails("");
    setSecurityMeasures("");
    setRetentionPeriod("");
    setRiskFlag("ok");
    router.refresh();
  }

  const champ = "border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-full";
  const label = "text-[11.5px] text-slate mb-1 block";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Traitement</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={champ} />
        </div>
        <div>
          <label className={label}>Base légale</label>
          <select value={legalBasis} onChange={(e) => setLegalBasis(e.target.value as LegalBasisKey)} className={champ}>
            {LEGAL_BASES.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          {baseChoisie && <div className="text-[11px] text-slate mt-1 leading-relaxed">{baseChoisie.hint}</div>}
        </div>
      </div>

      <div>
        <label className={label}>Finalité — à quoi sert ce traitement</label>
        <input
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Inscrire les stagiaires et exécuter la formation"
          className={champ}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Personnes concernées</label>
          <input
            required
            value={dataSubjects}
            onChange={(e) => setDataSubjects(e.target.value)}
            placeholder="Stagiaires, entreprises clientes"
            className={champ}
          />
        </div>
        <div>
          <label className={label}>Catégories de données</label>
          <input
            required
            value={dataCategories}
            onChange={(e) => setDataCategories(e.target.value)}
            placeholder="Identité, coordonnées, parcours"
            className={champ}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Destinataires (facultatif)</label>
          <input
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="Financeur, expert-comptable"
            className={champ}
          />
        </div>
        <div>
          <label className={label}>Conservation</label>
          <input
            required
            value={retentionPeriod}
            onChange={(e) => setRetentionPeriod(e.target.value)}
            placeholder="5 ans après la fin de la formation"
            className={champ}
          />
        </div>
      </div>

      <div>
        <label className={label}>Mesures de sécurité (facultatif)</label>
        <input
          value={securityMeasures}
          onChange={(e) => setSecurityMeasures(e.target.value)}
          placeholder="Accès par mot de passe, chiffrement, hébergement en France"
          className={champ}
        />
      </div>

      <label className="flex items-start gap-2 text-[12.5px] text-ink cursor-pointer">
        <input
          type="checkbox"
          checked={transferOutsideEu}
          onChange={(e) => setTransferOutsideEu(e.target.checked)}
          className="mt-0.5 accent-sage"
        />
        <span>
          Ces données sortent de l&apos;Union européenne
          <span className="text-slate"> — un transfert hors UE demande des garanties spécifiques.</span>
        </span>
      </label>
      {transferOutsideEu && (
        <input
          value={transferDetails}
          onChange={(e) => setTransferDetails(e.target.value)}
          placeholder="Pays concerné et garantie invoquée (clauses contractuelles types, décision d'adéquation…)"
          className={champ}
        />
      )}

      <div className="flex items-end gap-2.5 flex-wrap">
        <div>
          <label className={label}>Statut</label>
          <select
            value={riskFlag}
            onChange={(e) => setRiskFlag(e.target.value as "ok" | "to_review")}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          >
            <option value="ok">À jour</option>
            <option value="to_review">À revoir</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading ? "…" : "Ajouter au registre"}
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
