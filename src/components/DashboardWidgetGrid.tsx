"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, Columns2 } from "lucide-react";

type Item = { id: string; node: ReactNode };
type LayoutEntry = { id: string; span: 1 | 2 };

// Same native HTML5 drag-and-drop as ModuleReorderList (this codebase
// deliberately carries no dnd library — see that component's own note) —
// reordering here works identically, extended with a per-widget width
// toggle (1 col / 2 cols) so two half-width widgets can sit side by side.
// A thin handle strip sits above each widget rather than reaching into its
// internal header, since the wrapped widgets aren't uniform (some are
// CollapsibleSection, "Prise en main" is its own bespoke card) — this way
// the grid works for any widget shape without threading drag/resize props
// through each one.
export function DashboardWidgetGrid({ items, initialLayout }: { items: Item[]; initialLayout: LayoutEntry[] | null }) {
  const [layout, setLayout] = useState<LayoutEntry[]>(() => mergeLayout(items, initialLayout));
  const [dragId, setDragId] = useState<string | null>(null);

  // Re-derive whenever the server's item set changes (a widget appears or
  // disappears as its underlying data does — a complaint queue draining to
  // zero, a role change) — same staleness guard as ModuleReorderList.
  const serverIds = items.map((i) => i.id).join("\n");
  const [prevServerIds, setPrevServerIds] = useState(serverIds);
  if (serverIds !== prevServerIds) {
    setPrevServerIds(serverIds);
    setLayout(mergeLayout(items, initialLayout));
  }

  const byId = new Map(items.map((i) => [i.id, i]));

  // Persisting from a useEffect rather than inline inside the drop/toggle
  // handlers: React (in development, under StrictMode) can invoke a
  // setState updater function twice to help surface impure updaters — a
  // fetch call living inside that updater would then fire twice per click.
  // An effect keyed on `layout` runs exactly once per actual commit, so
  // handleDrop/toggleSpan stay pure (just compute the next array) and this
  // is the only place a request goes out. Skips the very first render,
  // when `layout` is only what was already saved — nothing to persist yet.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void fetch("/api/profile/dashboard-layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  function handleDrop(targetId: string) {
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || draggedId === targetId) return;
    setLayout((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((e) => e.id === draggedId);
      const toIndex = next.findIndex((e) => e.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function toggleSpan(id: string) {
    setLayout((prev) => prev.map((e) => (e.id === id ? { ...e, span: (e.span === 2 ? 1 : 2) as 1 | 2 } : e)));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
      {layout.map((entry) => {
        const item = byId.get(entry.id);
        if (!item) return null;
        return (
          <div
            key={entry.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(entry.id)}
            style={{ gridColumn: entry.span === 2 ? "span 2" : "span 1", minWidth: 0 }}
            className={dragId === entry.id ? "opacity-50" : ""}
          >
            <div className="flex items-center gap-2 mb-1 px-0.5">
              <div
                draggable
                onDragStart={() => setDragId(entry.id)}
                // dragend fires on the source element whether the drop
                // landed on a valid target, missed every drop zone, or was
                // cancelled outright (Escape) — the only reliable place to
                // guarantee this clears. handleDrop alone isn't enough: it
                // never runs at all when nothing catches the drop, which
                // left the card permanently at opacity-50 (blending white
                // into the page's warm-gray background — read as "greyed
                // out / disabled" rather than "mid-drag").
                onDragEnd={() => setDragId(null)}
                className="cursor-grab text-ash hover:text-slate shrink-0"
                title="Glisser pour réordonner"
              >
                <GripVertical size={13} />
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => toggleSpan(entry.id)}
                className="text-ash hover:text-slate shrink-0"
                title={entry.span === 2 ? "Réduire à la moitié de la largeur" : "Étendre à la pleine largeur"}
              >
                <Columns2 size={13} />
              </button>
            </div>
            {item.node}
          </div>
        );
      })}
    </div>
  );
}

// Known ids keep the saved order/span; anything new (a widget that started
// applying since the user last customized their layout) is appended full
// width, in the order the server rendered it — never silently dropped.
function mergeLayout(items: Item[], saved: LayoutEntry[] | null): LayoutEntry[] {
  const itemIds = new Set(items.map((i) => i.id));
  const knownEntries = (saved ?? []).filter((e) => itemIds.has(e.id));
  const knownIds = new Set(knownEntries.map((e) => e.id));
  const newEntries = items.filter((i) => !knownIds.has(i.id)).map((i) => ({ id: i.id, span: 2 as const }));
  return [...knownEntries, ...newEntries];
}
