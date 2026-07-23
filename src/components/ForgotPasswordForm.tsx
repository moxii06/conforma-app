"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/public/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Always the same outcome regardless of the response — see the route's
    // comment: we don't want the UI to leak whether the email has an account.
    setLoading(false);
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 rounded-md bg-seal flex items-center justify-center">
            <ShieldCheck size={18} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-xl text-ink tracking-wide">Conforma</div>
        </div>

        <div className="bg-white border border-line rounded-card p-6">
          {done ? (
            <div className="text-center">
              <div className="text-[13.5px] font-medium text-ink mb-1.5">Email envoyé</div>
              <div className="text-[12.5px] text-slate">
                Si un compte existe pour cette adresse, un lien de réinitialisation valable 1 heure vient de lui être
                envoyé.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <div className="text-[13.5px] font-medium text-ink mb-1">Mot de passe oublié</div>
                <div className="text-[12.5px] text-slate mb-3">
                  Indiquez votre email, nous vous enverrons un lien pour définir un nouveau mot de passe.
                </div>
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
              <button
                type="submit"
                disabled={loading}
                className="bg-ink text-white text-sm font-medium rounded-md py-2.5 hover:bg-ink-soft disabled:opacity-60"
              >
                {loading ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>
          )}
          <Link href="/login" className="block text-center text-[12.5px] text-ink underline decoration-line hover:decoration-ink mt-4">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
