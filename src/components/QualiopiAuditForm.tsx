"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

const LABEL = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";
const FIELD = "bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

// Mirrors the certifier's "Synthèse de l'audit" sheet (type, date, durée,
// à distance, conclusions, prochain audit + date prévisionnelle) so staff
// can copy it field-for-field the day they receive it. The next-audit date
// also feeds Organization.nextAuditDate server-side — no retyping on the
// Indicateurs tab.
export function QualiopiAuditForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"initial" | "surveillance" | "renouvellement" | "complementaire">("surveillance");
  const [auditDate, setAuditDate] = useState("");
  const [certifierName, setCertifierName] = useState("");
  const [auditorName, setAuditorName] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [remote, setRemote] = useState(false);
  const [conclusions, setConclusions] = useState("");
  const [nextAuditType, setNextAuditType] = useState("");
  const [nextAuditDate, setNextAuditDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/qualiopi/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        auditDate,
        certifierName,
        auditorName: auditorName || undefined,
        durationDays: durationDays ? parseFloat(durationDays) : undefined,
        remote,
        conclusions: conclusions || undefined,
        nextAuditType: nextAuditType || undefined,
        nextAuditDate: nextAuditDate || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setOpen(false);
    setAuditDate("");
    setConclusions("");
    setNextAuditType("");
    setNextAuditDate("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Enregistrer un audit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-mist border border-line rounded-md p-3.5 max-w-xl">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Type d&apos;audit</label>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={FIELD}>
            <option value="initial">Audit initial</option>
            <option value="surveillance">Audit de surveillance</option>
            <option value="renouvellement">Audit de renouvellement</option>
            <option value="complementaire">Audit complémentaire</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Date de l&apos;audit</label>
          <input required type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Organisme certificateur</label>
          <input required value={certifierName} onChange={(e) => setCertifierName(e.target.value)} placeholder="ex. AB Certification" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Auditeur (facultatif)</label>
          <input value={auditorName} onChange={(e) => setAuditorName(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Durée (jours)</label>
          <input type="number" step="0.5" min="0.5" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="ex. 1" className={FIELD} />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink self-end pb-1.5">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} className="accent-sage" />
          Audit à distance
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Conclusions et recommandations (synthèse de l&apos;audit)</label>
        <textarea
          value={conclusions}
          onChange={(e) => setConclusions(e.target.value)}
          rows={3}
          placeholder="ex. Aucun écart relevé. L'auditeur recommande le maintien de la certification."
          className={`${FIELD} resize-none`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Prochain audit annoncé</label>
          <select value={nextAuditType} onChange={(e) => setNextAuditType(e.target.value)} className={FIELD}>
            <option value="">— Non précisé —</option>
            <option value="surveillance">Surveillance</option>
            <option value="renouvellement">Renouvellement</option>
            <option value="complementaire">Complémentaire</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Date prévisionnelle</label>
          <input type="date" value={nextAuditDate} onChange={(e) => setNextAuditDate(e.target.value)} className={FIELD} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "…" : "Enregistrer l'audit"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
