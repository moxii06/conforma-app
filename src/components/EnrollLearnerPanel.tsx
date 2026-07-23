"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PersonPicker, type LearnerInput } from "@/components/PersonPicker";
import { SuggestedLearners } from "@/components/SuggestedLearners";
import { Plus } from "lucide-react";

type SessionOption = { id: string; mode: "FIXED_DATE" | "ROLLING"; startsAt: string; endsAt: string; format: string; spotsLeft: number };

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

export function EnrollLearnerPanel({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<LearnerInput | null>(null);
  const [sessionOptions, setSessionOptions] = useState<SessionOption[] | null>(null);
  const [accessDurationDays, setAccessDurationDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enroll(input: LearnerInput, sessionId?: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(sessionId ? { sessionId } : {}),
        ...(accessDurationDays ? { accessDurationDays: parseInt(accessDurationDays, 10) } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      if (body.needsSessionSelection) {
        setPending(input);
        setSessionOptions(body.sessions);
        return;
      }
      setError(body.error ?? "Erreur lors de l'inscription.");
      return;
    }
    setPending(null);
    setSessionOptions(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        <Plus size={13} /> Ajouter un apprenant
      </button>
    );
  }

  if (sessionOptions) {
    return (
      <div className="bg-[#EFEDE7] border border-line rounded-md p-3 flex flex-col gap-2">
        <div className="text-[12.5px] text-ink">Plusieurs sessions existent pour cette formation, choisissez-en une :</div>
        <div className="flex flex-col gap-1">
          {sessionOptions.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={loading || s.spotsLeft <= 0}
              onClick={() => pending && enroll(pending, s.id)}
              className="text-left text-[12px] border border-line rounded-md px-2.5 py-1.5 hover:border-ink-soft disabled:opacity-50"
            >
              {s.mode === "ROLLING" ? "En continu (bande passante)" : format(new Date(s.startsAt), "d MMM yyyy", { locale: fr })} ·{" "}
              {FORMAT_LABELS[s.format] ?? s.format} · {s.spotsLeft > 0 ? `${s.spotsLeft} place(s) restante(s)` : "Complet"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSessionOptions(null);
            setPending(null);
          }}
          className="self-start text-[11.5px] text-slate hover:text-ink"
        >
          Annuler
        </button>
        {error && <div className="text-[11.5px] text-rust">{error}</div>}
      </div>
    );
  }

  return (
    <div className="bg-[#EFEDE7] border border-line rounded-md p-3 flex flex-col gap-2.5">
      <label className="flex items-center gap-2 text-[11.5px] text-slate">
        Durée pour terminer (jours, si formation en continu)
        <input
          type="number"
          min={1}
          value={accessDurationDays}
          onChange={(e) => setAccessDurationDays(e.target.value)}
          placeholder="ex. 90"
          className="w-20 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </label>
      <SuggestedLearners courseId={courseId} onAdd={(contactId) => enroll({ contactId })} />
      <PersonPicker onSelect={(input) => enroll(input)} />
      <button type="button" onClick={() => setOpen(false)} className="self-start text-[11.5px] text-slate hover:text-ink">
        Fermer
      </button>
      {loading && <div className="text-[11px] text-slate">Inscription…</div>}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
