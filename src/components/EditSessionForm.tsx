"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionFormat } from "@prisma/client";
import { format as formatDate } from "date-fns";

type Trainer = { id: string; name: string };

const FORMAT_LABELS: Record<SessionFormat, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-[#FAF8F2] border border-line rounded-md p-3.5">
      <div className="flex gap-2">
        <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1">
          <option value="">Formateur à assigner</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={sessFormat} onChange={(e) => setSessFormat(e.target.value as SessionFormat)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          {Object.entries(FORMAT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        <input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
        <input required type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
      </div>
      <div className="flex gap-2">
        <input placeholder="Lieu / adresse (si présentiel)" value={location} onChange={(e) => setLocation(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1" />
        <input required type="number" min={1} placeholder="Places" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-24" />
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
