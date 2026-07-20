"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TemplateEditor({ templateId, title, bodyText }: { templateId: string; title: string; bodyText: string }) {
  const router = useRouter();
  const [value, setValue] = useState(bodyText);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/documents/templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyText: value }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/documents/templates/${templateId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        className="border border-line rounded-md px-3 py-2 text-[12.5px] text-ink outline-none focus:border-seal font-mono leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        <button onClick={handleDelete} disabled={deleting} className="text-[12px] text-rust hover:underline disabled:opacity-60">
          {deleting ? "…" : "Supprimer"}
        </button>
        {saved && <span className="text-[12px] text-sage">Enregistré.</span>}
      </div>
    </div>
  );
}
