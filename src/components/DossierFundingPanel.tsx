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
  AWAITING_FUNDER,
  type CommitmentStatus,
  type ReadinessItem,
} from "@/lib/funding";
import { CheckCircle2, Circle } from "lucide-react";

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
  depositedAt: string | null; // ISO
  status: string;
  /** Reference of the invoice raised on this commitment, if any. */
  invoiceReference: string | null;
};

const STATUS_TONES: Record<string, "neutral" | "warn" | "good" | "danger"> = {
  draft: "neutral",
  deposited: "warn",
  instructing: "warn",
  granted: "good",
  refused: "danger",
  invoiced: "neutral",
  paid: "good",
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function DossierFundingPanel({
  dossierId,
  totalCents,
  usesCoursePrice,
  commitments,
  funders,
  canEdit,
  readiness,
}: {
  dossierId: string;
  totalCents: number;
  /** True when no price was negotiated and the course's catalogue price is used. */
  usesCoursePrice: boolean;
  commitments: CommitmentRow[];
  funders: FunderOption[];
  canEdit: boolean;
  /** Computed server-side (computeFundingReadiness) — the deposit checklist. */
  readiness: ReadinessItem[];
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
  const [status, setStatus] = useState<CommitmentStatus>("draft");

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState((totalCents / 100).toString());
  // Open by default only while something is missing: once the dossier is
  // complete the checklist is confirmation, not a to-do list.
  const missingCount = readiness.filter((r) => !r.ok).length;
  const [checklistOpen, setChecklistOpen] = useState(missingCount > 0);

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
    setStatus("draft");
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

  async function generateInvoice(body: { commitmentId: string } | { remainder: true }) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/dossiers/${dossierId}/funding/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "La génération a échoué.");
      return;
    }
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
          {canEdit && summary.remainderCents > 0 && (
            <button
              onClick={() => generateInvoice({ remainder: true })}
              disabled={loading}
              className="text-[10.5px] text-ink underline decoration-line hover:decoration-ink mt-1 disabled:opacity-60"
            >
              Facturer au client
            </button>
          )}
        </div>
      </div>

      {/* Errors from invoice generation land here — the add-funder form has
          its own copy, but that form may be closed when a button fails. */}
      {error && !adding && <div className="bg-[#E9D8D3] text-rust text-[12px] rounded-md px-3 py-2">{error}</div>}

      {/* Dossier de dépôt : les pièces qu'un financeur demandera, vérifiées
          contre l'existant. C'est la moitié du temps que ce module fait
          gagner — savoir AVANT le dépôt ce qui manque. */}
      <div className="bg-white border border-line rounded-md p-3">
        <button
          type="button"
          onClick={() => setChecklistOpen(!checklistOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-[12px] font-semibold text-ink">
            Dossier de dépôt — {readiness.length - missingCount}/{readiness.length} pièces prêtes
          </span>
          <span className={`text-[11px] ${missingCount === 0 ? "text-sage" : "text-seal-dark"}`}>
            {missingCount === 0 ? "Complet ✓" : `${missingCount} manquante${missingCount > 1 ? "s" : ""}`}
          </span>
        </button>
        {checklistOpen && (
          <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5 border-t border-line">
            {readiness.map((item) => (
              <div key={item.key} className="flex items-start gap-2">
                {item.ok ? (
                  <CheckCircle2 size={14} className="text-sage mt-0.5 shrink-0" />
                ) : (
                  <Circle size={14} className="text-ash mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-[12px] ${item.ok ? "text-ink" : "text-ink font-medium"}`}>{item.label}</span>
                  {!item.ok && <div className="text-[11px] text-slate">{item.hint}</div>}
                </div>
              </div>
            ))}
            <div className="text-[10.5px] text-slate mt-1">
              Vérifié automatiquement d&apos;après le contenu du dossier. Le dépôt lui-même se fait sur le portail
              de votre financeur — Jalon prépare, vous déposez.
            </div>
          </div>
        )}
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
                {/* The number an OF actually watches: how long the funder has
                    been sitting on this. Amber past 30 days — the point where
                    a phone call is warranted. */}
                {AWAITING_FUNDER.includes(c.status as CommitmentStatus) && c.depositedAt && (
                  <div className={`text-[11px] ${daysSince(c.depositedAt) > 30 ? "text-seal-dark font-medium" : "text-slate"}`}>
                    Déposé le {new Date(c.depositedAt).toLocaleDateString("fr-FR")} — sans réponse depuis{" "}
                    {daysSince(c.depositedAt)} jour{daysSince(c.depositedAt) > 1 ? "s" : ""}
                  </div>
                )}
                {c.invoiceReference ? (
                  <div className="text-[11px] text-slate">
                    Facture <span className="font-mono">{c.invoiceReference}</span> émise — suivez son règlement sur
                    Facturation.
                  </div>
                ) : (
                  canEdit &&
                  c.status === "granted" &&
                  c.subrogation && (
                    <button
                      onClick={() => generateInvoice({ commitmentId: c.id })}
                      disabled={loading}
                      className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink mt-0.5 disabled:opacity-60"
                    >
                      Générer la facture au financeur
                    </button>
                  )
                )}
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
