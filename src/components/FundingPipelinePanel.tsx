"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { TriangleAlert, Mail, ChevronDown, ChevronRight } from "lucide-react";
import {
  formatCents,
  bucketOf,
  commitmentAlert,
  compareFundingUrgency,
  computeFundingPipelineTotals,
  FUNDING_BUCKETS,
  COMMITMENT_STATUS_LABELS,
  FUNDER_TYPE_LABELS,
  type CommitmentStatus,
  type FundingAlert,
  type FundingBucketKey,
} from "@/lib/funding";

export type PipelineRow = {
  id: string;
  dossierId: string;
  learnerName: string;
  courseTitle: string;
  funderId: string;
  funderName: string;
  funderType: string;
  funderEmail: string | null;
  amountCents: number;
  subrogation: boolean;
  status: string;
  agreementNumber: string | null;
  validUntil: string | null; // ISO
  depositedAt: string | null; // ISO
  createdAt: string; // ISO
  invoiceReference: string | null;
};

const ALERT_COPY: Record<Exclude<FundingAlert, null>, { label: string; tone: "danger" | "warn" }> = {
  expired: { label: "Accord périmé", tone: "danger" },
  expiring: { label: "Accord expire bientôt", tone: "warn" },
  silent: { label: "Sans réponse", tone: "warn" },
};

