"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Opt-in publication of the public course page — the OF stays in control
// of what's visible on the open web (a draft course must never leak), and
// the copyable link is surfaced right here so "où est ma fiche ?" never
// needs support.
export function CoursePublicToggle({
  courseId,
  isPublic,
  publicEnrollment,
}: {
  courseId: string;
  isPublic: boolean;
  publicEnrollment: string;
}) {
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

  async function setEnrollment(mode: string) {
    setLoading(true);
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicEnrollment: mode }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
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

      {/* Only meaningful once the sheet is actually published — an
          enrollment mode on an unpublished course has nothing to attach to. */}
      {isPublic && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate" htmlFor={`enroll-${courseId}`}>
            Ce qu&apos;un visiteur peut faire depuis la fiche
          </label>
          <select
            id={`enroll-${courseId}`}
            value={publicEnrollment}
            onChange={(e) => setEnrollment(e.target.value)}
            disabled={loading}
            className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-fit disabled:opacity-60"
          >
            <option value="none">Consulter seulement</option>
            <option value="request">Demander une inscription (prospect créé dans le CRM)</option>
            <option value="direct">S&apos;inscrire directement (dossier créé)</option>
          </select>
          {publicEnrollment === "direct" && (
            <div className="text-[11px] text-slate">
              L&apos;inscription crée un dossier apprenant sans validation de votre part. Le nombre de places est
              respecté, mais les coordonnées saisies ne sont pas vérifiées.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
