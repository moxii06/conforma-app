import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Paperclip } from "lucide-react";
import { Pill } from "@/components/ui";
import {
  SUPPORT_KIND_LABELS,
  URGENCY_LABELS,
  URGENCY_TONE,
  type SupportKind,
  type SupportUrgency,
} from "@/lib/supportRequests";

/**
 * Le tableau de suivi : réclamations et signalements confidentiels dans une
 * seule vue — sujet, responsable, échéance, urgence, statut.
 *
 * Composant serveur : il ne fait qu'afficher. Le mélange des deux sources, la
 * pagination et la recherche sont faits par la page, qui seule sait ce que le
 * lecteur a le droit de voir (un signalement confidentiel n'entre dans la
 * liste que si canAccessSecureReports l'autorise).
 */

export type LigneSuivi = {
  id: string;
  kind: SupportKind;
  /** Ce qui identifie la demande. Pour un signalement : jamais son contenu. */
  sujet: string;
  demandeur: string;
  responsable: string | null;
  /** Combien de personnes sont prévenues EN PLUS du responsable. */
  destinatairesEnPlus: number;
  echeance: Date | null;
  urgence: SupportUrgency;
  statutLabel: string;
  statutTone: "danger" | "warn" | "good" | "neutral";
  traite: boolean;
  aPreuve: boolean;
  creeLe: Date;
};

export function SupportTrackingTable({ lignes }: { lignes: LigneSuivi[] }) {
  const maintenant = new Date();

  if (lignes.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucune demande ne correspond.</div>;
  }

  return (
    // Un tableau large ne doit jamais faire défiler la PAGE horizontalement :
    // il défile dans son propre cadre.
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="text-left text-[10.5px] text-slate uppercase tracking-wide">
            <th className="font-semibold pb-2 pr-3">Sujet</th>
            <th className="font-semibold pb-2 pr-3">Responsable</th>
            <th className="font-semibold pb-2 pr-3">Échéance</th>
            <th className="font-semibold pb-2 pr-3">Urgence</th>
            <th className="font-semibold pb-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            // « En retard » ne veut rien dire pour une demande déjà traitée :
            // l'échéance est passée, mais le travail est fait.
            const enRetard = !l.traite && l.echeance !== null && l.echeance < maintenant;
            return (
              <tr key={`${l.kind}-${l.id}`} className="border-t border-line align-top">
                <td className="py-2.5 pr-3">
                  <div className="text-[12.5px] text-ink font-medium flex items-center gap-1.5">
                    <span className="min-w-0">{l.sujet}</span>
                    {l.aPreuve && <Paperclip size={12} className="text-slate shrink-0" aria-label="Preuve de traitement jointe" />}
                  </div>
                  <div className="text-[11px] text-slate">
                    {SUPPORT_KIND_LABELS[l.kind]} · {l.demandeur} · reçue le {format(l.creeLe, "d MMM yyyy", { locale: fr })}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-[12px] text-ink">
                  {l.responsable ?? <span className="text-slate">Non assignée</span>}
                  {l.destinatairesEnPlus > 0 && (
                    <div className="text-[11px] text-slate">
                      +{l.destinatairesEnPlus} prévenu{l.destinatairesEnPlus > 1 ? "s" : ""}
                    </div>
                  )}
                </td>
                <td className={`py-2.5 pr-3 text-[12px] ${enRetard ? "text-rust font-medium" : "text-ink"}`}>
                  {l.echeance ? format(l.echeance, "d MMM yyyy", { locale: fr }) : <span className="text-slate">—</span>}
                  {enRetard && <div className="text-[11px] text-rust">dépassée</div>}
                </td>
                <td className="py-2.5 pr-3">
                  <Pill tone={URGENCY_TONE[l.urgence]}>{URGENCY_LABELS[l.urgence]}</Pill>
                </td>
                <td className="py-2.5">
                  <Pill tone={l.statutTone}>{l.statutLabel}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
