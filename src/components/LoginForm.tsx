"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Milestone } from "lucide-react";

// Same login form, same auth flow, for both audiences — role-based
// redirect already happens server-side after auth (see /dashboard). The
// ?as= param only changes the heading copy, so a learner arriving from
// the homepage's "Espace apprenant" link isn't confused by staff-facing
// wording, without needing a second form or endpoint.
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLearner = searchParams.get("as") === "learner";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });

    setLoading(false);
    if (result?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-3">
          <div className="w-8 h-8 rounded-md bg-seal flex items-center justify-center">
            <Milestone size={18} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-xl text-ink tracking-wide">Jalon</div>
        </div>
        <div className="text-center text-[13px] text-slate mb-8">
          {isLearner ? "Espace apprenant" : "Espace organisme de formation"}
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-6 flex flex-col gap-4">
          <div>
            <label className="text-[12.5px] text-slate mb-1.5 block">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
              placeholder="marie@formations-nova.fr"
            />
          </div>
          <div>
            <label className="text-[12.5px] text-slate mb-1.5 block">Mot de passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-[12.5px] text-rust">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="bg-ink text-white text-sm font-medium rounded-md py-2.5 mt-1 hover:bg-ink-soft disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          <Link href="/mot-de-passe-oublie" className="text-center text-[12.5px] text-ink underline decoration-line hover:decoration-ink">
            Mot de passe oublié ?
          </Link>
        </form>
      </div>
    </div>
  );
}
