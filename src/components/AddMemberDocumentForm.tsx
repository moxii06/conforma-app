"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MEMBER_DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";

export function AddMemberDocumentForm({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("cv");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("title", title);
    formData.set("category", category);
    formData.set("file", file);
    const res = await fetch(`/api/team/members/${memberId}/documents`, { method: "POST", body: formData });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'ajout.");
      return;
    }
    setTitle("");
    setFile(null);
    setFileInputKey((k) => k + 1);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 flex-wrap">
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal">
        {MEMBER_DOCUMENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </select>
      <input required placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-32" />
      <input key={fileInputKey} required type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[11.5px] text-ink flex-1 min-w-[140px]" />
      <button type="submit" disabled={loading || !file} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60 shrink-0">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </form>
  );
}
