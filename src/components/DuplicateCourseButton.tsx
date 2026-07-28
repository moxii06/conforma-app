"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DuplicateCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function duplicate() {
    if (!confirm("Dupliquer cette formation ? Le contenu (modules, quiz, modèles de documents) sera copié — pas les apprenants inscrits ni l'historique.")) return;
    setLoading(true);
    const res = await fetch(`/api/courses/${courseId}/duplicate`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      alert("Échec de la duplication.");
      return;
    }
    const created = await res.json();
    router.push(`/formations/${created.id}`);
  }

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={loading}
      className="text-[11.5px] font-medium text-slate hover:text-ink disabled:opacity-60"
    >
      {loading ? "…" : "Dupliquer"}
    </button>
  );
}
