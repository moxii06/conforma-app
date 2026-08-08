"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { QUESTIONS_COMPETENCE } from "@/lib/subcontractorQuestionnaire";

// Le questionnaire de compétence, renseigné par l'intervenant lui-même
// depuis son espace. Une fois envoyé il n'est plus modifiable ici : la
// route écrase le contenu par ce qu'elle reçoit, et rouvrir un formulaire
// vide sur une réponse existante ferait perdre le texte déjà rédigé au
// premier « Enregistrer » distrait. La correction passe donc par
// l'organisme, qui a la pièce sous les yeux.
export function SubcontractorQuestionnaireForm({ subcontractorId }: { subcontractorId: string }) {
  const router = useRouter();
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vide = QUESTIONS_COMPETENCE.every((q) => !(reponses[q.cle] ?? "").trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}/questionnaire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reponses }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {QUESTIONS_COMPETENCE.map((q) => (
        <label key={q.cle} className="flex flex-col gap-1">
          <span className="text-[12.5px] font-medium text-ink">{q.libelle}</span>
          <span className="text-[11px] text-slate">{q.aide}</span>
          <textarea
            value={reponses[q.cle] ?? ""}
            onChange={(e) => setReponses((r) => ({ ...r, [q.cle]: e.target.value }))}
            rows={4}
            className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-y"
          />
        </label>
      ))}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
      <div>
        <Button type="submit" size="sm" disabled={loading || vide}>
          {loading ? "…" : "Envoyer mes réponses"}
        </Button>
      </div>
    </form>
  );
}
