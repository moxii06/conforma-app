"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewModuleForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"video" | "document" | "quiz">("video");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.set("courseId", courseId);
    form.set("title", title);
    if (description) form.set("description", description);
    form.set("type", type);
    if (file) form.set("file", file);

    const res = await fetch("/api/lms/modules", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de la création.");
      return;
    }
    if (body.uploadError) {
      setError(`Module créé, mais l'envoi du fichier a échoué : ${body.uploadError}`);
    }
    setTitle("");
    setDescription("");
    setFile(null);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 max-w-md">
      <div className="flex items-center gap-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "video" | "document" | "quiz")}
          className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
        >
          <option value="video">Vidéo</option>
          <option value="document">Document</option>
          <option value="quiz">Quiz</option>
        </select>
        <input
          autoFocus
          required
          placeholder="Titre du module"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal flex-1"
        />
      </div>
      <input
        placeholder="Description (facultatif)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
      />
      {type !== "quiz" && (
        <input
          type="file"
          accept={type === "video" ? "video/*" : undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-[12px] text-ink"
        />
      )}
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading ? "Envoi…" : "Ajouter"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate">Annuler</button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
