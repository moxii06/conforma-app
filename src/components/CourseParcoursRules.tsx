"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ParcoursRuleRow } from "@/components/ParcoursRuleRow";

/**
 * Les règles du parcours, sur la fiche formation — le pendant exact de
 * l'étape 3 de l'assistant de création.
 *
 * Retour client : « ces réglages ne devraient-ils pas être disponibles
 * uniquement quand je crée ou modifie la formation ? ». Ils l'étaient déjà —
 * cette section vit sur la fiche formation, pas dans un écran de réglages
 * global. Mais deux choses donnaient tort à l'écran :
 *
 *   — « Passer cette vidéo » se présentait en paragraphe d'explication avec
 *     un lien souligné. Ça se lit comme de la documentation, pas comme un
 *     réglage qu'on tourne ;
 *   — surtout, le déblocage séquentiel et la rétractation se réglaient à la
 *     création et n'étaient MODIFIABLES NULLE PART ensuite. Un réglage qu'on
 *     ne peut poser qu'une fois n'est pas un réglage.
 *
 * Les quatre sont donc réunis ici, dans l'ordre et la forme de l'assistant.
 * Chacun s'enregistre à la volée : il n'y a pas de bouton « Enregistrer »
 * parce qu'il n'y a rien à composer — un interrupteur est déjà sa propre
 * validation.
 */
export function CourseParcoursRules({
  courseId,
  sequentialUnlock,
  withdrawalAccessPolicy,
  allowVideoSkip,
  certificateValidityMonths,
}: {
  courseId: string;
  sequentialUnlock: boolean;
  withdrawalAccessPolicy: string | null;
  allowVideoSkip: boolean;
  certificateValidityMonths: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [validite, setValidite] = useState(certificateValidityMonths?.toString() ?? "");

  async function patch(data: Record<string, unknown>) {
    setLoading(true);
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col">
      <ParcoursRuleRow
        actif={sequentialUnlock}
        disabled={loading}
        onToggle={() => patch({ sequentialUnlock: !sequentialUnlock })}
        titre="Terminer un module pour ouvrir le suivant"
        sous="Décochez pour une bibliothèque de ressources consultable dans le désordre."
        consequence="Décoché, tous les modules s'ouvrent dès que l'accès est donné. Un parcours certifiant, dont l'ordre porte la progression pédagogique, veut l'inverse."
      />
      <ParcoursRuleRow
        actif={withdrawalAccessPolicy !== "partial"}
        disabled={loading}
        onToggle={() => patch({ withdrawalAccessPolicy: withdrawalAccessPolicy === "partial" ? "closed" : "partial" })}
        titre="Bloquer l'accès pendant le délai de rétractation"
        sous={
          withdrawalAccessPolicy === null
            ? "14 jours après la signature — article L.221-18 du code de la consommation. Suit actuellement le réglage de votre organisme."
            : "14 jours après la signature — article L.221-18 du code de la consommation. Réglé pour cette formation."
        }
        consequence="Ce n'est pas un délai pédagogique : c'est le droit de l'apprenant à se rétracter. Ouvrir un module pendant ce délai, c'est commencer à exécuter le contrat alors qu'il peut encore être remboursé intégralement. Décoché, seuls les modules marqués « disponibles pendant la rétractation » s'ouvrent."
      />
      <ParcoursRuleRow
        actif={allowVideoSkip}
        disabled={loading}
        onToggle={() => patch({ allowVideoSkip: !allowVideoSkip })}
        titre="Autoriser « Passer cette vidéo »"
        sous="Désactivé par défaut. La suite se débloque, mais le saut reste tracé et visible."
      />

      <div className="flex gap-3 items-start py-3 border-t border-line">
        <span className="w-[34px] shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">L&apos;attestation expire</div>
          <div className="text-[12px] text-slate mt-0.5">
            Pour les habilitations à renouveler (SST, incendie…). Vide = sans expiration.
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="number"
              min={1}
              value={validite}
              placeholder="ex. 24"
              onChange={(e) => setValidite(e.target.value)}
              onBlur={() => {
                const v = validite.trim() === "" ? null : parseInt(validite, 10);
                if (v === (certificateValidityMonths ?? null)) return;
                patch({ certificateValidityMonths: Number.isNaN(v as number) ? null : v });
              }}
              className="w-24 bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal placeholder:text-ash"
            />
            <span className="text-[12px] text-slate">mois</span>
          </div>
          {/* La durée déjà inscrite sur une attestation délivrée ne bouge
              pas : elle est figée au moment de la délivrance. Le dire évite
              la crainte de rétroactivité, qui est la première question. */}
          <div className="text-[11px] text-slate mt-1.5">
            Les attestations déjà délivrées gardent la durée qui y figure.
          </div>
        </div>
      </div>
    </div>
  );
}
