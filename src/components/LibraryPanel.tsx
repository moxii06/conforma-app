"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, ChevronRight } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { Pill } from "@/components/ui";
import { TemplateEditor } from "@/components/TemplateEditor";
import { TemplateBlocksEditor, type BlockRow } from "@/components/TemplateBlocksEditor";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { parseConditions } from "@/lib/documentAssembly";

type Row = {
  id: string;
  title: string;
  category: string;
  origin: "jalon" | "organization";
  forkedFromId: string | null;
  courseTitle: string | null;
  conditional: boolean;
};

type Detail = {
  id: string;
  title: string;
  category: string;
  bodyText: string;
  origin: "jalon" | "organization";
  blocks: { bodyText: string; conditions: unknown }[];
};

/**
 * The document library, reachable from wherever a document is actually
 * needed instead of only from /documents.
 *
 * The problem it solves is not "browsing is inconvenient" — every send
 * dialog already lists the templates. It is that the moment the template
 * you need does not exist yet, the flow dead-ends: you leave the dossier
 * (losing what you were doing), go to the Bibliothèque, adapt or write the
 * template, and navigate back. That break happens exactly when someone is
 * mid-task, which is the worst possible moment.
 *
 * So this panel is deliberately the *whole* library, not a picker: browse,
 * adapt a Jalon template, write a new one, edit paragraphs — then hand the
 * chosen template back to the caller through `onUse` and close.
 *
 * `onUse` is optional: from a screen that only manages templates there is
 * nothing to hand back, and the panel is then just the library in place.
 */
