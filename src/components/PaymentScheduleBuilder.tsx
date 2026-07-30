"use client";

import { useMemo, useState } from "react";
import { Plus, X, Wand2 } from "lucide-react";
import {
  reviewSchedule,
  compliantSchedule,
  capAppliesTo,
  type Instalment,
} from "@/lib/paymentSchedule";

function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function toCents(input: string): number {
  const n = Number(input.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Free-form payment schedule, measured against the ceiling of art. L.6353-6
 * rather than constrained by it.
 *
 * Not blocking was an explicit decision: an organisation is entitled to run
 * its business as it sees fit, and a generator that refuses to produce the
 * document simply drives the work back to Word, where nothing is checked at
 * all. So the warning is about money — how many euros over, on which
 * instalment — with the compliant alternative one click away, because a
 * remedy that costs one click gets taken and a lecture does not.
 *
 * The acknowledgement is recorded and remembered per organisation. Recorded
 * because the day an organisation disputes having been told, this answers
 * it; remembered because a warning that reappears on every contract is
 * wallpaper within a week.
 */
export function PaymentScheduleBuilder({
  priceCents,
  category,
  startsAt,
  endsAt,
  value,
  onChange,
  capAcknowledged,
  onAcknowledge,
}: {
  priceCents: number;
  category: string;
  startsAt: Date;
  endsAt: Date;
  value: Instalment[];
  onChange: (next: Instalment[]) => void;
  /** True once this organisation has accepted exceeding the ceiling before. */
  capAcknowledged: boolean;
  onAcknowledge: () => Promise<void> | void;
}) {
  const [acknowledging, setAcknowledging] = useState(false);
  const review = useMemo(
    () => reviewSchedule(value, priceCents, category),
    [value, priceCents, category],
  );
  const capApplies = capAppliesTo(category);
  const needsAck = review.overshootCents > 0 && !capAcknowledged;

  function update(index: number, patch: Partial<Instalment>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const last = value[value.length - 1];
    onChange([
      ...value,
      {
        dueDate: last?.dueDate ?? startsAt.toISOString().slice(0, 10),
        amountCents: Math.max(0, review.balanceCents),
      },
    ]);
  }

  async function acknowledge() {
    setAcknowledging(true);
    await onAcknowledge();
    setAcknowledging(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[12.5px] font-medium text-ink">Échéancier de règlement</h4>
        <span className="text-[11.5px] text-slate tabular-nums">
          {euros(review.totalCents)} / {euros(priceCents)}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {value.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="date"
              value={row.dueDate}
              onChange={(e) => update(i, { dueDate: e.target.value })}
              className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
            />
            <input
              inputMode="decimal"
              value={fromCents(row.amountCents)}
              onChange={(e) => update(i, { amountCents: toCents(e.target.value) })}
              aria-label={`Montant de l'échéance ${i + 1}`}
              className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal w-28 text-right tabular-nums"
            />
            <span className="text-[11.5px] text-slate">€</span>
            <input
              value={row.label ?? ""}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Intitulé (facultatif)"
              className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label={`Retirer l'échéance ${i + 1}`}
              className="text-slate hover:text-rust shrink-0"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-[11.5px] text-slate hover:text-ink underline decoration-line"
        >
          <Plus size={12} /> Ajouter une échéance
        </button>
        <button
          type="button"
          onClick={() => onChange(compliantSchedule(priceCents, startsAt, endsAt))}
          className="flex items-center gap-1 text-[11.5px] text-slate hover:text-ink underline decoration-line"
        >
          <Wand2 size={12} /> Proposer un échéancier conforme
        </button>
      </div>

      {review.problems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {review.problems.map((p) => (
            <li key={p} className="text-[11.5px] text-rust">
              {p}
            </li>
          ))}
        </ul>
      )}

      {/* Chiffré, pas juridique : « 1 680 € au-dessus » agit, « article
          L.6353-6 » se survole. La référence vient après, pour qui veut
          vérifier. */}
      {review.overshootCents > 0 && (
        <div className="bg-rust/10 border border-rust/30 rounded-card px-3.5 py-3 flex flex-col gap-2">
          <div className="text-[12.5px] text-ink">
            Vous encaissez <strong>{euros(review.firstInstalmentCents)}</strong> à la première échéance. Le plafond
            légal est de <strong>{euros(review.capCents)}</strong> — soit{" "}
            <strong>{euros(review.overshootCents)} de dépassement</strong>.
          </div>
          <div className="text-[11.5px] text-slate">
            La stipulation contraire est réputée non écrite : l&apos;apprenant peut réclamer la restitution de
            l&apos;excédent, et c&apos;est un point regardé en contrôle. Vous restez libre de maintenir cet
            échéancier.
          </div>
          {needsAck ? (
            <label className="flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={false}
                disabled={acknowledging}
                onChange={acknowledge}
                className="accent-rust mt-0.5"
              />
              <span>
                J&apos;ai pris connaissance de ce dépassement et je le maintiens en connaissance de cause.
              </span>
            </label>
          ) : (
            <div className="text-[11.5px] text-sage">Dépassement acquitté pour votre organisme.</div>
          )}
        </div>
      )}

      {!capApplies && (
        <p className="text-[11px] text-slate">
          Le plafond de 30 % ne s&apos;applique qu&apos;au contrat conclu avec un particulier à ses frais. Une
          convention d&apos;entreprise peut être réglée intégralement d&apos;avance.
        </p>
      )}
    </div>
  );
}
