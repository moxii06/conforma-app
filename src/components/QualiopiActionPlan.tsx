import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Pill } from "@/components/ui";
import type { IndicatorDiagnosis, StatusCensus } from "@/lib/qualiopiEvidence";
import {
  QualiopiStatusBadge,
  QUALIOPI_STATUS_LABELS,
  GapLine,
  actionableGaps,
} from "@/components/QualiopiIndicatorStatus";

/**
 * Ce qu'il reste à faire avant l'audit, AVANT les 7 critères.
 *
 * L'écran /qualiopi répondait « 34 % » à la question « où en suis-je ? », puis
 * demandait de visiter sept onglets pour savoir de quoi ce chiffre était fait.
 * Ce bloc inverse l'ordre : d'abord la liste nominative de ce qui cloche, avec
 * pour chaque ligne l'écran qui la corrige ; le score et le détail par critère
 * viennent après, pour ceux qui veulent vérifier.
 */

// Le plan n'est pas la liste de travail exhaustive : c'est le premier écran
// avant un audit. Au-delà d'une dizaine de lignes il cesse d'être lisible, et
// le détail complet est juste en dessous, critère par critère.
const MAX_LIGNES = 10;

function auditHorizon(nextAuditDate: Date | null): { tone: "good" | "warn" | "danger" | "neutral"; text: string } {
  if (!nextAuditDate) return { tone: "neutral", text: "Prochain audit non planifié" };
  const jours = Math.ceil((nextAuditDate.getTime() - Date.now()) / 86_400_000);
  const date = format(nextAuditDate, "d MMMM yyyy", { locale: fr });
  if (jours < 0) return { tone: "danger", text: `Audit en retard depuis ${Math.abs(jours)} j` };
  if (jours <= 90) return { tone: "warn", text: `Audit dans ${jours} j — ${date}` };
  return { tone: "neutral", text: `Audit le ${date}` };
}

function CensusItem({
  status,
  count,
}: {
  status: keyof Omit<StatusCensus, "total">;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink">
      <QualiopiStatusBadge status={status} size="sm" />
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-slate">{QUALIOPI_STATUS_LABELS[status].toLowerCase()}</span>
    </span>
  );
}

export function QualiopiActionPlan({
  todo,
  census,
  nextAuditDate,
}: {
  /** Les indicateurs orange et rouges, déjà triés par urgence. */
  todo: IndicatorDiagnosis[];
  census: StatusCensus;
  nextAuditDate: Date | null;
}) {
  const horizon = auditHorizon(nextAuditDate);
  const visibles = todo.slice(0, MAX_LIGNES);
  const restants = todo.length - visibles.length;
  // Aucun référentiel actif chargé : ne surtout pas afficher « 0 indicateur à
  // traiter », qui se lirait comme un feu vert alors que rien n'a été évalué.
  const aucunReferentiel = census.total === 0;

  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-[17px] text-ink">Plan d&apos;action</div>
          <div className="text-[11.5px] text-slate mt-0.5">
            {aucunReferentiel
              ? "Aucun référentiel actif : rien n'a encore pu être évalué."
              : todo.length === 0
                ? `Les ${census.total} indicateurs applicables sont couverts.`
                : `${todo.length} indicateur(s) à traiter sur ${census.total} applicables.`}
          </div>
        </div>
        <Pill tone={horizon.tone}>{horizon.text}</Pill>
      </div>

      {!aucunReferentiel && (
        <div className="flex items-center gap-4 flex-wrap border-t border-line pt-3">
          <CensusItem status="non_conforme" count={census.non_conforme} />
          <CensusItem status="a_verifier" count={census.a_verifier} />
          <CensusItem status="conforme" count={census.conforme} />
        </div>
      )}

      {aucunReferentiel ? (
        <div className="text-[12.5px] text-ink bg-linen border border-line rounded-md p-3 leading-relaxed">
          Sélectionnez un référentiel actif ci-dessous pour que Jalon puisse confronter vos données aux
          indicateurs du RNQ.
        </div>
      ) : todo.length === 0 ? (
        <div className="text-[12.5px] text-ink bg-linen border border-line rounded-md p-3 leading-relaxed">
          Rien à corriger côté données : chaque indicateur applicable porte une preuve détectée par Jalon ou un
          dossier que vous avez validé. La pertinence de ces preuves reste à votre appréciation et à celle de
          l&apos;auditeur.
        </div>
      ) : (
        <div>
          {visibles.map((d) => (
            <div key={d.number} className="flex gap-3 py-3 border-t border-line first:border-t-0">
              <div className="pt-0.5">
                <QualiopiStatusBadge status={d.status} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div>
                  <div className="text-[11px] text-slate tabular-nums">
                    Indicateur {d.number} · Critère {d.criterionNumber}
                  </div>
                  <div className="text-[12.5px] text-ink font-medium leading-snug">{d.label}</div>
                </div>
                {actionableGaps(d.gaps, d.number).map((gap, i) => (
                  <GapLine key={i} gap={gap} />
                ))}
              </div>
            </div>
          ))}
          {restants > 0 && (
            <div className="text-[11.5px] text-slate pt-3 border-t border-line">
              {restants} autre(s) indicateur(s) à traiter — détaillés critère par critère ci-dessous.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
