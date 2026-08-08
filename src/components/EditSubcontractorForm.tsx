"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

// Un préavis courant, proposé quand l'organisme coche la reconduction
// tacite sans savoir quoi mettre. Rien de standard en droit : le champ
// reste libre, et 90 jours n'est qu'un point de départ à corriger d'après
// le contrat réel.
const PREAVIS_PAR_DEFAUT = 90;

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
    /** Format ISO court (yyyy-MM-dd), tel qu'attendu par <input type="date">. */
    contractStartDate: string | null;
    contractEndDate: string | null;
    qualificationExpiryDate: string | null;
    tacitRenewal: boolean;
    renewalNoticeDays: number | null;
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
  const [contractStartDate, setContractStartDate] = useState(initial.contractStartDate ?? "");
  const [contractEndDate, setContractEndDate] = useState(initial.contractEndDate ?? "");
  const [qualificationExpiryDate, setQualificationExpiryDate] = useState(initial.qualificationExpiryDate ?? "");
  const [tacitRenewal, setTacitRenewal] = useState(initial.tacitRenewal);
  const [renewalNoticeDays, setRenewalNoticeDays] = useState(
    initial.renewalNoticeDays != null ? String(initial.renewalNoticeDays) : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preavis = renewalNoticeDays.trim() === "" ? null : Number(renewalNoticeDays);
  const preavisInvalide = preavis !== null && (!Number.isInteger(preavis) || preavis < 0 || preavis > 365);

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
        contractStartDate: contractStartDate || null,
        contractEndDate: contractEndDate || null,
        qualificationExpiryDate: qualificationExpiryDate || null,
        tacitRenewal,
        renewalNoticeDays: tacitRenewal ? preavis : null,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-linen border border-line rounded-md p-3">
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

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Début de contrat
          <input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Fin de contrat
          <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Expiration qualification
          <input type="date" value={qualificationExpiryDate} onChange={(e) => setQualificationExpiryDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
      </div>

      {/* La reconduction tacite ne se joue pas à la fin du contrat mais au
          préavis de dénonciation : c'est cette date-là que le tableau de
          bord surveille, un mois à l'avance. Le rappeler ici évite qu'on
          renseigne un préavis sans comprendre ce qu'il déclenche. */}
      <div className="border-t border-line pt-2 flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={tacitRenewal}
            onChange={(e) => {
              setTacitRenewal(e.target.checked);
              // Un préavis vide ne déclenche aucune alerte : cocher la case
              // sans rien saisir donnerait le sentiment d'être couvert alors
              // que rien ne surveille. La valeur proposée est corrigeable.
              if (e.target.checked && renewalNoticeDays.trim() === "") {
                setRenewalNoticeDays(String(PREAVIS_PAR_DEFAUT));
              }
            }}
            className="accent-sage"
          />
          Contrat à reconduction tacite
        </label>
        {tacitRenewal && (
          <>
            <label className="text-[11.5px] text-slate flex items-center gap-1.5">
              Préavis de dénonciation
              <input
                type="number"
                min={0}
                max={365}
                value={renewalNoticeDays}
                onChange={(e) => setRenewalNoticeDays(e.target.value)}
                className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-20"
              />
              jours avant la fin de contrat
            </label>
            <div className="text-[11px] text-slate">
              {contractEndDate && preavis !== null && !preavisInvalide
                ? `Vous serez alerté un mois avant la date limite de dénonciation. Passé ce préavis, le contrat repart pour un tour.`
                : "Renseignez la fin de contrat et le préavis pour être alerté avant la date limite de dénonciation."}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={loading || !name.trim() || preavisInvalide}>
          {loading ? "…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
      </div>
      {preavisInvalide && <div className="text-[11.5px] text-rust">Le préavis doit être un nombre de jours entre 0 et 365.</div>}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
