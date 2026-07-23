"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplaceModuleFileForm({ moduleId, type }: { moduleId: string; type: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  async function submit(confirm: boolean) {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    if (confirm) form.set("confirm", "true");
    const res = await fetch(`/api/lms/modules/${moduleId}/replace-file`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.status === 409 && body.requiresConfirmation) {
      setConfirmMessage(body.error);
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Erreur lors du remplacement.");
      return;
    }
    setFile(null);
    setConfirmMessage(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Remplacer le fichier
      </button>
    );
  }

  if (confirmMessage) {
    return (
      <div className="flex flex-col gap-2 bg-[#FAF8F2] border border-line rounded-md p-3">
        <div className="text-[12px] text-rust">{confirmMessage}</div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => submit(true)}
            disabled={loading}
            className="bg-rust text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "…" : "Remplacer quand même"}
          </button>
          <button onClick={() => { setConfirmMessage(null); setOpen(false); setFile(null); }} className="text-[12px] text-slate hover:text-ink">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept={type === "video" ? "video/*" : undefined}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-[11.5px] text-ink"
      />
      <button
        onClick={() => submit(false)}
        disabled={loading || !file}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading ? "…" : "Envoyer"}
      </button>
      <button onClick={() => { setOpen(false); setFile(null); }} className="text-[11.5px] text-slate hover:text-ink">
        Annuler
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
