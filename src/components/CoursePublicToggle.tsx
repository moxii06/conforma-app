"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch, SegmentedControl } from "@/components/Controls";

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
      {/* Interrupteur et non lien souligné : publier est un RÉGLAGE de la
          formation, qui prend effet tout de suite, pas une action ponctuelle.
          Un lien qui alterne « Publier » / « Dépublier » oblige en plus à
          déduire l'état actuel de l'inverse du libellé. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Switch
          checked={isPublic}
          onChange={toggle}
          disabled={loading}
          label="Publier la fiche publique"
        />
        <span className="text-[12.5px] font-medium text-ink">
          {isPublic ? "Fiche publiée" : "Fiche non publiée"}
        </span>
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
          <div className="text-[11px] text-slate">Ce qu&apos;un visiteur peut faire depuis la fiche</div>
          {/* Trois options exclusives, et le choix engage : « s'inscrire
              directement » crée un vrai dossier sans validation. Les voir
              toutes les trois côte à côte les fait comparer ; un menu
              déroulant les cache derrière celle déjà retenue. */}
          <SegmentedControl
            value={publicEnrollment}
            onChange={setEnrollment}
            disabled={loading}
            label="Ce qu'un visiteur peut faire depuis la fiche"
            options={[
              { value: "none", label: "Consulter seulement" },
              { value: "request", label: "Demander une inscription" },
              { value: "direct", label: "S'inscrire directement" },
            ]}
          />
          <div className="text-[11px] text-slate">
            {publicEnrollment === "none" && "La fiche informe, sans formulaire."}
            {publicEnrollment === "request" && "Un prospect est créé dans le CRM ; rien n'est engagé."}
          </div>
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
