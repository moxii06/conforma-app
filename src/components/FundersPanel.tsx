"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, PhoneLink } from "@/components/ui";
import { formatCents, FUNDER_TYPE_LABELS } from "@/lib/funding";

export type FunderRow = {
  id: string;
  name: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  hourlyRateCents: number | null;
  maxAmountCents: number | null;
  archivedAt: string | null;
  /** Commitments referencing this funder — drives archive-vs-delete. */
  usageCount: number;
  /** Sum of granted/invoiced/paid commitments, all dossiers. */
  securedCents: number;
};

const TYPES = Object.entries(FUNDER_TYPE_LABELS);

// Barème fields are kept as € strings while typing and converted to cents
// (or null) only at submit — same convention as the funding panel's amount.
const EMPTY = { name: "", type: "opco", contactEmail: "", contactPhone: "", hourlyRate: "", maxAmount: "" };

function euroStringToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const cents = Math.round(parseFloat(value.replace(",", ".")) * 100);
  return Number.isNaN(cents) || cents < 0 ? null : cents;
}

export function FundersPanel({ funders, canWrite }: { funders: FunderRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = funders.filter((f) => !f.archivedAt);
  const archived = funders.filter((f) => f.archivedAt);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const url = editingId ? `/api/funders/${editingId}` : "/api/funders";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        hourlyRateCents: euroStringToCents(form.hourlyRate),
        maxAmountCents: euroStringToCents(form.maxAmount),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "L'enregistrement a échoué.");
      return;
    }
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY);
    router.refresh();
  }

  async function setArchived(id: string, archived: boolean) {
    await fetch(`/api/funders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    router.refresh();
  }

  async function remove(f: FunderRow) {
    const res = await fetch(`/api/funders/${f.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // The API refuses to delete a funder in use; archive is the honest
      // fallback and the message says why.
      if (body?.archived) {
        await setArchived(f.id, true);
        setError(body.error);
        return;
      }
      setError(body?.error ?? "La suppression a échoué.");
      return;
    }
    router.refresh();
  }

  function startEdit(f: FunderRow) {
    setEditingId(f.id);
    setAdding(false);
    setError(null);
    setForm({
      name: f.name,
      type: f.type,
      contactEmail: f.contactEmail ?? "",
      contactPhone: f.contactPhone ?? "",
      hourlyRate: f.hourlyRateCents != null ? (f.hourlyRateCents / 100).toString() : "",
      maxAmount: f.maxAmountCents != null ? (f.maxAmountCents / 100).toString() : "",
    });
  }

  const field =
    "w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal placeholder:text-ash";
  const label = "text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1";

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-1">Financeurs</div>
        <div className="text-[12px] text-slate mb-4">
          Les organismes qui prennent en charge tout ou partie de vos formations. Une fois enregistrés ici, ils
          sont proposés sur l&apos;onglet Financement de chaque dossier.
        </div>

        {error && <div className="text-[12px] text-rust mb-3">{error}</div>}

        {active.length === 0 ? (
          <div className="text-[12px] text-slate">
            Aucun financeur enregistré. Commencez par les OPCO avec lesquels vous travaillez le plus.
          </div>
        ) : (
          <div className="flex flex-col">
            {active.map((f) => (
              <div key={f.id} className="border-t border-line first:border-t-0 py-2.5">
                {editingId === f.id ? (
                  <FunderForm
                    form={form}
                    setForm={setForm}
                    onSubmit={submit}
                    onCancel={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    loading={loading}
                    field={field}
                    label={label}
                    submitLabel="Enregistrer"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-medium text-ink truncate">{f.name}</span>
                        <span className="text-[10.5px] text-slate">{FUNDER_TYPE_LABELS[f.type] ?? f.type}</span>
                      </div>
                      <div className="text-[11px] text-slate">
                        {f.contactEmail || "Sans contact"}
                        {f.contactPhone && (
                          <>
                            {" · "}
                            <PhoneLink phone={f.contactPhone} />
                          </>
                        )}
                      </div>
                      {(f.hourlyRateCents != null || f.maxAmountCents != null) && (
                        <div className="text-[11px] text-slate">
                          Barème{f.hourlyRateCents != null && ` ${formatCents(f.hourlyRateCents)}/h`}
                          {f.maxAmountCents != null && ` · plafond ${formatCents(f.maxAmountCents)} par dossier`}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] text-ink tabular-nums">{formatCents(f.securedCents)}</div>
                      <div className="text-[10.5px] text-slate">
                        {f.usageCount === 0
                          ? "aucun dossier"
                          : `${f.usageCount} dossier${f.usageCount > 1 ? "s" : ""}`}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button onClick={() => startEdit(f)} className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink">
                          Modifier
                        </button>
                        {f.usageCount === 0 ? (
                          <button onClick={() => remove(f)} className="text-[11.5px] text-slate hover:text-rust">
                            Supprimer
                          </button>
                        ) : (
                          <button onClick={() => setArchived(f.id, true)} className="text-[11.5px] text-slate hover:text-ink">
                            Archiver
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && !adding && !editingId && (
          <button
            onClick={() => {
              setAdding(true);
              setForm(EMPTY);
              setError(null);
            }}
            className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink mt-3.5"
          >
            + Ajouter un financeur
          </button>
        )}

        {canWrite && adding && (
          <div className="mt-3.5 pt-3.5 border-t border-line">
            <FunderForm
              form={form}
              setForm={setForm}
              onSubmit={submit}
              onCancel={() => {
                setAdding(false);
                setError(null);
              }}
              loading={loading}
              field={field}
              label={label}
              submitLabel="Ajouter"
            />
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[12.5px] font-semibold text-ink mb-1">Archivés ({archived.length})</div>
          <div className="text-[11.5px] text-slate mb-3">
            Ils n&apos;apparaissent plus dans les listes de choix, mais restent visibles sur les dossiers qu&apos;ils
            ont financés.
          </div>
          <div className="flex flex-col">
            {archived.map((f) => (
              <div key={f.id} className="flex items-center gap-3 border-t border-line first:border-t-0 py-2">
                <span className="flex-1 text-[12.5px] text-slate truncate">{f.name}</span>
                <Pill tone="neutral">{f.usageCount} dossier{f.usageCount > 1 ? "s" : ""}</Pill>
                {canWrite && (
                  <button onClick={() => setArchived(f.id, false)} className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink">
                    Réactiver
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunderForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  loading,
  field,
  label,
  submitLabel,
}: {
  form: typeof EMPTY;
  setForm: (f: typeof EMPTY) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  loading: boolean;
  field: string;
  label: string;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Nom</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            minLength={2}
            placeholder="ex. OPCO Atlas"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={field}>
            {TYPES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Email (optionnel)</label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder="gestion@opco.fr"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Téléphone (optionnel)</label>
          <input
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            className={field}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Barème horaire (€/h, optionnel)</label>
          <input
            value={form.hourlyRate}
            onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
            inputMode="decimal"
            placeholder="ex. 15"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Plafond par dossier (€, optionnel)</label>
          <input
            value={form.maxAmount}
            onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
            inputMode="decimal"
            placeholder="ex. 3000"
            className={field}
          />
        </div>
      </div>
      <div className="text-[10.5px] text-slate -mt-1">
        Sert uniquement à pré-remplir le montant demandé sur les dossiers — la prise en charge réelle reste
        celle de l&apos;accord écrit du financeur.
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="submit"
          disabled={loading}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading ? "…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
    </form>
  );
}
