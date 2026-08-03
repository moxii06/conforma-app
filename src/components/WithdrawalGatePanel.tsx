"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * What a learner sees while their withdrawal period keeps the content
 * gated: the opening date, the express-request checkbox, and — just as
 * deliberately — the statement that refusing costs them nothing but time.
 *
 * The checkbox starts unchecked and the button stays disabled until it is
 * ticked: a pre-ticked box is not express consent, and the server records
 * that it started unchecked. The text shown here is the same server-side
 * constant the waiver row freezes (WAIVER_TEXT, passed down by the page) —
 * what is displayed is exactly what is archived.
 */
export function WithdrawalGatePanel({
  dossierId,
  endsAtLabel,
  waiverText,
  partial,
}: {
  dossierId: string;
  endsAtLabel: string;
  waiverText: string;
  /** True when some modules are already open (policy "partial"). */
  partial: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/mon-espace/withdrawal-waiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId }),
    });
    setSending(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Une erreur est survenue.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-linen border border-line rounded-card p-5 flex flex-col gap-3.5">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">
          {partial ? "Une partie de votre formation ouvrira le " : "Votre formation ouvrira le "}
          {endsAtLabel}
        </div>
        <p className="text-[12px] text-slate mt-1 leading-relaxed">
          Votre contrat vient d&apos;être signé : vous disposez d&apos;un délai de rétractation de quatorze jours.
          {partial
            ? " Les contenus d'accueil ci-dessous sont déjà accessibles ; les modules de formation ouvriront à la fin de ce délai."
            : " Les modules de formation ouvriront automatiquement à la fin de ce délai."}{" "}
          <strong className="text-ink">
            Vous n&apos;avez rien à faire : attendre ne vous coûte rien et préserve l&apos;intégralité de vos droits.
          </strong>
        </p>
      </div>

      <div className="border-t border-line pt-3.5 flex flex-col gap-2.5">
        <div className="text-[12px] text-ink font-medium">Commencer sans attendre ?</div>
        <p className="text-[11.5px] text-slate leading-relaxed whitespace-pre-line">{waiverText}</p>
        <label className="flex items-start gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="accent-rust mt-0.5"
          />
          <span>J&apos;ai lu ce qui précède et je formule cette demande expresse.</span>
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={submit} disabled={!checked || sending} className="self-start">
            {sending ? "…" : "Accéder dès maintenant à ma formation"}
          </Button>
          {error && <span className="text-[11.5px] text-rust">{error}</span>}
        </div>
      </div>
    </div>
  );
}
