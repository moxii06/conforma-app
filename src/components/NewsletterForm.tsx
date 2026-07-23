"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setStatus(res.ok ? "done" : "error");
  }

  if (status === "done") {
    return <div className="text-[13px] text-sage">Inscription confirmée — merci !</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      <input
        type="email"
        required
        placeholder="vous@organisme.fr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-white border border-line rounded-md px-3 py-2 text-[13px] text-ink w-64 focus:outline-none focus:border-ink-soft"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="bg-ink text-white text-[13px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft disabled:opacity-60"
      >
        {status === "saving" ? "…" : "S'inscrire"}
      </button>
      {status === "error" && <div className="text-[12px] text-rust w-full">Une erreur est survenue, réessayez.</div>}
    </form>
  );
}