function toDates(r: PipelineRow) {
  return {
    status: r.status,
    depositedAt: r.depositedAt ? new Date(r.depositedAt) : null,
    validUntil: r.validUntil ? new Date(r.validUntil) : null,
    createdAt: new Date(r.createdAt),
    amountCents: r.amountCents,
  };
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Le libellé du type, ou rien s'il redit déjà le nom du financeur. */
function typeLabel(r: PipelineRow): string | null {
  const label = FUNDER_TYPE_LABELS[r.funderType] ?? r.funderType;
  return label.toLowerCase() === r.funderName.toLowerCase() ? null : label;
}

/**
 * Relance par mail — un lien `mailto:` pré-rempli, pas un envoi depuis Jalon.
 * Une relance de financeur part de l'adresse nominative de la personne qui
 * suit le dossier chez l'OPCO ; envoyée par la plateforme elle atterrirait
 * dans un fil que l'OF ne verrait plus. Le brouillon fait gagner le temps
 * utile (références, montant, ancienneté) sans confisquer l'envoi.
 */
function buildRelanceMailto(r: PipelineRow): string {
  const ref = r.agreementNumber ? `accord n° ${r.agreementNumber}` : `dossier de ${r.learnerName}`;
  const subject = `Relance — prise en charge ${r.learnerName} (${r.courseTitle})`;
  const silence = r.depositedAt
    ? `Cette demande a été déposée le ${formatDate(r.depositedAt)}, soit il y a ${daysSince(r.depositedAt)} jours, et n'a pas encore reçu de réponse.`
    : `Cette demande est en attente de réponse de votre part.`;
  const body = [
    "Bonjour,",
    "",
    `Je me permets de revenir vers vous au sujet de la demande de prise en charge concernant ${r.learnerName}, pour la formation « ${r.courseTitle} » (${ref}), d'un montant de ${formatCents(r.amountCents)}.`,
    "",
    silence,
    "",
    "Pourriez-vous m'indiquer où en est son instruction, et me préciser si une pièce complémentaire vous est nécessaire ?",
    "",
    "Je vous remercie par avance.",
    "",
    "Cordialement,",
  ].join("\n");
  return `mailto:${r.funderEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function FundingPipelinePanel({
  rows,
  canWrite,
  funders,
}: {
  rows: PipelineRow[];
  canWrite: boolean;
  funders: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [funderFilter, setFunderFilter] = useState("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Réglé et Refusé repliés par défaut : ce sont des archives, pas du travail.
  const [collapsed, setCollapsed] = useState<Set<FundingBucketKey>>(new Set(["paid", "refused"]));

  const now = useMemo(() => new Date(), []);
  const totals = useMemo(() => computeFundingPipelineTotals(rows.map(toDates), now), [rows, now]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (funderFilter && r.funderId !== funderFilter) return false;
      if (alertOnly && commitmentAlert(toDates(r), now) === null) return false;
      return true;
    });
  }, [rows, funderFilter, alertOnly, now]);

  const grouped = useMemo(() => {
    return FUNDING_BUCKETS.map((bucket) => ({
      ...bucket,
      rows: visible
        .filter((r) => bucketOf(r.status) === bucket.key)
        .sort((a, b) => compareFundingUrgency(toDates(a), toDates(b), now)),
    }));
  }, [visible, now]);

  async function changeStatus(row: PipelineRow, next: string) {
    setBusyId(row.id);
    setError(null);
    const res = await fetch(`/api/dossiers/${row.dossierId}/funding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitmentId: row.id, status: next }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "La mise à jour a échoué.");
      return;
    }
    router.refresh();
  }

  async function generateInvoice(row: PipelineRow) {
    setBusyId(row.id);
    setError(null);
    const res = await fetch(`/api/dossiers/${row.dossierId}/funding/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitmentId: row.id }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "La génération a échoué.");
      return;
    }
    router.refresh();
  }

  function toggle(key: FundingBucketKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const alertTotal = totals.expired + totals.expiring + totals.silent;

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card px-5 py-6 text-[12.5px] text-slate leading-relaxed">
        Aucune prise en charge enregistrée. Ajoutez un financeur sur un dossier apprenant, onglet Financement — les
        demandes apparaîtront ici, classées par urgence, quel que soit le dossier concerné.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Les quatre étapes où l'argent d'un financeur peut s'arrêter, dans
          l'ordre où il les traverse. « Accordé, à facturer » est la seule que
          personne ne surveille : l'accord est obtenu, donc le dossier est
          considéré comme réglé — alors que rien n'a encore été demandé. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <PipelineMetric label="Demandé, sans réponse" value={formatCents(totals.requestedCents)} />
        <PipelineMetric
          label="Accordé, à facturer"
          value={formatCents(totals.toInvoiceCents)}
          tone={totals.toInvoiceCents > 0 ? "warn" : "ink"}
        />
        <PipelineMetric label="Facturé, en attente de règlement" value={formatCents(totals.awaitingPaymentCents)} />
        <PipelineMetric label="Encaissé des financeurs" value={formatCents(totals.settledCents)} tone="good" />
      </div>

      {alertTotal > 0 && (
        <div className="flex items-start gap-2 bg-[#EDDFC6] rounded-card px-4 py-3 text-[12.5px] text-seal-dark">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            {[
              totals.expired > 0 && `${totals.expired} accord${totals.expired > 1 ? "s" : ""} périmé${totals.expired > 1 ? "s" : ""}`,
              totals.expiring > 0 && `${totals.expiring} qui expire${totals.expiring > 1 ? "nt" : ""} sous 30 jours`,
              totals.silent > 0 && `${totals.silent} sans réponse depuis plus de 30 jours`,
            ]
              .filter(Boolean)
              .join(", ")}
            . Un accord périmé est la première cause de non-paiement d&apos;un financeur.
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={funderFilter}
          onChange={(e) => setFunderFilter(e.target.value)}
          className="bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        >
          <option value="">Tous les financeurs</option>
          {funders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[12.5px] text-ink">
          <input type="checkbox" checked={alertOnly} onChange={(e) => setAlertOnly(e.target.checked)} className="accent-sage" />
          Seulement ce qui demande une action
        </label>
        <span className="text-[11.5px] text-slate">
          {visible.length} prise{visible.length > 1 ? "s" : ""} en charge affichée{visible.length > 1 ? "s" : ""} sur {rows.length}
        </span>
      </div>

      {error && <div className="bg-[#E9D8D3] text-rust text-[12px] rounded-md px-3 py-2">{error}</div>}

      {visible.length === 0 && (
        <div className="text-[12.5px] text-slate">Aucune prise en charge ne correspond à ce filtre.</div>
      )}

      {grouped.map((bucket) => {
        if (bucket.rows.length === 0) return null;
        const isCollapsed = collapsed.has(bucket.key);
        const bucketTotal = bucket.rows.reduce((sum, r) => sum + r.amountCents, 0);
        return (
          <div key={bucket.key} className="bg-white border border-line rounded-card">
            <button
              type="button"
              onClick={() => toggle(bucket.key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isCollapsed ? (
                  <ChevronRight size={15} className="text-slate shrink-0" />
                ) : (
                  <ChevronDown size={15} className="text-slate shrink-0" />
                )}
                <span className="text-[13px] font-semibold text-ink">{bucket.label}</span>
                <span className="text-[11.5px] text-slate">({bucket.rows.length})</span>
              </div>
              <span className="text-[12.5px] text-ink tabular-nums shrink-0">{formatCents(bucketTotal)}</span>
            </button>
            {!isCollapsed && (
              <div className="px-5 pb-3">
                <div className="text-[11.5px] text-slate pb-2.5 border-b border-line">{bucket.hint}</div>
                {bucket.rows.map((r) => {
                  const alert = commitmentAlert(toDates(r), now);
                  return (
                    <div key={r.id} className="flex items-start gap-3 py-3 border-b border-line last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dossiers/${r.dossierId}?tab=financement`}
                            className="text-[13px] font-semibold text-ink hover:underline decoration-line truncate"
                          >
                            {r.learnerName}
                          </Link>
                          <span className="text-[11.5px] text-slate truncate">{r.courseTitle}</span>
                          {alert && <Pill tone={ALERT_COPY[alert].tone}>{ALERT_COPY[alert].label}</Pill>}
                        </div>
                        <div className="text-[11.5px] text-slate mt-1">
                          <span className="text-ink font-medium">{r.funderName}</span>
                          {/* Un financeur nommé d'après son type — « France
                              Travail », « AGEFICE » — afficherait sinon deux
                              fois le même mot. */}
                          {typeLabel(r) && ` · ${typeLabel(r)}`}
                          {r.agreementNumber && ` · accord ${r.agreementNumber}`}
                          {!r.subrogation && " · sans subrogation"}
                        </div>
                        <div className="text-[11.5px] text-slate mt-0.5">
                          {/* L'ancienneté n'est une information que tant que la
                              balle est chez le financeur. Une fois l'accord
                              obtenu, la seule date qui compte est l'échéance. */}
                          {r.depositedAt &&
                            (bucket.key === "awaiting" ? (
                              <>
                                Déposé le {formatDate(r.depositedAt)} — sans réponse depuis{" "}
                                {daysSince(r.depositedAt)} jour{daysSince(r.depositedAt) > 1 ? "s" : ""}
                              </>
                            ) : (
                              <>Déposé le {formatDate(r.depositedAt)}</>
                            ))}
                          {r.depositedAt && r.validUntil && " · "}
                          {r.validUntil && <>valable jusqu&apos;au {formatDate(r.validUntil)}</>}
                          {!r.depositedAt && !r.validUntil && "Jamais déposé"}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mt-1.5">
                          {r.invoiceReference ? (
                            <span className="text-[11.5px] text-slate">
                              Facture <span className="font-mono">{r.invoiceReference}</span> émise
                            </span>
                          ) : (
                            canWrite &&
                            r.status === "granted" &&
                            r.subrogation && (
                              <button
                                onClick={() => generateInvoice(r)}
                                disabled={busyId === r.id}
                                className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
                              >
                                Générer la facture au financeur
                              </button>
                            )
                          )}
                          {r.funderEmail && (bucket.key === "awaiting" || alert === "expired" || alert === "expiring") && (
                            <a
                              href={buildRelanceMailto(r)}
                              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
                            >
                              <Mail size={12} />
                              Relancer par mail
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-[13px] text-ink tabular-nums shrink-0 pt-0.5">{formatCents(r.amountCents)}</div>
                      {canWrite ? (
                        <select
                          value={r.status}
                          onChange={(e) => changeStatus(r, e.target.value)}
                          disabled={busyId === r.id}
                          className="bg-white border border-line rounded-md px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal shrink-0 disabled:opacity-60"
                        >
                          {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      ) : (
                        <Pill tone="neutral">
                          {COMMITMENT_STATUS_LABELS[r.status as CommitmentStatus] ?? r.status}
                        </Pill>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PipelineMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "good" | "warn";
}) {
  const valueClass = tone === "good" ? "text-sage" : tone === "warn" ? "text-seal-dark" : "text-ink";
  return (
    <div className="bg-white border border-line rounded-card px-4 py-3.5">
      <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`text-[17px] tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
