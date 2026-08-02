"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformEmailComposer({ organizationId, defaultTo }: { organizationId: string; defaultTo: string }) {
  const router = useRouter();
  const [toEmail, setToEmail] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/plateforme/organizations/${organizationId}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail,
        subject,
        body,
        scheduledAt: mode === "later" && date ? new Date(date).toISOString() : undefined,
      }),
    });
    const result = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(result.error ?? "Erreur.");
      return;
    }
    setSuccess(
      result.sentAt
        ? "Email envoyé."
        : mode === "later"
          ? "Email programmé."
          : "Enregistré — l'envoi immédiat a échoué, une nouvelle tentative automatique est programmée.",
    );
    setSubject("");
    setBody("");
    setDate("");
    router.refresh();
  }

  const canSubmit = toEmail.trim() && subject.trim() && body.trim() && (mode === "now" || date);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate font-medium">À</span>
        <input
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Sujet</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft resize-y"
        />
      </label>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink cursor-pointer">
          <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} />
          Envoyer maintenant
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink cursor-pointer">
          <input type="radio" checked={mode === "later"} onChange={() => setMode("later")} />
          Programmer
        </label>
        {mode === "later" && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />
        )}
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
      {success && <div className="text-[11.5px] text-sage">{success}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={loading || !canSubmit}
        className="text-[12.5px] font-medium text-seal hover:underline disabled:opacity-50 self-start"
      >
        {loading ? "…" : mode === "now" ? "Envoyer" : "Programmer l'envoi"}
      </button>
    </div>
  );
}
