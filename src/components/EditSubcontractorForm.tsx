"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

export function EditSubcontractorForm({
  subcontractorId,
  initial,
}: {
  subcontractorId: string;
  initial: {
    name: string;
    type: string;
    isIndividual: boolean;
    legalForm: string | null;
    siret: string | null;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    qualifications: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [isIndividual, setIsIndividual] = useState(initial.isIndividual);
  const [legalForm, setLegalForm] = useState(initial.legalForm ?? "");
  const [siret, setSiret] = useState(initial.siret ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [qualifications, setQualifications] = useState(initial.qualifications ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        isIndividual,
        legalForm: isIndividual ? null : legalForm || null,
        siret: siret || null,
        address: address || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        qualifications: qualifications || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la modification.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Modifier
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-[#EFEDE7] border border-line rounded-md p-3">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" required className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink flex-1 focus:outline-none focus:border-ink-soft" />
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
        <input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
      </div>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink" />
      <div className="flex items-center gap-2">
        <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="Email de contact" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Téléphone" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1" />
      </div>
      <input value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="Qualifications / diplômes / spécialités" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft" />
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading || !name.trim()} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">Annuler</button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
