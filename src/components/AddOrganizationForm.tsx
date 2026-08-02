"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLAN_OPTIONS: { value: "solo" | "team" | "growth"; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "team", label: "Team" },
  { value: "growth", label: "Growth" },
];

export function AddOrganizationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"solo" | "team" | "growth">("solo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ activationUrl: string; emailSent: boolean } | null>(null);

  function reset() {
    setOrganizationName("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPlan("solo");
    setError(null);
    setResult(null);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/plateforme/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationName, firstName, lastName, email, plan }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur.");
      return;
    }
    setResult({ activationUrl: body.activationUrl, emailSent: body.emailSent });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-medium text-seal hover:underline shrink-0"
      >
        + Ajouter un organisme
      </button>
    );
  }

  if (result) {
    return (
      <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5 max-w-md">
        <div className="text-[13px] font-semibold text-ink">Organisme créé</div>
        {result.emailSent ? (
          <p className="text-[12.5px] text-slate leading-relaxed">
            L&apos;email d&apos;activation a été envoyé à {email}.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12.5px] text-rust leading-relaxed">
              L&apos;email n&apos;a pas pu être envoyé — transmettez ce lien d&apos;activation à la main :
            </p>
            <div className="text-[11.5px] text-ink bg-mist border border-line rounded-md px-2 py-1.5 break-all">
              {result.activationUrl}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[12px] text-slate hover:text-ink self-start mt-1"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3 max-w-md">
      <div className="text-[13px] font-semibold text-ink">Ajouter un organisme</div>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Nom de l&apos;organisme</span>
          <input
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Prénom</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Nom</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Email du responsable</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate font-medium">Offre</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as typeof plan)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft bg-white"
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11.5px] text-slate leading-relaxed">
        Crée l&apos;organisme avec un abonnement en essai et envoie un lien d&apos;activation au responsable pour
        qu&apos;il choisisse lui-même son mot de passe.
      </p>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={loading || !organizationName || !firstName || !lastName || !email}
          className="text-[12.5px] font-medium text-seal hover:underline disabled:opacity-50"
        >
          {loading ? "Création…" : "Créer l'organisme"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[12.5px] text-slate hover:text-ink"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
