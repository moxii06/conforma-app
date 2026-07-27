"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";
const FIELD = "bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

// Fields copied 1:1 from a real certificate (AB Certification 225-DS-02):
// number, certifier, original issue date, end of validity, L.6313-1
// categories. The certificate is reissued at each renewal keeping its
// number and original date — so this edits "the current certificate"
// rather than accumulating one row per reissue.
export function QualiopiCertificateForm({
  initial,
}: {
  initial: {
    qualiopiCertificateNumber: string | null;
    qualiopiCertifier: string | null;
    qualiopiCertifiedSince: string | null; // yyyy-mm-dd
    qualiopiCertificateUntil: string | null;
    qualiopiCategories: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(initial.qualiopiCertificateNumber ?? "");
  const [certifier, setCertifier] = useState(initial.qualiopiCertifier ?? "");
  const [since, setSince] = useState(initial.qualiopiCertifiedSince ?? "");
  const [until, setUntil] = useState(initial.qualiopiCertificateUntil ?? "");
  const [categories, setCategories] = useState(initial.qualiopiCategories ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/organization/qualiopi-certificate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qualiopiCertificateNumber: number || null,
        qualiopiCertifier: certifier || null,
        qualiopiCertifiedSince: since || null,
        qualiopiCertificateUntil: until || null,
        qualiopiCategories: categories || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        {initial.qualiopiCertificateNumber ? "Modifier" : "Renseigner mon certificat"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-linen border border-line rounded-md p-3.5 mt-2">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>N° de certificat</label>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="ex. RNQ 3755" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Organisme certificateur</label>
          <input value={certifier} onChange={(e) => setCertifier(e.target.value)} placeholder="ex. AB Certification" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Certifié depuis (émission initiale)</label>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Fin de validité</label>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={FIELD} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Catégories d&apos;actions couvertes</label>
        <input
          value={categories}
          onChange={(e) => setCategories(e.target.value)}
          placeholder="ex. Actions de formation (L.6313-1 1°)"
          className={FIELD}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
