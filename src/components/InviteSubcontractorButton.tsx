"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.TRAINER, label: "Formateur" },
  { value: Role.SALES, label: "Commercial" },
  { value: Role.ADMIN_MANAGER, label: "Admin (accès limité)" },
];

export function InviteSubcontractorButton({ subcontractorId, hasEmail }: { subcontractorId: string; hasEmail: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(Role.TRAINER);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ activationUrl: string; emailSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'invitation.");
      return;
    }
    const body = await res.json();
    setResult({ activationUrl: body.activationUrl, emailSent: body.emailSent });
    router.refresh();
  }

  if (!hasEmail) {
    return <span className="text-[11px] text-slate">Ajoutez un email de contact pour pouvoir inviter</span>;
  }

  if (result) {
    return (
      <div className="text-[11.5px] text-sage">
        {result.emailSent ? "Invitation envoyée par email." : "Compte créé — lien à transmettre :"}
        {!result.emailSent && (
          <a href={result.activationUrl} target="_blank" rel="noreferrer" className="text-ink underline ml-1 break-all">
            {result.activationUrl}
          </a>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Inviter sur la plateforme
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="border border-line rounded-md px-2 py-1 text-[11.5px] text-ink outline-none focus:border-seal">
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button type="button" onClick={handleInvite} disabled={loading} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading ? "…" : "Envoyer l'invitation"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11.5px] text-slate hover:text-ink">Annuler</button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
