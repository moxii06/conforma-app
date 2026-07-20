"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewModuleForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/lms/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, title }),
    });
    setLoading(false);
    setTitle("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Ajouter un module
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        autoFocus
        required
        placeholder="Titre du module"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
      />
      <button type="submit" disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate">Annuler</button>
    </form>
  );
}
