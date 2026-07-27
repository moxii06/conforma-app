"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChapterHeader({ chapterId, title }: { chapterId: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    await fetch(`/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value.trim() }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function del() {
    setSaving(true);
    await fetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
    setSaving(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 pt-3 first:pt-0">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border border-line rounded-md px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-seal"
        />
        <button onClick={save} disabled={saving} className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setValue(title);
          }}
          className="text-[11px] text-slate hover:text-ink"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 pt-3 first:pt-0">
      <span className="text-[11px] font-semibold text-seal-dark uppercase tracking-wide">{title}</span>
      <button onClick={() => setEditing(true)} className="text-[10.5px] text-slate hover:text-ink">
        Renommer
      </button>
      {confirmingDelete ? (
        <span className="flex items-center gap-1.5">
          <button onClick={del} disabled={saving} className="text-[10.5px] font-medium text-rust hover:underline disabled:opacity-60">
            {saving ? "…" : "Confirmer"}
          </button>
          <button onClick={() => setConfirmingDelete(false)} className="text-[10.5px] text-slate hover:underline">
            Annuler
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirmingDelete(true)} className="text-[10.5px] text-slate hover:text-rust">
          Supprimer le chapitre
        </button>
      )}
    </div>
  );
}
