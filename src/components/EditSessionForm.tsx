"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionFormat } from "@prisma/client";
import { format as formatDate } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";

type Trainer = { id: string; name: string };

const FORMAT_LABELS: Record<SessionFormat, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

// Un champ ne doit jamais dépasser sa colonne : `w-full` + `min-w-0`, et
// aucune largeur fixe. C'est ce qui manquait, et ce qui faisait déborder
// le formulaire sur la carte voisine.
const fieldClass =
  "w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink bg-white outline-none focus:border-seal";
const labelClass = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";

const LOCATION_PLACEHOLDER: Record<SessionFormat, string> = {
  IN_PERSON: "Lieu / adresse",
  REMOTE: "Lien de visio (facultatif — généré automatiquement sinon)",
  HYBRID: "Lieu et/ou lien de visio",
};

export function EditSessionForm({
  sessionId,
  trainers,
  initial,
}: {
  sessionId: string;
  trainers: Trainer[];
  initial: {
    trainerId: string | null;
    startsAt: Date;
    endsAt: Date;
    format: SessionFormat;
    location: string | null;
    capacity: number;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trainerId, setTrainerId] = useState(initial.trainerId ?? "");
  const [date, setDate] = useState(formatDate(initial.startsAt, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(formatDate(initial.startsAt, "HH:mm"));
  const [endTime, setEndTime] = useState(formatDate(initial.endsAt, "HH:mm"));
  const [sessFormat, setSessFormat] = useState<SessionFormat>(initial.format);
  const [location, setLocation] = useState(initial.location ?? "");
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const startsAt = new Date(`${date}T${startTime}`).toISOString();
    const endsAt = new Date(`${date}T${endTime}`).toISOString();

    const res = await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerId: trainerId || null,
        startsAt,
        endsAt,
        format: sessFormat,
        location: location || null,
        capacity: parseInt(capacity, 10) || 1,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la modification.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Modifier la session
      </button>
    );
  }

  return (
    // `w-full min-w-0` : le formulaire est posé dans une rangée flex, où un
    // élément refuse par défaut de se rétrécir sous la taille de son contenu
    // (min-width: auto). Sans ces deux classes il pousse hors de la carte,
    // quelle que soit la mise en forme interne — c'est la moitié du débordement.
    <form onSubmit={handleSubmit} className="w-full min-w-0 flex flex-col gap-2.5 bg-linen border border-line rounded-md p-3.5">
      {/* Client feedback: the only way out of edit mode was a small text
          link at the very bottom, easy to miss once the form fills the
          space where the session summary used to be. This arrow gives an
          immediate, visible "go back" next to the form's own heading. */}
      <div className="flex items-center gap-1.5 -mb-0.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate hover:text-ink shrink-0"
          title="Revenir en arrière"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="text-[12.5px] font-semibold text-ink">Modifier la session</div>
      </div>
      {/* Ce formulaire vit dans la colonne de résumé, large de 300 px. Les
          champs étaient posés sur trois rangées horizontales à largeur fixe
          (w-28 + w-28 + un champ date) : à eux seuls ils dépassaient la
          colonne, et débordaient sur la carte voisine. Tout est désormais
          en pleine largeur, sauf début/fin qui tiennent à deux — et chaque
          champ porte son libellé : un « 8 » seul dans une case ne dit pas
          s'il s'agit de places, d'heures ou de jours. */}
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="es-trainer">Formateur</label>
        <select id="es-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={fieldClass}>
          <option value="">À assigner</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="es-format">Format</label>
        <select id="es-format" value={sessFormat} onChange={(e) => setSessFormat(e.target.value as SessionFormat)} className={fieldClass}>
          {Object.entries(FORMAT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="es-date">Date</label>
        <input id="es-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <label className={labelClass} htmlFor="es-start">Début</label>
          <input id="es-start" required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label className={labelClass} htmlFor="es-end">Fin</label>
          <input id="es-end" required type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="es-location">
          {sessFormat === "REMOTE" ? "Lien de visio" : "Lieu"}
        </label>
        <input id="es-location" placeholder={LOCATION_PLACEHOLDER[sessFormat]} value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="es-capacity">Places</label>
        <input id="es-capacity" required type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${fieldClass} max-w-[110px]`} />
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
