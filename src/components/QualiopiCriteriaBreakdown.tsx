import Link from "next/link";
import { APPRENTICESHIP_SCOPE } from "@/lib/qualiopiScope";
import { censusByStatus, type IndicatorDiagnosis, type IndicatorStatus } from "@/lib/qualiopiEvidence";
import {
  QualiopiStatusBadge,
  QUALIOPI_STATUS_LABELS,
  QUALIOPI_STATUS_HINTS,
  GapLine,
  fallbackGap,
} from "@/components/QualiopiIndicatorStatus";

/**
 * Le détail par critère : la progression qui existait déjà, mais dépliée
 * jusqu'à l'indicateur.
 *
 * La barre a trois segments au lieu d'un. Une barre unique « 2/4 » réunissait
 * sous le même « pas fait » l'indicateur sur lequel il manque une publication
 * et celui sur lequel il n'y a rien du tout — or ce sont deux journées de
 * travail très différentes, et c'est précisément la distinction que l'organisme
 * vient chercher ici.
 */

const LEGEND_ORDER: IndicatorStatus[] = ["conforme", "a_verifier", "non_conforme"];

function StackedBar({ diagnoses }: { diagnoses: IndicatorDiagnosis[] }) {
  const census = censusByStatus(diagnoses);
  const pct = (n: number) => (census.total ? (n / census.total) * 100 : 0);
  return (
    <div className="h-1.5 bg-pebble rounded-full overflow-hidden flex">
      <div className="h-full bg-sage" style={{ width: `${pct(census.conforme)}%` }} />
      <div className="h-full bg-seal" style={{ width: `${pct(census.a_verifier)}%` }} />
      <div className="h-full bg-rust" style={{ width: `${pct(census.non_conforme)}%` }} />
    </div>
  );
}

function CriterionCounts({ diagnoses }: { diagnoses: IndicatorDiagnosis[] }) {
  const census = censusByStatus(diagnoses);
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      {LEGEND_ORDER.filter((s) => census[s] > 0).map((s) => (
        <span key={s} className="inline-flex items-center gap-1 text-[11.5px] text-slate tabular-nums">
          <QualiopiStatusBadge status={s} size="sm" />
          {census[s]}
        </span>
      ))}
    </div>
  );
}

function IndicatorRow({ diagnosis }: { diagnosis: IndicatorDiagnosis }) {
  const d = diagnosis;
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-t border-line">
      <div className="pt-px">
        <QualiopiStatusBadge status={d.status} size="sm" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="text-[12.5px] text-ink leading-snug">
          <span className="text-slate tabular-nums mr-1.5">#{d.number}</span>
          {d.label}
          {/* Sans ce repère, un OF qui ne fait pas d'apprentissage croit avoir
              des trous qu'il ne peut structurellement pas combler. */}
          {d.scope === APPRENTICESHIP_SCOPE && (
            <span className="text-[10.5px] text-slate ml-2">— apprentissage uniquement</span>
          )}
        </div>

        {d.auto.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {d.auto.map((e, i) => (
              <Link key={i} href={e.href} className="text-[11px] text-sage hover:underline">
                ✓ {e.count} {e.label}
              </Link>
            ))}
          </div>
        )}

        {/* Les trous restent affichés même sur une ligne verte : une case
            cochée qui masquerait un manque détecté serait un piège le jour de
            l'audit. Elle dit « je m'en charge », pas « il n'y a rien ». */}
        {d.gaps.map((gap, i) => (
          <GapLine key={i} gap={gap} />
        ))}

        {d.gathered && (
          <div className="text-[11px] text-slate">Dossier validé par vous dans l&apos;onglet Préparation audit.</div>
        )}

        {/* Rouge sans trou nommé : la ligne garde quand même une issue, la
            même que celle du plan d'action (fallbackGap), pour que les deux
            endroits ne se mettent jamais à proposer deux chemins différents. */}
        {d.status === "non_conforme" && d.gaps.length === 0 && <GapLine gap={fallbackGap(d.number)} />}
      </div>
    </div>
  );
}

export function QualiopiCriteriaBreakdown({
  criteria,
}: {
  criteria: { number: number; label: string; diagnoses: IndicatorDiagnosis[] }[];
}) {
  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3.5">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">Détail par critère</div>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2">
          {LEGEND_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-slate">
              <QualiopiStatusBadge status={s} size="sm" />
              <span className="text-ink font-medium">{QUALIOPI_STATUS_LABELS[s]}</span>
              <span>— {QUALIOPI_STATUS_HINTS[s]}</span>
            </span>
          ))}
        </div>
      </div>

      {criteria.map((c) => (
        <div key={c.number} className="border-t border-line pt-3.5">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="text-[12.5px] text-ink font-medium">
              Critère {c.number} — {c.label}
            </div>
            <CriterionCounts diagnoses={c.diagnoses} />
          </div>
          <StackedBar diagnoses={c.diagnoses} />
          <div className="mt-1.5">
            {c.diagnoses.map((d) => (
              <IndicatorRow key={d.number} diagnosis={d} />
            ))}
            {c.diagnoses.length === 0 && (
              <div className="text-[11.5px] text-slate pt-2">Aucun indicateur applicable sur ce critère.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
