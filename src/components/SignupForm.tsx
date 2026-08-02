"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/track";

const PLAN_LABELS: Record<string, { name: string; price: string }> = {
  solo: { name: "Solo", price: "39 €/mois" },
  team: { name: "Team", price: "89 €/mois" },
  growth: { name: "Growth", price: "189 €/mois" },
};

export function SignupForm({ initialPlan }: { initialPlan: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [organizationName, setOrganizationName] = useState("");
  const [phone, setPhone] = useState("");
  const [siret, setSiret] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [showBilling, setShowBilling] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName,
        phone,
        siret,
        billingAddress,
        billingPostalCode,
        billingCity,
        firstName,
        lastName,
        email,
        password,
        plan,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la création du compte.");
      setLoading(false);
      return;
    }

    // Conversion principale : compte d'essai créé.
    trackEvent("sign_up", { method: "trial", plan });

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Compte créé, mais la connexion automatique a échoué — connectez-vous manuellement.");
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-6 flex flex-col gap-4">
      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Offre choisie</label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        >
          {Object.entries(PLAN_LABELS).map(([value, { name, price }]) => (
            <option key={value} value={value}>
              {name} — {price}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Nom de votre organisme</label>
        <input
          required
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          placeholder="Formations Nova"
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[12.5px] text-slate mb-1.5 block">Prénom</label>
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
          />
        </div>
        <div className="flex-1">
          <label className="text-[12.5px] text-slate mb-1.5 block">Nom</label>
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
          />
        </div>
      </div>

      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Email professionnel</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        />
      </div>

      <div>
        <label className="text-[12.5px] text-slate mb-1.5 block">Téléphone</label>
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="06 12 34 56 78"
          className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
        />
      </div>

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

      {/* Coordonnées de facturation — optionnelles à l'inscription, requises
          seulement avant la fin de l'essai. Repliées par défaut pour ne pas
          alourdir un essai « sans carte bancaire ». */}
      {!showBilling ? (
        <button
          type="button"
          onClick={() => setShowBilling(true)}
          className="text-[12px] text-slate hover:text-ink text-left underline decoration-line hover:decoration-ink"
        >
          + Ajouter mes coordonnées de facturation (optionnel)
        </button>
      ) : (
        <div className="border border-line rounded-md p-4 flex flex-col gap-3 bg-paper/50">
          <div className="text-[12px] text-slate">
            Optionnel — utile uniquement pour établir vos factures d&apos;abonnement Jalon
            à la fin de l&apos;essai. Vous pourrez aussi les renseigner plus tard depuis votre espace.
          </div>
          <div>
            <label className="text-[12.5px] text-slate mb-1.5 block">
              SIRET <span className="text-slate/70 font-normal">(14 chiffres)</span>
            </label>
            <input
              value={siret}
              onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
              inputMode="numeric"
              placeholder="12345678900012"
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
            />
          </div>
          <div>
            <label className="text-[12.5px] text-slate mb-1.5 block">Adresse de facturation</label>
            <input
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder="12 rue de la Paix"
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal mb-2"
            />
            <div className="flex gap-3">
              <input
                value={billingPostalCode}
                onChange={(e) => setBillingPostalCode(e.target.value)}
                placeholder="75002"
                className="w-28 border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
              />
              <input
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                placeholder="Paris"
                className="flex-1 border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal"
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-[12.5px] text-rust">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="bg-ink text-white text-sm font-medium rounded-md py-2.5 mt-1 hover:bg-ink-soft disabled:opacity-60"
      >
        {loading ? "Création du compte…" : "Créer mon compte d'essai"}
      </button>
      <div className="text-[11.5px] text-slate text-center">
        14 jours d&apos;essai gratuit, sans carte bancaire. Aucun engagement.
      </div>
    </form>
  );
}
