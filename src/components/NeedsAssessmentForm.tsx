"use client";

import { useState } from "react";

export function NeedsAssessmentForm({ token }: { token: string }) {
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/public/needs-assessment/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseText }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white border border-line rounded-card p-6 text-center">
        <div className="text-[14px] text-ink font-medium mb-1.5">Merci, votre réponse a bien été envoyée.</div>
        <div className="text-[12.5px] text-slate">L&apos;organisme de formation reviendra vers vous prochainement.</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
      <label className="text-[12.5px] text-slate">Votre réponse</label>
      <textarea
        required
        value={responseText}
        onChange={(e) => setResponseText(e.target.value)}
        rows={10}
        placeholder="Décrivez votre situation, vos objectifs et vos contraintes…"
        className="border border-line rounded-md px-3 py-2.5 text-[13px] text-ink outline-none focus:border-seal leading-relaxed"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-ink text-white text-[13px] font-medium rounded-md py-2.5 hover:bg-ink-soft disabled:opacity-60 self-start px-5"
      >
        {loading ? "Envoi…" : "Envoyer ma réponse"}
      </button>
      {error && <div className="text-[12.5px] text-rust">{error}</div>}
    </form>
  );
}
