"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ComplaintForm({ dossiers }: { dossiers: { id: string; label: string }[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, description, dossierId: dossierId || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setSubject("");
    setDescription("");
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <div className="text-[12.5px] text-sage">Réclamation envoyée — merci, elle sera traitée par l&apos;équipe.</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      {dossiers.length > 0 && (
        <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink">
          <option value="">Formation concernée (optionnel)</option>
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      )}
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Objet"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Décrivez votre réclamation"
        rows={3}
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start">
        {loading ? "…" : "Envoyer"}
      </button>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
