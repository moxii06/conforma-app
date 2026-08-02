"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Standalone on purpose — this is NOT a Jalon account login (see
// src/lib/platformAdmin.ts): no email, just the one shared secret.
export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/plateforme/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur de connexion.");
      return;
    }
    router.push("/plateforme");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-6 w-full max-w-sm flex flex-col gap-3.5">
        <div>
          <div className="text-[15px] font-semibold text-ink">Espace plateforme</div>
          <div className="text-[12.5px] text-slate mt-1">Réservé à l'exploitant de Jalon — pas un compte d'organisme.</div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          autoFocus
          className="bg-white border border-line rounded-md px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
        />
        {error && <div className="text-[12.5px] text-rust">{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          className="bg-ink text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:bg-ink-soft disabled:opacity-50"
        >
          {loading ? "…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
