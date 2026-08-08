"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SUBCONTRACTOR_DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import type { ExigencePiece } from "@/lib/subcontractorRequirements";

// L'écran de réglage des pièces attendues, un bloc par type de
// sous-traitant. L'organisme part de la liste proposée par Jalon, en retire
// ce qui ne le concerne pas et ajoute ses propres exigences.
//
// Le panneau ne connaît pas les identifiants de lignes : il envoie toujours
// (type, catégorie). C'est ce qui lui permet d'afficher indifféremment une
// liste déjà enregistrée et la liste par défaut d'un organisme tout neuf —
// la route matérialise avant d'agir. Voir /api/subcontractors/requirements.

export const SUBCONTRACTOR_TYPE_ORDER = [
  "formateur_externe",
  "sous_traitant_pedagogique",
  "prestataire_technique",
  "autre",
] as const;

export function SubcontractorRequirementsPanel({
  exigences,
  typeLabels,
}: {
  exigences: ExigencePiece[];
  typeLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<ExigencePiece | null>(null);

  async function appliquer(cle: string, action: () => Promise<Response>) {
    setEnCours(cle);
    setErreur(null);
    const res = await action();
    setEnCours(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErreur(b.error ?? "Erreur lors de l'enregistrement.");
      return false;
    }
    router.refresh();
    return true;
  }

  function basculerExigence(e: ExigencePiece) {
    return appliquer(`${e.subcontractorType}:${e.documentCategory}`, () =>
      fetch("/api/subcontractors/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcontractorType: e.subcontractorType,
          documentCategory: e.documentCategory,
          label: e.label,
          required: !e.required,
        }),
      }),
    );
  }

  async function retirer(e: ExigencePiece) {
    const ok = await appliquer(`${e.subcontractorType}:${e.documentCategory}`, () =>
      fetch(
        `/api/subcontractors/requirements?type=${encodeURIComponent(e.subcontractorType)}&category=${encodeURIComponent(e.documentCategory)}`,
        { method: "DELETE" },
      ),
    );
    if (ok) setASupprimer(null);
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-1">Pièces attendues par type d&apos;intervenant</div>
        <div className="text-[11.5px] text-slate">
          Ce que vous exigez d&apos;un sous-traitant avant de lui confier une prestation. La fiche de chaque
          intervenant coche ces lignes toute seule à mesure que les documents arrivent — rien n&apos;est à tenir à
          jour à la main. Jalon propose une liste de départ ; retirez ce qui ne vous concerne pas, ajoutez le reste.
        </div>
        {erreur && <div className="text-[11.5px] text-rust mt-2">{erreur}</div>}
      </div>

      {SUBCONTRACTOR_TYPE_ORDER.map((type) => {
        const lignes = exigences.filter((e) => e.subcontractorType === type).sort((a, b) => a.order - b.order);
        const dejaPrises = new Set(lignes.map((l) => l.documentCategory));
        return (
          <div key={type} className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-ink">{typeLabels[type] ?? type}</div>

            {lignes.length === 0 ? (
              <div className="text-[12px] text-slate">Aucune pièce attendue pour ce type.</div>
            ) : (
              <div className="flex flex-col">
                {lignes.map((e) => {
                  const cle = `${e.subcontractorType}:${e.documentCategory}`;
                  return (
                    <div
                      key={cle}
                      className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] text-ink truncate">{e.label}</div>
                        <div className="text-[11px] text-slate">
                          {CATEGORY_LABELS[e.documentCategory] ?? e.documentCategory}
                          {!e.isDefault && " — ajoutée par vous"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => basculerExigence(e)}
                          disabled={enCours === cle}
                          className="disabled:opacity-60"
                          title={e.required ? "Rendre facultative" : "Rendre exigible"}
                        >
                          <Pill tone={e.required ? "warn" : "neutral"}>{e.required ? "Exigée" : "Facultative"}</Pill>
                        </button>
                        <button
                          type="button"
                          onClick={() => setASupprimer(e)}
                          disabled={enCours === cle}
                          className="text-[11.5px] text-slate hover:text-rust disabled:opacity-60"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <AjoutExigence
              subcontractorType={type}
              dejaPrises={dejaPrises}
              onAjout={(payload) =>
                appliquer(`ajout:${type}`, () =>
                  fetch("/api/subcontractors/requirements", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  }),
                )
              }
              enCours={enCours === `ajout:${type}`}
            />
          </div>
        );
      })}

      <ConfirmDialog
        open={aSupprimer !== null}
        title={aSupprimer ? `Retirer « ${aSupprimer.label} » ?` : ""}
        description="Cette pièce ne sera plus réclamée pour ce type d'intervenant. Les documents déjà déposés ne sont pas supprimés."
        confirmLabel="Retirer"
        loading={aSupprimer !== null && enCours === `${aSupprimer.subcontractorType}:${aSupprimer.documentCategory}`}
        error={erreur}
        onConfirm={() => aSupprimer && retirer(aSupprimer)}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}

function AjoutExigence({
  subcontractorType,
  dejaPrises,
  onAjout,
  enCours,
}: {
  subcontractorType: string;
  dejaPrises: Set<string>;
  onAjout: (payload: {
    subcontractorType: string;
    documentCategory: string;
    label: string;
    required: boolean;
  }) => Promise<boolean>;
  enCours: boolean;
}) {
  // Une catégorie déjà attendue est retirée du choix : la clé unique du
  // schéma est (organisme, type, catégorie), donc la proposer une seconde
  // fois n'aurait fait que renommer la première — un « ajout » qui ne
  // ajoute rien.
  const disponibles = SUBCONTRACTOR_DOCUMENT_CATEGORIES.filter((c) => !dejaPrises.has(c));
  const [ouvert, setOuvert] = useState(false);
  const [categorie, setCategorie] = useState<string>(disponibles[0] ?? "other");
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(true);

  if (disponibles.length === 0) return null;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink w-fit"
      >
        + Ajouter une pièce attendue
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onAjout({
          subcontractorType,
          documentCategory: categorie,
          // Le libellé est ce que l'organisme lira dans la checklist ; à
          // défaut, celui de la catégorie, qui reste juste.
          label: label.trim() || (CATEGORY_LABELS[categorie] ?? categorie),
          required,
        });
        if (ok) {
          setLabel("");
          setOuvert(false);
        }
      }}
      className="flex flex-wrap items-center gap-2 bg-linen border border-line rounded-md p-3"
    >
      <select
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
        className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink"
      >
        {disponibles.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c] ?? c}
          </option>
        ))}
      </select>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Libellé affiché (optionnel)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1 min-w-[160px] focus:outline-none focus:border-ink-soft"
      />
      <label className="flex items-center gap-1.5 text-[12px] text-ink">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-sage" />
        Exigée
      </label>
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "…" : "Ajouter"}
      </Button>
      <Button type="button" variant="tertiary" size="sm" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
    </form>
  );
}
