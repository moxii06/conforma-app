"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Member = { id: string; name: string };

// Les champs que le bandeau « informations manquantes » sait viser.
//
// Le nom de l'ancre EST le nom du champ Prisma : lib/courseCompleteness.ts
// fabrique l'ancre à partir de là. Le bandeau promettait « chaque ligne
// ouvre le champ concerné » et n'y arrivait pas — aucun champ ne portait
// d'id, et le formulaire est replié derrière « Modifier », donc la cible
// n'existait même pas dans le DOM au moment où le navigateur la cherchait.
const CHAMPS_CIBLABLES = [
  "durationHours",
  "priceCents",
  "prerequisites",
  "objectives",
  "accessDelay",
  "accessModalities",
  "teachingMethods",
  "evaluationModalities",
] as const;

export function EditCourseForm({
  courseId,
  members,
  subcontractors,
  initial,
}: {
  courseId: string;
  members: Member[];
  subcontractors: Member[];
  initial: {
    title: string;
    description: string | null;
    responsibleUserIds: string[];
    subcontractorIds: string[];
    durationHours: number | null;
    priceCents: number | null;
    certificateValidityMonths: number | null;
    maxLearners: number | null;
    prerequisites: string | null;
    objectives: string | null;
    accessDelay: string | null;
    accessModalities: string | null;
    teachingMethods: string | null;
    evaluationModalities: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [responsibleIds, setResponsibleIds] = useState<Set<string>>(new Set(initial.responsibleUserIds));
  const [subcontractorIds, setSubcontractorIds] = useState<Set<string>>(new Set(initial.subcontractorIds));
  const [durationHours, setDurationHours] = useState(initial.durationHours != null ? String(initial.durationHours) : "");
  const [price, setPrice] = useState(initial.priceCents != null ? String(initial.priceCents / 100) : "");
  const [certificateValidityMonths, setCertificateValidityMonths] = useState(
    initial.certificateValidityMonths != null ? String(initial.certificateValidityMonths) : ""
  );
  const [maxLearners, setMaxLearners] = useState(initial.maxLearners != null ? String(initial.maxLearners) : "");
  const [prerequisites, setPrerequisites] = useState(initial.prerequisites ?? "");
  const [objectives, setObjectives] = useState(initial.objectives ?? "");
  const [accessDelay, setAccessDelay] = useState(initial.accessDelay ?? "");
  const [accessModalities, setAccessModalities] = useState(initial.accessModalities ?? "");
  const [teachingMethods, setTeachingMethods] = useState(initial.teachingMethods ?? "");
  const [evaluationModalities, setEvaluationModalities] = useState(initial.evaluationModalities ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cible, setCible] = useState<string | null>(null);

  // Deux temps, et il en faut deux : le premier ouvre le formulaire, le
  // second va au champ — qui n'est dans le DOM qu'après le rendu déclenché
  // par le premier. Chercher l'élément dans la foulée du setOpen ne trouve
  // rien.
  useEffect(() => {
    function lireAncre() {
      const ancre = window.location.hash.slice(1);
      if (!(CHAMPS_CIBLABLES as readonly string[]).includes(ancre)) return;
      setOpen(true);
      setCible(ancre);
    }
    lireAncre();
    // Le bandeau pointe des liens ordinaires : quand seule l'ancre change,
    // le navigateur émet hashchange sans recharger, et le composant reste
    // monté — l'effet de montage seul manquerait tous les clics suivants.
    window.addEventListener("hashchange", lireAncre);
    return () => window.removeEventListener("hashchange", lireAncre);
  }, []);

  useEffect(() => {
    if (!open || !cible) return;
    const el = document.getElementById(cible);
    setCible(null);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, [open, cible]);

  function toggleResponsible(id: string) {
    setResponsibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSubcontractor(id: string) {
    setSubcontractorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        responsibleUserIds: Array.from(responsibleIds),
        subcontractorIds: Array.from(subcontractorIds),
        durationHours: durationHours ? parseInt(durationHours, 10) : null,
        priceCents: price ? Math.round(parseFloat(price) * 100) : null,
        certificateValidityMonths: certificateValidityMonths ? parseInt(certificateValidityMonths, 10) : null,
        maxLearners: maxLearners ? parseInt(maxLearners, 10) : null,
        prerequisites: prerequisites || null,
        objectives: objectives || null,
        accessDelay: accessDelay || null,
        accessModalities: accessModalities || null,
        teachingMethods: teachingMethods || null,
        evaluationModalities: evaluationModalities || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la modification.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Modifier
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-linen border border-line rounded-md p-3.5 flex flex-col gap-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la formation"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnel)"
        rows={2}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <div className="flex gap-2">
        <input
          id="durationHours"
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
          type="number"
          min={1}
          placeholder="Durée (heures)"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft flex-1"
        />
        <input
          id="priceCents"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="Prix (€)"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft flex-1"
        />
      </div>
      <div className="border-t border-line pt-2.5 flex flex-col gap-2.5">
        <div className="text-[11px] text-slate uppercase tracking-wide">
          Informations publiques (fiche formation — indicateur Qualiopi 1)
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate">Prérequis — laisser vide affichera « Sans prérequis »</span>
          <input id="prerequisites" value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} placeholder="ex. Maîtriser les bases d'Excel" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate">Objectifs opérationnels et évaluables</span>
          <textarea id="objectives" value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} placeholder={"ex.\n- Identifier les emails de phishing\n- Appliquer la politique de mots de passe"} className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none" />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-slate">Délai d&apos;accès</span>
            <input id="accessDelay" value={accessDelay} onChange={(e) => setAccessDelay(e.target.value)} placeholder="ex. Sous 15 jours" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft" />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-slate">Modalités d&apos;accès</span>
            <input id="accessModalities" value={accessModalities} onChange={(e) => setAccessModalities(e.target.value)} placeholder="ex. Inscription en ligne ou par email" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft" />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-slate">Méthodes mobilisées</span>
            <input id="teachingMethods" value={teachingMethods} onChange={(e) => setTeachingMethods(e.target.value)} placeholder="ex. E-learning : vidéos, supports, quiz" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft" />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-slate">Modalités d&apos;évaluation</span>
            <input id="evaluationModalities" value={evaluationModalities} onChange={(e) => setEvaluationModalities(e.target.value)} placeholder="ex. Quiz par module, score minimal 70 %" className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft" />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">
          Nombre de places — laisser vide pour illimité
        </span>
        <input
          value={maxLearners}
          onChange={(e) => setMaxLearners(e.target.value)}
          type="number"
          min={1}
          placeholder="ex. 12 — au-delà, plus aucune inscription possible"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">
          Validité de l&apos;attestation (mois) — laisser vide si pas de renouvellement
        </span>
        <input
          value={certificateValidityMonths}
          onChange={(e) => setCertificateValidityMonths(e.target.value)}
          type="number"
          min={1}
          placeholder="ex. 12 pour une formation à recycler chaque année"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </label>
      {members.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-slate uppercase tracking-wide">Responsables / personnes concernées</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input type="checkbox" checked={responsibleIds.has(m.id)} onChange={() => toggleResponsible(m.id)} className="accent-sage" />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}
      {subcontractors.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-slate uppercase tracking-wide">Prestataires externes</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {subcontractors.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input type="checkbox" checked={subcontractorIds.has(s.id)} onChange={() => toggleSubcontractor(s.id)} className="accent-sage" />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={loading || !title.trim()}>
          {loading ? "…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
