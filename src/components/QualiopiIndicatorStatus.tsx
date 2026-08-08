import Link from "next/link";
import type { EvidenceGap, IndicatorStatus } from "@/lib/qualiopiEvidence";

/**
 * Le vocabulaire commun du feu tricolore Qualiopi.
 *
 * Un seul fichier pour les libellés, les couleurs et la ligne d'action, parce
 * que le plan d'action et le détail par critère montrent LE MÊME état du même
 * indicateur à deux endroits de l'écran : deux jeux de libellés, et l'organisme
 * lirait « à vérifier » en haut et « incomplet » plus bas pour la même ligne.
 */

export const QUALIOPI_STATUS_LABELS: Record<IndicatorStatus, string> = {
  conforme: "Conforme",
  a_verifier: "À vérifier",
  non_conforme: "Non conforme",
};

/** Ce que chaque état veut dire, pour la légende — pas pour chaque ligne. */
export const QUALIOPI_STATUS_HINTS: Record<IndicatorStatus, string> = {
  conforme: "preuve détectée dans Jalon, ou dossier validé par vous",
  a_verifier: "des éléments existent, mais le dossier est incomplet",
  non_conforme: "rien de détecté sur cet indicateur",
};

// Pastilles rondes plutôt que texte : à 32 lignes, un libellé répété 32 fois
// devient du bruit, alors qu'une colonne de pastilles se lit d'un seul
// balayage vertical. Le libellé reste porté par le title/aria-label et par la
// légende en tête de bloc — la couleur n'est jamais le seul porteur du sens.
const BADGE_TONES: Record<IndicatorStatus, string> = {
  conforme: "bg-sage text-mist",
  a_verifier: "bg-seal text-mist",
  non_conforme: "bg-rust text-mist",
};

const BADGE_GLYPHS: Record<IndicatorStatus, string> = {
  conforme: "✓",
  a_verifier: "!",
  non_conforme: "✕",
};

export function QualiopiStatusBadge({ status, size = "md" }: { status: IndicatorStatus; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "w-[18px] h-[18px] text-[10px]" : "w-5 h-5 text-[11px]";
  return (
    <span
      role="img"
      aria-label={QUALIOPI_STATUS_LABELS[status]}
      title={QUALIOPI_STATUS_LABELS[status]}
      className={`${dims} ${BADGE_TONES[status]} shrink-0 inline-flex items-center justify-center rounded-full font-semibold leading-none`}
    >
      {BADGE_GLYPHS[status]}
    </span>
  );
}

/**
 * L'action d'un indicateur rouge, pour lequel aucun trou nommé n'existe.
 *
 * Une ligne rouge sans lien serait un constat sans issue — exactement le
 * reproche fait à l'ancien score global. Faute de trou identifiable, on
 * renvoie vers le résumé personnalisé de l'indicateur (onglet Préparation
 * audit), qui est le seul endroit qui explique quelles pièces réunir.
 */
export function fallbackGap(indicatorNumber: number): EvidenceGap {
  return {
    label: "Aucune trace exploitable détectée dans Jalon pour cet indicateur.",
    href: `/qualiopi?tab=preparation-audit#indicateur-${indicatorNumber}`,
    actionLabel: "Voir comment corriger →",
  };
}

/** Les trous d'un indicateur, ou l'action de repli s'il n'en porte aucun. */
export function actionableGaps(gaps: EvidenceGap[], indicatorNumber: number): EvidenceGap[] {
  return gaps.length > 0 ? gaps : [fallbackGap(indicatorNumber)];
}

export function GapLine({ gap }: { gap: EvidenceGap }) {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <div className="text-[11.5px] text-ink leading-relaxed flex-1 min-w-[14rem]">
        {gap.critical && <span className="font-semibold text-rust">Écart d&apos;audit — </span>}
        {gap.label}
      </div>
      <Link
        href={gap.href}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0"
      >
        {gap.actionLabel}
      </Link>
    </div>
  );
}
