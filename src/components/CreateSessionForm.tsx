"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionFormat, SessionMode } from "@prisma/client";

type Course = { id: string; title: string };
type Trainer = { id: string; name: string };

const FORMAT_LABELS: Record<SessionFormat, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

export function CreateSessionForm({ courses, trainers }: { courses: Course[]; trainers: Trainer[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseMode, setCourseMode] = useState<"existing" | "new">(courses.length > 0 ? "existing" : "new");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [courseTitle, setCourseTitle] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [mode, setMode] = useState<SessionMode>(SessionMode.FIXED_DATE);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [format, setFormat] = useState<SessionFormat>(SessionFormat.IN_PERSON);
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "FIXED_DATE" && !date) {
      setError("Choisissez une date.");
      return;
    }
    setLoading(true);
    setError(null);

    const startsAt = mode === "FIXED_DATE" ? new Date(`${date}T${startTime}`).toISOString() : undefined;
    const endsAt = mode === "FIXED_DATE" ? new Date(`${date}T${endTime}`).toISOString() : undefined;

    const res = await fetch("/api/planning/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseMode,
        courseId: courseMode === "existing" ? courseId : undefined,
        courseTitle: courseMode === "new" ? courseTitle : undefined,
        trainerId: trainerId || undefined,
        mode,
        startsAt,
        endsAt,
        format,
        location: location || undefined,
        capacity: parseInt(capacity, 10) || 1,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setCourseTitle("");
    setLocation("");
    setDate("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start"
      >
        + Nouvelle session
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3 max-w-xl">
      <div className="flex items-center gap-2 text-[12.5px]">
        <button type="button" onClick={() => setCourseMode("existing")} disabled={courses.length === 0} className={`px-2.5 py-1 rounded-md ${courseMode === "existing" ? "bg-ink text-white" : "bg-[#F1EFE8] text-slate"}`}>
          Cours existant
        </button>
        <button type="button" onClick={() => setCourseMode("new")} className={`px-2.5 py-1 rounded-md ${courseMode === "new" ? "bg-ink text-white" : "bg-[#F1EFE8] text-slate"}`}>
          Nouveau cours
        </button>
      </div>

      {courseMode === "existing" ? (
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      ) : (
        <input required placeholder="Intitulé du cours" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      )}

      <div className="flex items-center gap-2 text-[12.5px]">
        <button type="button" onClick={() => setMode("FIXED_DATE")} className={`px-2.5 py-1 rounded-md ${mode === "FIXED_DATE" ? "bg-ink text-white" : "bg-[#F1EFE8] text-slate"}`}>
          Date fixe
        </button>
        <button type="button" onClick={() => setMode("ROLLING")} className={`px-2.5 py-1 rounded-md ${mode === "ROLLING" ? "bg-ink text-white" : "bg-[#F1EFE8] text-slate"}`}>
          En continu (bande passante)
        </button>
      </div>

      <div className="flex gap-2">
        <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1">
          <option value="">Formateur à assigner</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value as SessionFormat)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          {Object.entries(FORMAT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {mode === "FIXED_DATE" ? (
        <div className="flex gap-2">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
          <input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
          <input required type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
        </div>
      ) : (
        <div className="text-[11.5px] text-slate">Toujours disponible — chaque apprenant a son propre délai, réglé à son inscription.</div>
      )}

      <div className="flex gap-2">
        <input placeholder="Lieu / adresse (si présentiel)" value={location} onChange={(e) => setLocation(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1" />
        <input required type="number" min={1} placeholder="Places" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-24" />
      </div>

      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Créer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
