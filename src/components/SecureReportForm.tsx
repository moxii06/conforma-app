"use client";

import { useState } from "react";

export function SecureReportForm() {
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/secure-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, reporterName, reporterContact, anonymous }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-[12.5px] text-sage">
        Signalement transmis. Seuls les administrateurs habilités y ont accès, et chaque consultation est tracée.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Décrivez les faits (dates, personnes concernées, contexte)"
        rows={4}
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-sage" />
        Envoyer ce signalement de façon anonyme
      </label>
      {!anonymous && (
        <div className="flex items-center gap-2">
          <input
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Votre nom (optionnel)"
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1"
          />
          <input
            value={reporterContact}
            onChange={(e) => setReporterContact(e.target.value)}
            placeholder="Contact pour un suivi (optionnel)"
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1"
          />
        </div>
      )}
      <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start">
        {loading ? "…" : "Envoyer le signalement"}
      </button>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
