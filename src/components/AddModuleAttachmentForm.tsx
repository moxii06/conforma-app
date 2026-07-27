"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddModuleAttachmentForm({ moduleId }: { moduleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    const res = await fetch(`/api/lms/modules/${moduleId}/attachments`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setFile(null);
    setTitle("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
        + Ajouter un document
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 bg-linen border border-line rounded-md p-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nom du document (facultatif)"
        className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
      />
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[11.5px] text-ink" />
      <div className="flex items-center gap-2.5">
        <button onClick={submit} disabled={loading || !file} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading ? "…" : "Envoyer"}
        </button>
        <button onClick={() => { setOpen(false); setFile(null); setTitle(""); }} className="text-[11.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
