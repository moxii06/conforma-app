"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonPicker, type LearnerInput } from "@/components/PersonPicker";
import { SuggestedLearners } from "@/components/SuggestedLearners";
import { LearnerCategoryFields, EMPTY_COMPANY_FIELDS, toCompanyInput, type CompanyFieldsState } from "@/components/LearnerCategoryFields";
import { Button } from "@/components/ui";

type SignedProspect = { opportunityId: string; contactName: string };

/**
 * Inscrire quelqu'un à CETTE session — par trois portes, dans l'ordre où on
 * y pense.
 *
 * Retour client : « il faudrait que je puisse cliquer sur ajouter un
 * apprenant et que cela me suggère les apprenants liés à la formation, ou
 * que je puisse faire une recherche ». L'écran ne proposait jusqu'ici que
 * les prospects au stade « convention signée » ET dont l'opportunité pointe
 * cette formation précise. Deux conditions cumulées : dans la plupart des
 * cas la liste était vide, et l'écran répondait par un paragraphe
 * expliquant comment la remplir — c'est-à-dire par du travail à faire
 * ailleurs, au moment précis où l'on voulait avancer ici.
 *
 * Les trois portes ne sont pas redondantes :
 *
 *  1. « Convention signée » passe par /api/planning/sessions/[id]/enroll,
 *     la seule route qui sait deux choses de plus : le dossier naît avec
 *     `contractSigned`, et l'affaire commerciale avance à « session
 *     planifiée ». Basculer ce cas sur la porte générique ferait
 *     silencieusement reculer le CRM — c'est pour ça qu'elle reste.
 *  2. Les suggestions listent les contacts que le CRM rattache à cette
 *     formation, quel que soit leur stade, et ceux déjà inscrits en sont
 *     retirés (voir /api/courses/interested-contacts).
 *  3. La recherche libre couvre le reste, y compris la création d'un
 *     apprenant qui n'existe pas encore.
 *
 * Les portes 2 et 3 passent par /api/courses/[id]/enroll avec le sessionId
 * imposé : cette route vérifie déjà que la session appartient bien à la
 * formation, qu'il reste de la place, et ne crée pas de doublon.
 */
export function EnrollIntoSessionPanel({
  sessionId,
  courseId,
  signedProspects,
  enrolledContactIds,
  isFull,
}: {
  sessionId: string;
  courseId: string;
  signedProspects: SignedProspect[];
  enrolledContactIds: string[];
  isFull: boolean;
}) {
  const router = useRouter();
  const [opportunityId, setOpportunityId] = useState(signedProspects[0]?.opportunityId ?? "");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState<CompanyFieldsState>(EMPTY_COMPANY_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function envoyer(url: string, body: object) {
    setLoading(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'inscription.");
      return;
    }
    setCategory("");
    setCompany(EMPTY_COMPANY_FIELDS);
    router.refresh();
  }

  // Porte 1 — le prospect dont la convention est signée.
  const inscrireProspect = () =>
    opportunityId &&
    envoyer(`/api/planning/sessions/${sessionId}/enroll`, {
      opportunityId,
      learnerCategory: category || undefined,
      company: toCompanyInput(category, company),
    });

  // Portes 2 et 3 — n'importe quel apprenant, existant ou nouveau.
  const inscrireApprenant = (input: LearnerInput) =>
    envoyer(`/api/courses/${courseId}/enroll`, { ...input, sessionId });

  if (isFull) {
    return (
      <div className="text-[12.5px] text-slate">
        Session complète. Augmentez le nombre de places dans « Modifier la session » pour inscrire quelqu&apos;un de plus.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {signedProspects.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-slate uppercase tracking-wide">Convention signée</div>
          <div className="flex items-center gap-2.5">
            <select
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1 min-w-0"
            >
              {signedProspects.map((s) => (
                <option key={s.opportunityId} value={s.opportunityId}>
                  {s.contactName}
                </option>
              ))}
            </select>
            <Button size="sm" className="shrink-0" onClick={inscrireProspect} disabled={loading}>
              {loading ? "…" : "Inscrire"}
            </Button>
          </div>
          <LearnerCategoryFields category={category} onCategoryChange={setCategory} company={company} onCompanyChange={setCompany} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold text-slate uppercase tracking-wide">
          {signedProspects.length > 0 ? "Autre apprenant" : "Apprenant à inscrire"}
        </div>
        {/* Les puces de suggestion ne s'affichent que s'il y a quelque chose
            à suggérer — le composant se rend nul sinon, donc pas de titre
            orphelin au-dessus du vide. */}
        <SuggestedLearners
          courseId={courseId}
          excludeIds={new Set(enrolledContactIds)}
          onAdd={(contactId) => inscrireApprenant({ contactId })}
        />
        <PersonPicker onSelect={(input) => inscrireApprenant(input)} />
      </div>

      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
