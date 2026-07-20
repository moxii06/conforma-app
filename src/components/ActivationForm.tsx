"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function ActivationForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/public/activation/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'activation.");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Mot de passe</label>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 caractères minimum"
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        />
      </div>
      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Confirmer le mot de passe</label>
        <input
          required
          type="password"
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        />
      </div>
      {error && <div className="text-[12.5px] text-rust">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="bg-ink text-white text-sm font-medium rounded-md py-2.5 mt-1 hover:bg-ink-soft disabled:opacity-60"
      >
        {loading ? "Activation…" : "Activer mon compte"}
      </button>
    </form>
  );
}