export function LibraryPanel({
  label = "Bibliothèque",
  variant = "link",
  onUse,
  defaultCategory,
  useLabel = "Utiliser",
}: {
  label?: string;
  /** "link" sits inside an existing dialog next to the template picker;
   *  "button" is the primary action on a screen that has none. A plain
   *  label rather than arbitrary trigger content, so the opener can never
   *  end up being a button nested inside a button. */
  variant?: "link" | "button";
  onUse?: (template: { id: string; title: string; category: string }) => void;
  /** Pre-filters the list to the category this screen is about — a
   *  subcontractor page opens on subcontractor contracts, not on all 17. */
  defaultCategory?: string;
  useLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/documents/templates");
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Chargement impossible.");
      return;
    }
    const data = await res.json();
    setRows(data.templates);
  }, []);

  useEffect(() => {
    if (open && rows === null) void load();
  }, [open, rows, load]);

  // Escape closes, and the body stops scrolling behind the panel — without
  // this the page underneath scrolls when the panel's own list is at its end.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  async function openDetail(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetail(null);
    const res = await fetch(`/api/documents/templates/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function fork(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/documents/templates/${id}/fork`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError("Adaptation impossible.");
      return;
    }
    const created = await res.json();
    await load();
    // Straight into the copy: adapting is never the goal in itself, editing
    // it is — and the user is here because they were missing something.
    setExpanded(created.id);
    setDetail(null);
    const detailRes = await fetch(`/api/documents/templates/${created.id}`);
    if (detailRes.ok) setDetail(await detailRes.json());
    router.refresh();
  }

  const visible = (rows ?? []).filter((r) => {
    if (category && r.category !== category) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return r.title.toLowerCase().includes(needle) || (CATEGORY_LABELS[r.category] ?? "").toLowerCase().includes(needle);
  });
  const mine = visible.filter((r) => r.origin === "organization");
  const jalon = visible.filter((r) => r.origin === "jalon");
  const forkedIds = new Set((rows ?? []).map((r) => r.forkedFromId).filter(Boolean) as string[]);
  const categories = [...new Set((rows ?? []).map((r) => r.category))].sort((a, b) =>
    (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b),
  );

  function renderRow(r: Row) {
    const alreadyForked = r.origin === "jalon" && forkedIds.has(r.id);
    const isOpen = expanded === r.id;
    return (
      <li key={r.id} className="border border-line rounded-card bg-white">
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          <button
            onClick={() => openDetail(r.id)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left group"
            aria-expanded={isOpen}
          >
            <ChevronRight
              size={14}
              className={`text-slate shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
            <span className="text-[13px] text-ink font-medium truncate group-hover:underline decoration-line">
              {r.title}
            </span>
            <Pill tone="neutral">{CATEGORY_LABELS[r.category] ?? r.category}</Pill>
            {r.conditional && <Pill tone="good">Conditionnel</Pill>}
            {r.courseTitle && <span className="text-[11px] text-slate truncate">{r.courseTitle}</span>}
          </button>

          <div className="flex items-center gap-3 shrink-0">
            {r.origin === "jalon" &&
              (alreadyForked ? (
                <span className="text-[11.5px] text-sage">Déjà adapté</span>
              ) : (
                <button
                  onClick={() => fork(r.id)}
                  disabled={busy === r.id}
                  className="text-[11.5px] text-slate hover:text-ink underline decoration-line disabled:opacity-60"
                >
                  {busy === r.id ? "…" : "Adapter"}
                </button>
              ))}
            {onUse && (
              <button
                onClick={() => {
                  onUse({ id: r.id, title: r.title, category: r.category });
                  setOpen(false);
                }}
                className="bg-ink text-white text-[11.5px] font-medium rounded-md px-2.5 py-1 hover:bg-ink-soft"
              >
                {useLabel}
              </button>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-line px-3.5 py-3">
            {!detail || detail.id !== r.id ? (
              <div className="text-[12px] text-slate">Chargement…</div>
            ) : detail.blocks.length > 0 ? (
              <TemplateBlocksEditor
                templateId={detail.id}
                initialBlocks={detail.blocks.map<BlockRow>((b) => {
                  const conditions = parseConditions(b.conditions);
                  return { bodyText: b.bodyText, conditions: conditions.length > 0 ? conditions : null };
                })}
                canEdit={detail.origin === "organization"}
              />
            ) : detail.origin === "organization" ? (
              <TemplateEditor templateId={detail.id} title={detail.title} bodyText={detail.bodyText} />
            ) : (
              <pre className="whitespace-pre-wrap text-[12px] text-slate font-sans leading-relaxed">
                {detail.bodyText}
              </pre>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "button"
            ? "bg-ink text-white text-[12.5px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft"
            : "text-[11.5px] text-slate hover:text-ink underline decoration-line"
        }
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- Escape is handled above; this is the redundant click-outside affordance */}
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />

          <aside className="relative bg-linen w-full max-w-3xl h-full shadow-xl flex flex-col">
            <header className="bg-white border-b border-line px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[19px] text-ink leading-tight">Bibliothèque de documents</h2>
                <p className="text-[12px] text-slate mt-0.5">
                  Adaptez un modèle Jalon ou écrivez le vôtre, sans quitter cette page.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fermer" className="text-slate hover:text-ink">
                <X size={18} />
              </button>
            </header>

            <div className="bg-white border-b border-line px-5 py-3 flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un modèle…"
                  className="w-full border border-line rounded-md pl-8 pr-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
              >
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {error && (
                <div className="bg-rust/10 border border-rust/30 text-rust rounded-card px-3.5 py-2.5 text-[12.5px]">
                  {error}
                </div>
              )}

              {rows === null ? (
                <div className="text-[12.5px] text-slate">Chargement de la bibliothèque…</div>
              ) : visible.length === 0 ? (
                <div className="text-[12.5px] text-slate">
                  Aucun modèle ne correspond. Créez-le ci-dessous — il restera disponible pour les prochaines fois.
                </div>
              ) : (
                <>
                  {mine.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-[11px] uppercase tracking-wide text-slate">Modèles de votre organisme</h3>
                      <ul className="flex flex-col gap-2">{mine.map(renderRow)}</ul>
                    </section>
                  )}
                  {jalon.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-[11px] uppercase tracking-wide text-slate">Modèles fournis par Jalon</h3>
                      <ul className="flex flex-col gap-2">{jalon.map(renderRow)}</ul>
                    </section>
                  )}
                </>
              )}

              <div className="border-t border-line pt-4">
                <NewTemplateForm
                  onCreated={(created) => {
                    // Refetch rather than splice the new row in by hand: the
                    // list is grouped and sorted server-side, and a local
                    // insert would drift from that ordering.
                    void load();
                    // Open it straight away — someone who just wrote a
                    // template came here to fill it in, not to admire the row.
                    setExpanded(created.id);
                    setDetail(null);
                    void fetch(`/api/documents/templates/${created.id}`)
                      .then((r) => (r.ok ? r.json() : null))
                      .then((d) => d && setDetail(d));
                  }}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
