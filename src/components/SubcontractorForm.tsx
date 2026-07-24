"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

export function SubcontractorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("formateur_externe");
  const [isIndividual, setIsIndividual] = useState(false);
  const [legalForm, setLegalForm] = useState("");
  const [siret, setSiret] = useState("");
  const [address, setAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [qualificationExpiryDate, setQualificationExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/subcontractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        isIndividual,
        legalForm: !isIndividual && legalForm ? legalForm : undefined,
        siret: siret || undefined,
        address: address || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        qualifications: qualifications || undefined,
        contractEndDate: contractEndDate || undefined,
        qualificationExpiryDate: qualificationExpiryDate || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setName("");
    setLegalForm("");
    setSiret("");
    setAddress("");
    setContactEmail("");
    setContactPhone("");
    setQualifications("");
    setContractEndDate("");
    setQualificationExpiryDate("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Ajouter un intervenant
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-[#EFEDE7] border border-line rounded-md p-3.5">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom"
          required
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink flex-1 focus:outline-none focus:border-ink-soft"
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-ink">
        <input type="checkbox" checked={isIndividual} onChange={(e) => setIsIndividual(e.target.checked)} className="accent-sage" />
        Entreprise individuelle / auto-entrepreneur
      </label>
      <div className="flex items-center gap-2">
        {!isIndividual && (
          <input value={legalForm} onChange={(e) => setLegalForm(e.target.value)} placeholder="Forme juridique (SARL, SAS…)" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
        )}
        <input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET (optionnel)" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
      </div>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse (optionnel)" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink" />
      <div className="flex items-center gap-2">
        <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email de contact" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Téléphone" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
      </div>
      <input
        value={qualifications}
        onChange={(e) => setQualifications(e.target.value)}
        placeholder="Qualifications / diplômes / spécialités"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-2">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Fin de contrat
          <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Expiration qualification
          <input type="date" value={qualificationExpiryDate} onChange={(e) => setQualificationExpiryDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">Annuler</button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
