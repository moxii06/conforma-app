"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, PenLine } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SignaturePad } from "@/components/SignaturePad";

type HalfDay = "MORNING" | "AFTERNOON";
type Entry = {
  sessionDayId: string;
  dossierId: string;
  halfDay: HalfDay;
  signedAt: string;
  hasSignature: boolean;
  byStaff: boolean;
};
type Day = { id: string; date: string; morningHours: number | null; afternoonHours: number | null };
type Learner = { dossierId: string; name: string };

const HALF_DAY_LABELS: Record<HalfDay, string> = { MORNING: "Matin", AFTERNOON: "Après-midi" };

/**
 * The in-room attendance sheet: one learner per row, one column per half-day
 * actually held. Tapping a cell opens the signature pad for that exact
 * (learner, half-day) pair.
 *
 * Deliberately not a checkbox grid. Qualiopi auditors look for a signature
 * against a half-day, and a box someone ticked from memory afterwards is the
 * thing they discount — so the signature is the primary path and the
 * staff-recorded fallback is explicitly labelled as such rather than being
 * indistinguishable.
 */
export function AttendanceSheet({
  sessionId,
  days,
  learners,
  initialEntries,
  canEdit,
}: {
  sessionId: string;
  days: Day[];
  learners: Learner[];
  initialEntries: Entry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [signing, setSigning] = useState<{ dayId: string; dossierId: string; halfDay: HalfDay; name: string } | null>(
    null,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = (dayId: string, dossierId: string, halfDay: HalfDay) => `${dayId}|${dossierId}|${halfDay}`;
  const byKey = new Map(entries.map((e) => [key(e.sessionDayId, e.dossierId, e.halfDay), e]));

  const columns = days.flatMap((d) =>
    (["MORNING", "AFTERNOON"] as HalfDay[])
      .filter((h) => (h === "MORNING" ? d.morningHours : d.afternoonHours) != null)
      .map((h) => ({ day: d, halfDay: h })),
  );

  async function submit(signatureDataUrl: string | null) {
    if (!signing) return;
    setPending(key(signing.dayId, signing.dossierId, signing.halfDay));
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}/attendance/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionDayId: signing.dayId,
        dossierId: signing.dossierId,
        halfDay: signing.halfDay,
        signatureDataUrl,
      }),
    });
    setPending(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "L'émargement n'a pas pu être enregistré.");
      return;
    }
    setEntries((prev) => [
      ...prev.filter(
        (e) =>
          !(e.sessionDayId === signing.dayId && e.dossierId === signing.dossierId && e.halfDay === signing.halfDay),
      ),
      {
        sessionDayId: signing.dayId,
        dossierId: signing.dossierId,
        halfDay: signing.halfDay,
        signedAt: new Date().toISOString(),
        hasSignature: signatureDataUrl != null,
        byStaff: signatureDataUrl == null,
      },
    ]);
    setSigning(null);
    router.refresh();
  }

  if (columns.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card p-5 text-[12.5px] text-slate">
        La feuille d&apos;émargement apparaîtra ici une fois les journées définies — renseignez-les juste en
        dessous, puis enregistrez.
      </div>
    );
  }

  if (learners.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card p-5 text-[12.5px] text-slate">
        Aucun apprenant inscrit à cette session.
      </div>
    );
  }

  const signedCount = entries.length;
  const expected = columns.length * learners.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12.5px] text-slate">
          <span className="font-semibold text-ink">
            {signedCount}/{expected}
          </span>{" "}
          {/* Both words agree with the total, not with how many are done —
              "0/4 émargements recueillis" reads right, "recueilli" doesn't. */}
          émargement{expected > 1 ? "s" : ""} recueilli{expected > 1 ? "s" : ""}
        </div>
        {error && <div className="text-[11.5px] text-rust">{error}</div>}
      </div>

      {/* Wide sessions scroll inside this box rather than pushing the page
          sideways — the learner column stays put so a row is still readable
          at day 5. */}
      <div className="bg-white border border-line rounded-card overflow-x-auto">
        <table className="w-full border-collapse min-w-[520px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-white text-left px-4 py-3 text-[11px] uppercase tracking-wide text-slate font-semibold z-10">
                Apprenant
              </th>
              {columns.map(({ day, halfDay }) => (
                <th key={`${day.id}-${halfDay}`} className="px-3 py-2 text-center min-w-[104px]">
                  <div className="text-[11.5px] text-ink font-semibold">
                    {format(new Date(day.date), "EEE d MMM", { locale: fr })}
                  </div>
                  <div className="text-[10.5px] text-slate font-normal">{HALF_DAY_LABELS[halfDay]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.dossierId} className="border-b border-line last:border-b-0">
                <td className="sticky left-0 bg-white px-4 py-2.5 text-[13px] text-ink font-medium z-10">{l.name}</td>
                {columns.map(({ day, halfDay }) => {
                  const k = key(day.id, l.dossierId, halfDay);
                  const entry = byKey.get(k);
                  const busy = pending === k;
                  return (
                    <td key={k} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || busy}
                        onClick={() =>
                          setSigning({ dayId: day.id, dossierId: l.dossierId, halfDay, name: l.name })
                        }
                        title={
                          entry
                            ? entry.byStaff
                              ? "Présence enregistrée par l'organisme"
                              : `Signé le ${format(new Date(entry.signedAt), "d MMM à HH:mm", { locale: fr })}`
                            : "Faire signer"
                        }
                        // 44 px minimum: this is tapped with a finger, often
                        // by someone standing up.
                        className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                          entry
                            ? entry.byStaff
                              ? "bg-[#F7EDD6] border-[#D9C79E] text-[#8A6A1F]"
                              : "bg-[#DEE5E0] border-sage/40 text-sage"
                            : "bg-linen border-line text-slate hover:border-ink-soft hover:text-ink"
                        }`}
                      >
                        {busy ? "…" : entry ? <Check size={18} /> : <PenLine size={16} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#DEE5E0] border border-sage/40" /> Signé par l&apos;apprenant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#F7EDD6] border border-[#D9C79E]" /> Noté par l&apos;organisme
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-linen border border-line" /> À émarger
        </span>
      </div>

      {signing && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-card sm:rounded-card border border-line p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink truncate">{signing.name}</div>
                <div className="text-[11.5px] text-slate">
                  {format(new Date(days.find((d) => d.id === signing.dayId)!.date), "EEEE d MMMM", { locale: fr })} —{" "}
                  {HALF_DAY_LABELS[signing.halfDay].toLowerCase()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSigning(null)}
                aria-label="Fermer"
                className="text-slate hover:text-ink shrink-0 min-h-11 min-w-11 flex items-center justify-center -mr-2 -mt-2"
              >
                <X size={18} />
              </button>
            </div>

            <SignaturePadWrapper onSubmit={submit} />
          </div>
        </div>
      )}
    </div>
  );
}

// Split out so the pad's own state resets every time the dialog opens for a
// different learner — otherwise the previous person's stroke would still be
// on the canvas.
function SignaturePadWrapper({ onSubmit }: { onSubmit: (dataUrl: string | null) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <SignaturePad onChange={setDataUrl} disabled={saving} />
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          disabled={!dataUrl || saving}
          onClick={() => {
            setSaving(true);
            onSubmit(dataUrl);
          }}
          className="bg-ink text-white text-[13px] font-medium rounded-md px-4 min-h-11 hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Valider la signature"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            onSubmit(null);
          }}
          className="text-[12px] text-slate hover:text-ink underline decoration-line disabled:opacity-60"
        >
          Noter présent sans signature
        </button>
      </div>
      <p className="text-[11px] text-slate">
        La signature de l&apos;apprenant est la preuve attendue en audit. « Noter présent » reste possible (feuille
        papier, tablette en panne) mais est enregistré comme tel.
      </p>
    </>
  );
}
