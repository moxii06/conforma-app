"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DialogShell } from "@/components/DialogShell";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import type { QuestionKey } from "@/lib/documentQuestionnaire";

/** Ce que la route de génération renvoie : une phrase par information que la
 *  fiche formation ne porte pas encore. Le champ et la valeur ne servent pas
 *  ici — la route les recalcule à l'écriture — mais restent dans le type
 *  parce que c'est le même objet des deux côtés. */
export type ReportFormationPropose = {
  questionKey: string;
  champ: string;
  valeur: string;
  libelle: string;
};

/**
 * « Vous avez renseigné X. Reporter sur la formation ? »
 *
 * Le trou que cela ferme : une réponse tapée dans le questionnaire ne servait
 * qu'au document en cours. La fiche formation restait vide, donc le document
 * suivant reposait la même question, indéfiniment. Ce n'est proposé que pour
 * une information ABSENTE de la formation — jamais pour écraser un réglage
 * existant, qui a pu être posé en connaissance de cause.
 *
 * Le refus est une réponse à part entière, et il est nommé : « juste pour ce
 * document » dit ce qui se passe, là où « Annuler » laisserait croire que le
 * document lui-même est annulé.
 */
export function ReporterSurFormationDialog({
  dossierId,
  courseTitle,
  reports,
  answers,
  onClose,
}: {
  dossierId: string;
  courseTitle: string;
  reports: ReportFormationPropose[];
  /** Les réponses saisies au questionnaire, renvoyées telles quelles : c'est
   *  le serveur qui en redéduit ce qui est écrivable. */
  answers: Partial<Record<QuestionKey, string>>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (reports.length === 0) return null;

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/documents/generate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, answers }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "La mise à jour de la formation a échoué.");
      return;
    }
    toast.success(`Formation « ${courseTitle} » mise à jour.`);
    router.refresh();
    onClose();
  }

  return (
    <DialogShell title="Reporter sur la formation ?" onClose={onClose}>
      <div className="text-[12.5px] text-ink leading-relaxed">
        {reports.length === 1 ? (
          <>
            Vous avez renseigné que <span className="font-medium">{reports[0].libelle}</span>. Cette information ne
            figure pas encore sur la formation « {courseTitle} ».
          </>
        ) : (
          <>
            Vous avez renseigné des informations qui ne figurent pas encore sur la formation « {courseTitle} » :
            <ul className="list-disc pl-5 mt-1.5 flex flex-col gap-1">
              {reports.map((r) => (
                <li key={r.questionKey}>{r.libelle}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="text-[11px] text-slate leading-relaxed">
        En la reportant, les prochains documents de cette formation la reprendront tout seuls, sans reposer la
        question. Rien n&apos;est écrasé : seuls les réglages encore vides sont complétés.
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
      <div className="flex items-center gap-2.5">
        <Button type="button" size="sm" onClick={handleConfirm} disabled={saving}>
          {saving ? "…" : "Oui, mettre à jour"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={onClose} disabled={saving}>
          Non, juste pour ce document
        </Button>
      </div>
    </DialogShell>
  );
}
