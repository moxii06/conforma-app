"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import {
  SUPPORT_URGENCIES,
  URGENCY_HINTS,
  URGENCY_LABELS,
  normaliserUrgence,
  type SupportKind,
  type SupportUrgency,
} from "@/lib/supportRequests";

export type MembreAssignable = { id: string; name: string; habiliteSignalements: boolean };

/**
 * « À qui c'est » (un seul responsable), « pour quand » (l'échéance de
 * TRAITEMENT), « à quel point ça presse » (l'urgence) et « qui est prévenu en
 * plus » (les destinataires supplémentaires).
 *
 * Les quatre sont volontairement distincts. Le retour client le plus précis
 * porte sur l'échéance : le champ date existait déjà mais son intitulé ne
 * disait pas de quelle date il s'agissait, et on pouvait le lire comme une
 * date de réception. Il est ici nommé, et sous-titré.
 */
export function AssignSupportItemForm({
  kind,
  itemId,
  members,
  initial,
}: {
  kind: SupportKind;
  itemId: string;
  members: MembreAssignable[];
  initial: {
    assignedToUserId: string | null;
    assigneeComment: string | null;
    assigneeDeadline: Date | null;
    urgency: string | null;
    notifyUserIds: string[];
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState(initial.assignedToUserId ?? "");
  const [comment, setComment] = useState(initial.assigneeComment ?? "");
  const [deadline, setDeadline] = useState(initial.assigneeDeadline ? format(initial.assigneeDeadline, "yyyy-MM-dd") : "");
  const [urgency, setUrgency] = useState<SupportUrgency>(normaliserUrgence(initial.urgency));
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>(initial.notifyUserIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sur le canal confidentiel, seuls les membres habilités à LIRE un
  // signalement peuvent en être responsables ou destinataires. Le reste de
  // l'équipe recevrait une notification qu'il ne peut pas ouvrir — et
  // apprendrait au passage qu'un signalement existe.
  const confidentiel = kind === "secure-reports";
  const choisissables = confidentiel ? members.filter((m) => m.habiliteSignalements) : members;
  // Un responsable désigné avant ce durcissement (ou avant un changement de
  // rôle) doit rester VISIBLE, sinon la liste déroulante s'afficherait vide
  // sans expliquer pourquoi.
  const responsableHorsListe =
    assignedToUserId && !choisissables.some((m) => m.id === assignedToUserId)
      ? members.find((m) => m.id === assignedToUserId)
      : undefined;

  const destinatairesPossibles = choisissables.filter((m) => m.id !== assignedToUserId);

  function basculerDestinataire(id: string) {
    setNotifyUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/${kind}/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedToUserId: assignedToUserId || null,
        assigneeComment: comment || null,
        assigneeDeadline: deadline || null,
        urgency,
        // Le responsable n'est jamais aussi un destinataire supplémentaire :
        // la route le réécarte de son côté, on ne l'envoie pas non plus.
        notifyUserIds: notifyUserIds.filter((id) => id !== assignedToUserId),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Enregistrement impossible.");
      return;
    }
    setOpen(false);
    toast.success("Assignation enregistrée.");
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="tertiary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        {initial.assignedToUserId ? "Modifier l'assignation" : "Assigner"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-linen border border-line rounded-md p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-slate uppercase tracking-wide">Responsable</span>
          <select
            value={assignedToUserId}
            onChange={(e) => {
              const id = e.target.value;
              setAssignedToUserId(id);
              // Devenir responsable sort de la liste des « prévenus en plus ».
              setNotifyUserIds((prev) => prev.filter((x) => x !== id));
            }}
            className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink outline-none focus:border-seal"
          >
            <option value="">Non assigné</option>
            {choisissables.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            {responsableHorsListe && (
              <option value={responsableHorsListe.id}>{responsableHorsListe.name} (non habilité)</option>
            )}
          </select>
          <span className="text-[11px] text-slate">Une seule personne : c&apos;est à elle que revient le traitement.</span>
        </label>

        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-slate uppercase tracking-wide">Échéance de traitement</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink outline-none focus:border-seal"
          />
          <span className="text-[11px] text-slate">
            Date limite pour <span className="text-ink">avoir traité</span> la demande — pas la date où elle est arrivée.
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] text-slate uppercase tracking-wide">Niveau d&apos;urgence</span>
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as SupportUrgency)}
          className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink outline-none focus:border-seal sm:max-w-xs"
        >
          {SUPPORT_URGENCIES.map((u) => (
            <option key={u} value={u}>{URGENCY_LABELS[u]}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate">{URGENCY_HINTS[urgency]}.</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-slate uppercase tracking-wide">Destinataires supplémentaires</span>
        <span className="text-[11px] text-slate">
          Le responsable est « à qui c&apos;est » ; les personnes cochées ici sont prévenues et peuvent suivre, sans être
          chargées du traitement. Une demande dont tout le monde est responsable n&apos;est traitée par personne.
        </span>
        {confidentiel && (
          <span className="text-[11px] text-slate">
            Signalement confidentiel : seuls les membres habilités à le lire peuvent être prévenus.
          </span>
        )}
        {destinatairesPossibles.length === 0 ? (
          <span className="text-[11.5px] text-slate">Aucun autre membre disponible.</span>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {destinatairesPossibles.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={notifyUserIds.includes(m.id)}
                  onChange={() => basculerDestinataire(m.id)}
                  className="accent-sage"
                />
                {m.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] text-slate uppercase tracking-wide">Commentaire interne</span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Contexte, prochaine étape…"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-seal"
        />
      </label>

      <div className="flex items-center gap-2.5 flex-wrap">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
        {error && <span className="text-[11.5px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
