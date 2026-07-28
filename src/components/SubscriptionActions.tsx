"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/billing";

export function SubscriptionActions({
  currentPlan,
  hasPaidSubscription,
  billingEnabled,
  prices,
}: {
  currentPlan: string;
  /** True once a Stripe customer exists — i.e. something has been paid. */
  hasPaidSubscription: boolean;
  billingEnabled: boolean;
  prices: Record<string, { amountCents: number; currency: string } | null>;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(url: string, body?: unknown, key?: string) {
    setLoading(key ?? url);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      setLoading(null);
      setError(data?.error ?? "L'opération a échoué.");
      return;
    }
    // Straight to Stripe — no loading state to clear, the page is leaving.
    window.location.href = data.url;
  }

  if (!billingEnabled) {
    return (
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13px] font-semibold text-ink mb-1">Souscrire une formule</div>
        <div className="text-[12.5px] text-slate">
          La souscription en ligne n&apos;est pas encore activée sur cette installation. Contactez-nous pour passer
          sur une formule payante.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="bg-[#E9D8D3] text-rust text-[12.5px] rounded-md px-3 py-2.5">{error}</div>}

      {hasPaidSubscription && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13px] font-semibold text-ink mb-1">Gérer mon abonnement</div>
          <div className="text-[12.5px] text-slate mb-3.5">
            Moyen de paiement, factures, changement de formule et résiliation — le tout sur l&apos;espace sécurisé
            de Stripe. Vos coordonnées bancaires ne transitent jamais par Jalon.
          </div>
          <button
            onClick={() => go("/api/billing/portal", undefined, "portal")}
            disabled={loading !== null}
            className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft disabled:opacity-60"
          >
            {loading === "portal" ? "Ouverture…" : "Ouvrir l'espace de facturation"}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        {PLANS.map((plan) => {
          const price = prices[plan.key];
          const isCurrent = plan.key === currentPlan && hasPaidSubscription;
          return (
            <div
              key={plan.key}
              className={`bg-white border rounded-card p-4 flex flex-col ${isCurrent ? "border-seal" : "border-line"}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[14px] font-display text-ink">{plan.label}</span>
                {isCurrent && (
                  <span className="text-[10.5px] font-semibold text-seal-dark uppercase tracking-wide">
                    Formule actuelle
                  </span>
                )}
              </div>
              <div className="text-[15px] text-ink tabular-nums mb-1">
                {price ? (
                  <>
                    {(price.amountCents / 100).toLocaleString("fr-FR", {
                      style: "currency",
                      currency: price.currency.toUpperCase(),
                    })}
                    <span className="text-[11.5px] text-slate"> HT / mois</span>
                  </>
                ) : (
                  <span className="text-[13px] text-slate">Sur devis</span>
                )}
              </div>
              <div className="text-[12px] text-slate mb-3">{plan.tagline}</div>

              <ul className="flex flex-col gap-1.5 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[12px] text-ink">
                    <Check size={13} className="text-sage mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => go("/api/billing/checkout", { plan: plan.key as PlanKey }, plan.key)}
                disabled={loading !== null || isCurrent || !price}
                className={`text-[12.5px] font-medium rounded-md px-3.5 py-2 disabled:opacity-60 ${
                  isCurrent ? "bg-linen text-slate" : "bg-ink text-white hover:bg-ink-soft"
                }`}
              >
                {loading === plan.key
                  ? "Redirection…"
                  : isCurrent
                    ? "Formule en cours"
                    : hasPaidSubscription
                      ? "Passer sur cette formule"
                      : "Choisir cette formule"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-[11.5px] text-slate">
        Paiement sécurisé par Stripe. Les tarifs affichés sont hors taxes ; la TVA applicable et votre numéro
        intracommunautaire sont demandés au moment du paiement.
      </div>
    </div>
  );
}
