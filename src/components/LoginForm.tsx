"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Milestone } from "lucide-react";
import { GOOGLE_LOGIN_PROVIDER_ID, SOCIAL_LOGIN_DENIED } from "@/lib/authProviders";

// Google's brand mark, inlined rather than fetched — the login page must
// render identically offline and behind a strict CSP, and this is the one
// place a third party's logo is legitimately required (their branding rules
// ask for the official G on sign-in buttons).
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

// Same login form, same auth flow, for both audiences — role-based
// redirect already happens server-side after auth (see /dashboard). The
// ?as= param only changes the heading copy, so a learner arriving from
// the homepage's "Espace apprenant" link isn't confused by staff-facing
// wording, without needing a second form or endpoint.
export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLearner = searchParams.get("as") === "learner";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Google sign-in only authenticates already-provisioned staff accounts
  // (see findActiveStaffByEmail in src/lib/auth.ts), so it stays off the
  // learner-flavoured login entirely — offering a button that is guaranteed
  // to refuse them would be worse than not offering it.
  const showGoogle = googleEnabled && !isLearner;

  // NextAuth redirects back here with ?error= when the OAuth flow is
  // refused. Ours is deliberately non-specific about *why*; anything else
  // is a provider/config failure the visitor can't act on.
  const oauthError = searchParams.get("error");
  const oauthErrorMessage =
    oauthError === SOCIAL_LOGIN_DENIED
      ? "Aucun compte Jalon actif ne correspond à ce compte Google. La connexion Google est réservée aux membres de l'organisme dont le compte est déjà créé et activé."
      : oauthError
        ? "La connexion via Google a échoué. Réessayez ou utilisez votre email et mot de passe."
        : null;

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
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
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
          {oauthErrorMessage && (
            <div className="bg-[#E9D8D3] text-rust text-[12px] rounded-md px-3 py-2.5 leading-snug">{oauthErrorMessage}</div>
          )}

          {showGoogle && (
            <>
              <button
                type="button"
                onClick={() => signIn(GOOGLE_LOGIN_PROVIDER_ID, { callbackUrl: "/dashboard" })}
                className="flex items-center justify-center gap-2.5 border border-line rounded-md py-2.5 text-sm font-medium text-ink hover:bg-linen"
              >
                <GoogleMark />
                Continuer avec Google
              </button>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="text-[11px] text-slate uppercase tracking-wide">ou</span>
                <div className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

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
    </main>
  );
}
