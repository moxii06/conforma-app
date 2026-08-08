import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Pill } from "@/components/ui";
import type { LigneChecklist } from "@/lib/subcontractorRequirements";

// Les pièces attendues d'un intervenant, cochées ou non.
//
// Aucun état n'est stocké : chaque ligne est le résultat du croisement
// entre ce que l'organisme attend pour ce type de sous-traitant et les
// documents réellement présents (voir lib/subcontractorRequirements.ts).
// Supprimer un document décoche donc la ligne au rechargement suivant,
// ce qu'une colonne « fourni » en base n'aurait jamais fait.
//
// Composant de présentation pur : la fiche d'un sous-traitant l'affiche à
// côté des documents, l'espace de l'intervenant le réutilise tel quel pour
// lui montrer ce qu'on attend de lui.
export function SubcontractorDocumentChecklist({
  lignes,
  titre = "Pièces attendues",
  lienReglages,
}: {
  lignes: LigneChecklist[];
  titre?: string;
  /** Affiché seulement côté organisme : l'intervenant ne règle pas la liste. */
  lienReglages?: string;
}) {
  const fournies = lignes.filter((l) => l.fourni).length;
  const manquantesObligatoires = lignes.filter((l) => !l.fourni && l.required).length;

  return (
    <div className="bg-linen border border-line rounded-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-semibold text-ink">{titre}</div>
          <div className="text-[11px] text-slate mt-0.5">
            {lignes.length === 0
              ? "Aucune pièce définie pour ce type."
              : `${fournies}/${lignes.length} fournie${fournies > 1 ? "s" : ""}`}
          </div>
        </div>
        {lignes.length > 0 &&
          (manquantesObligatoires === 0 ? (
            <Pill tone="good">Complet</Pill>
          ) : (
            <Pill tone="danger">
              {manquantesObligatoires} exigée{manquantesObligatoires > 1 ? "s" : ""}
            </Pill>
          ))}
      </div>

      {lignes.length > 0 && (
        <div className="flex flex-col gap-2">
          {lignes.map((l) => (
            <div key={l.documentCategory} className="flex items-start gap-2">
              {l.fourni ? (
                <CheckCircle2 size={14} className="text-sage shrink-0 mt-0.5" />
              ) : l.enAttente ? (
                <Clock size={14} className="text-seal shrink-0 mt-0.5" />
              ) : (
                <Circle size={14} className={`shrink-0 mt-0.5 ${l.required ? "text-rust" : "text-slate"}`} />
              )}
              <div className="min-w-0">
                <div className={`text-[12px] ${l.fourni ? "text-ink" : "text-slate"}`}>
                  {l.label}
                  {!l.required && <span className="text-[10.5px] text-slate"> — facultative</span>}
                </div>
                {l.fourni ? (
                  <div className="text-[11px] text-slate truncate">{l.fourni.title}</div>
                ) : l.enAttente ? (
                  <div className="text-[11px] text-seal">Adressée à l&apos;intervenant, en attente de réponse</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {lienReglages && (
        <a href={lienReglages} className="text-[11px] text-slate hover:text-ink underline decoration-line w-fit">
          Régler les pièces attendues
        </a>
      )}
    </div>
  );
}
