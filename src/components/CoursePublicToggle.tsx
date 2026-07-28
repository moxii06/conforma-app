"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Opt-in publication of the public course page — the OF stays in control
// of what's visible on the open web (a draft course must never leak), and
// the copyable link is surfaced right here so "où est ma fiche ?" never
// needs support.
export function CoursePublicToggle({ courseId, isPublic }: { courseId: string; isPublic: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/catalogue/${courseId}` : `/catalogue/${courseId}`;

  async function toggle() {
    setLoading(true);
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !isPublic }),
    });
    setLoading(false);
    router.refresh();
  }

  async function copy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={toggle}
        disabled={loading}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading ? "…" : isPublic ? "Dépublier la fiche" : "Publier la fiche publique"}
      </button>
      {isPublic && (
        <>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink">
            Voir la fiche
          </a>
          <button onClick={copy} className="text-[11.5px] text-slate hover:text-ink">
            {copied ? "Lien copié ✓" : "Copier le lien"}
          </button>
        </>
      )}
    </div>
  );
}
