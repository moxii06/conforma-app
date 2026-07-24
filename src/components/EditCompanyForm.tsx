"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Company = {
  id: string;
  name: string;
  siret: string | null;
  address: string | null;
  responsableFirstName: string | null;
  responsableLastName: string | null;
  responsableEmail: string | null;
  responsablePhone: string | null;
};

export function EditCompanyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [siret, setSiret] = useState(company.siret ?? "");
  const [address, setAddress] = useState(company.address ?? "");
  const [responsableFirstName, setResponsableFirstName] = useState(company.responsableFirstName ?? "");
  const [responsableLastName, setResponsableLastName] = useState(company.responsableLastName ?? "");
  const [responsableEmail, setResponsableEmail] = useState(company.responsableEmail ?? "");
  const [responsablePhone, setResponsablePhone] = useState(company.responsablePhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        siret: siret.trim() || undefined,
        address: address.trim() || undefined,
        responsableFirstName: responsableFirstName.trim() || undefined,
        responsableLastName: responsableLastName.trim() || undefined,
        responsableEmail: responsableEmail.trim() || undefined,
        responsablePhone: responsablePhone.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] text-ink">{company.name}</div>
        {company.siret && <div className="text-[12px] text-slate">SIRET {company.siret}</div>}
        {company.address && <div className="text-[12px] text-slate">{company.address}</div>}
        {(company.responsableFirstName || company.responsableLastName) && (
          <div className="text-[12.5px] text-ink mt-1.5">
            Responsable : {company.responsableFirstName} {company.responsableLastName}
          </div>
        )}
        {company.responsableEmail && <div className="text-[12px] text-slate">{company.responsableEmail}</div>}
        {company.responsablePhone && <div className="text-[12px] text-slate">{company.responsablePhone}</div>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start mt-1"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom de l'entreprise"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={siret}
        onChange={(e) => setSiret(e.target.value)}
        placeholder="SIRET (optionnel)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Adresse (optionnel)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="text-[11px] font-medium text-slate mt-1">Responsable</div>
      <div className="flex gap-1.5">
        <input
          value={responsableFirstName}
          onChange={(e) => setResponsableFirstName(e.target.value)}
          placeholder="Prénom"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
        <input
          value={responsableLastName}
          onChange={(e) => setResponsableLastName(e.target.value)}
          placeholder="Nom"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </div>
      <div className="flex gap-1.5">
        <input
          type="email"
          value={responsableEmail}
          onChange={(e) => setResponsableEmail(e.target.value)}
          placeholder="Email"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
        <input
          value={responsablePhone}
          onChange={(e) => setResponsablePhone(e.target.value)}
          placeholder="Téléphone"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </div>
      <div className="flex items-center gap-2.5 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
