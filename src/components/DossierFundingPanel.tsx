"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { X, TriangleAlert } from "lucide-react";
import {
  computeFundingSummary,
  formatCents,
  COMMITMENT_STATUS_LABELS,
  FUNDER_TYPE_LABELS,
  type CommitmentStatus,
} from "@/lib/funding";

export type FunderOption = { id: string; name: string; type: string };

export type CommitmentRow = {
  id: string;
  funderId: string;
  funderName: string;
  funderType: string;
  amountCents: number;
  subrogation: boolean;
  agreementNumber: string | null;
  validUntil: string | null; // ISO
  status: string;
};

const STATUS_TONES: Record<string, "neutral" | "warn" | "good" | "danger"> = {
  requested: "warn",
  granted: "good",
  refused: "danger",
  invoiced: "neutral",
  paid: "good",
};

export function DossierFundingPanel({
  dossierId,
  totalCents,
  usesCoursePrice,
  commitments,
  funders,
  canEdit,
}: {
  dossierId: string;
  totalCents: number;
  /** True when no price was negotiated and the course's catalogue price is used. */
  usesCoursePrice: boolean;
  commitments: CommitmentRow[];
  funders: FunderOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [funderId, setFunderId] = useState("");
  const [amount, setAmount] = useState("");
  const [subrogation, setSubrogation] = useState(true);
  const [agreementNumber, setAgreementNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<CommitmentStatus>("requested");

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState((totalCents / 100).toString());

  const summary = computeFundingSummary(
    totalCents,
    commitments.map((c) => ({
      amountCents: c.amountCents,
      status: c.status,
      subrogation: c.subrogation,
      validUntil: c.validUntil ? new Date(c.validUntil) : null,
    })),
  );

  async function addCommitment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/dossiers/${dossierId}/funding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funderId,
        amountCents: Math.round(parseFloat(amount.replace(",", ".")) * 100),
        subrogation,
        agreementNumber: agreementNumber || undefined,
        validUntil: validUntil || undefined,
        status,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "L'enregistrement a échoué.");
      return;
    }
    setAdding(false);
    setFunderId("");
    setAmount("");
    setAgreementNumber("");
    setValidUntil("");
    setStatus("requested");
    router.refresh();
  }

  async function changeStatus(commitmentId: string, next: string) {
    await fetch(`/api/dossiers/${dossierId}/funding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitmentId, status: next }),
    });
    router.refresh();
  }

  async function remove(commitmentId: string) {
    await fetch(`/api/dossiers/${dossierId}/funding?commitmentId=${commitmentId}`, { method: "DELETE" });
    router.refresh();
  }

  async function savePrice() {
    const cents = Math.round(parseFloat(priceInput.replace(",", ".")) * 100);
    if (Number.isNaN(cents)) return;
    await fetch(`/api/dossiers/${dossierId}/funding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agreedPriceCents: cents }),
    });
    setEditingPrice(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* The three numbers an OF actually asks for, in the order they ask:
          what it costs, what's covered, what's left. "Demandé" sits apart
          because it is explicitly NOT covered yet. */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-linen border border-line rounded-md p-3">
          <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1">Coût</div>
          <div className="text-[15px] text-ink tabular-nums">{formatCents(summary.totalCents)}</div>
          {canEdit &&
            (editingPrice ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-20 bg-white border border-line rounded-md px-1.5 py-0.5 text-[12px] text-ink outline-none focus:border-seal"
                />
                <button onClick={savePrice} className="text-[11px] text-ink underline decoration-line">OK</button>
                <button onClick={() => setEditingPrice(false)} className="text-[11px] text-slate">Annuler</button>
              </div>
            ) : (
              <button onClick={() => setEditingPrice(true)} className="text-[10.5px] text-slate hover:text-ink mt-0.5">
                {usesCoursePrice ? "Tarif catalogue — personnaliser" : "Prix négocié — modifier"}
              </button>
            ))}
        </div>
        <div className="bg-linen border border-line rounded-md p-3">
          <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1">Pris en charge</div>
          <div className="text-[15px] text-sage tabular-nums">{formatCents(summary.securedCents)}</div>
          {summary.pendingCents > 0 && (
            <div className="text-[10.5px] text-slate mt-0.5">
              {/* Explicit {" "}: the space after the expression gets swallowed
                  in the rendered output otherwise — "300,00 €en attente". */}
              + {formatCents(summary.pendingCents)}{" "}en attente d&apos;accord
            </div>
          )}
        </div>
        <div className="bg-linen border border-line rounded-md p-3">
          <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1">Reste à charge</div>
          <div className="text-[15px] text-ink tabular-nums">{formatCents(summary.remainderCents)}</div>
          {summary.subrogatedCents > 0 && (
            <div className="text-[10.5px] text-slate mt-0.5">
              {formatCents(summary.subrogatedCents)} facturés aux financeurs
            </div>
          )}
        </div>
      </div>

      {summary.overCommitted && (
        <div className="flex items-start gap-2 bg-[#E9D8D3] rounded-md px-3 py-2 text-[12px] text-rust">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Les prises en charge accordées dépassent le coût de la formation. Vérifiez les montants — le reste à
            charge affiché est plafonné à zéro.
          </span>
        </div>
      )}

      {summary.expiringSoon.length > 0 && (
        <div className="flex items-start gap-2 bg-[#F0E7D4] rounded-md px-3 py-2 text-[12px] text-seal-dark">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {summary.expiringSoon.length === 1 ? "Un accord de prise en charge arrive" : `${summary.expiringSoon.length} accords de prise en charge arrivent`}{" "}
            à échéance sous 30 jours. Un accord périmé est la première cause de non-paiement.
          </span>
        </div>
      )}

      {commitments.length === 0 ? (
        <div className="text-[12px] text-slate">
          Aucun financeur enregistré — la totalité reste à la charge du client.
        </div>
      ) : (
        <div className="flex flex-col">
          {commitments.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 py-2.5 border-t border-line first:border-t-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-ink font-medium truncate">{c.funderName}</span>
                  <span className="text-[10.5px] text-slate">{FUNDER_TYPE_LABELS[c.funderType] ?? c.funderType}</span>
                  {c.subrogation && <Pill tone="neutral">Subrogation</Pill>}
                </div>
                <div className="text-[11px] text-slate">
                  {c.agreementNumber ? `Accord ${c.agreementNumber}` : "Sans numéro d'accord"}
                  {c.validUntil && ` · valable jusqu'au ${new Date(c.validUntil).toLocaleDateString("fr-FR")}`}
                </div>
              </div>
              <div className="text-[12.5px] text-ink tabular-nums shrink-0">{formatCents(c.amountCents)}</div>
              {canEdit ? (
                <select
                  value={c.status}
                  onChange={(e) => changeStatus(c.id, e.target.value)}
                  className="bg-white border border-line rounded-md px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal shrink-0"
                >
                  {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              ) : (
                <Pill tone={STATUS_TONES[c.status] ?? "neutral"}>
                  {COMMITMENT_STATUS_LABELS[c.status as CommitmentStatus] ?? c.status}
                </Pill>
              )}
              {canEdit && (
                <button onClick={() => remove(c.id)} className="text-slate hover:text-rust shrink-0" title="Retirer">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && funders.length === 0 && (
        <div className="text-[11.5px] text-slate">
          Aucun financeur dans votre référentiel. Ajoutez-en un depuis Facturation, onglet Financeurs.
        </div>
      )}

      {canEdit && funders.length > 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink self-start"
        >
          + Ajouter un financeur
        </button>
      )}

      {canEdit && adding && (
        <form onSubmit={addCommitment} className="bg-linen border border-line rounded-md p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">Financeur</label>
              <select
                value={funderId}
                onChange={(e) => setFunderId(e.target.value)}
                required
                className="w-full bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              >
                <option value="">Choisir…</option>
                {funders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">Montant (€)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                inputMode="decimal"
                placeholder="1200"
                className="w-full bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal placeholder:text-ash"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">N° d&apos;accord</label>
              <input
                value={agreementNumber}
                onChange={(e) => setAgreementNumber(e.target.value)}
                placeholder="optionnel"
                className="w-full bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal placeholder:text-ash"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">Valable jusqu&apos;au</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CommitmentStatus)}
                className="w-full bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              >
                {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 text-[12px] text-ink">
            <input type="checkbox" checked={subrogation} onChange={(e) => setSubrogation(e.target.checked)} className="mt-0.5 accent-sage" />
            <span>
              Subrogation — nous facturons le financeur directement.
              <span className="text-slate"> Décochez si le client paie et se fait rembourser lui-même : le montant reste alors sur sa facture.</span>
            </span>
          </label>

          {error && <div className="text-[11.5px] text-rust">{error}</div>}

          <div className="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={loading}
              className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
            >
              {loading ? "…" : "Enregistrer"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-slate hover:text-ink">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
