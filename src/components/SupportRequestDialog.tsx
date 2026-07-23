"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type Intent = "complaint" | "question" | "secure_report" | "rights_request";

const RIGHTS_TYPE_LABELS: Record<string, string> = {
  access: "Accéder à mes données",
  erasure: "Effacer mes données",
  portability: "Récupérer mes données (portabilité)",
  rectification: "Corriger une erreur dans mes données",
};

// One entry point for everything a learner (or staff member) might need to
// send to the admin side — client feedback: picking between "réclamation" /
// "signalement" / a way to ask about their own data before even writing
// anything was the wrong first question to ask someone who just wants help.
// Each intent still lands in its own existing model/workflow underneath
// (Complaint, SecureReport, RightsRequest) — this dialog is only the front
// door, not a new ticket system. "Signalement confidentiel" in particular
// keeps its exact restricted-access + audit-log behavior; unifying the entry
// point must not weaken that.
export function SupportRequestDialog({
  dossiers,
  canRequestOwnRights,
}: {
  dossiers: { id: string; label: string }[];
  canRequestOwnRights: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<Intent | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [rightsType, setRightsType] = useState("access");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setIntent("");
    setSubject("");
    setDescription("");
    setDossierId("");
    setAnonymous(false);
    setReporterName("");
    setReporterContact("");
    setRightsType("access");
    setDone(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      if (intent === "complaint" || intent === "question") {
        const res = await fetch("/api/complaints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, description, dossierId: dossierId || undefined, category: intent }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        setDone(intent === "complaint" ? "Réclamation envoyée — elle sera traitée par l'équipe." : "Votre question a été transmise au support.");
      } else if (intent === "secure_report") {
        const res = await fetch("/api/secure-reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, reporterName, reporterContact, anonymous }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        setDone("Signalement transmis. Seuls les administrateurs habilités y ont accès, et chaque consultation est tracée.");
      } else if (intent === "rights_request") {
        const res = await fetch("/api/support/rights-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestType: rightsType, details: description || undefined }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        setDone("Votre demande a été enregistrée — le délégué à la protection des données a 1 mois pour y répondre.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Erreur lors de l'envoi.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft"
      >
        Nouvelle demande
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Nouvelle demande</div>
          <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-slate hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-sage">{done}</div>
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="self-start text-[12.5px] text-slate hover:text-ink mt-1">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-[11px] text-slate uppercase tracking-wide mb-1 block">Je veux…</label>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as Intent)}
                required
                className="w-full border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              >
                <option value="">Choisir…</option>
                <option value="complaint">Faire une réclamation</option>
                <option value="question">Poser une question / contacter le support</option>
                <option value="secure_report">Faire un signalement confidentiel</option>
                {canRequestOwnRights && <option value="rights_request">Faire une demande sur mes données personnelles</option>}
              </select>
            </div>

            {(intent === "complaint" || intent === "question") && (
              <>
                {dossiers.length > 0 && (
                  <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink">
                    <option value="">Formation concernée (optionnel)</option>
                    {dossiers.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                )}
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet"
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez votre demande"
                  rows={4}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
                />
              </>
            )}

            {intent === "secure_report" && (
              <>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez les faits (dates, personnes concernées, contexte)"
                  rows={4}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
                />
                <label className="flex items-center gap-2 text-[12px] text-ink">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-sage" />
                  Envoyer ce signalement de façon anonyme
                </label>
                {!anonymous && (
                  <div className="flex items-center gap-2">
                    <input
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      placeholder="Votre nom (optionnel)"
                      className="border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1"
                    />
                    <input
                      value={reporterContact}
                      onChange={(e) => setReporterContact(e.target.value)}
                      placeholder="Contact pour un suivi (optionnel)"
                      className="border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1"
                    />
                  </div>
                )}
              </>
            )}

            {intent === "rights_request" && (
              <>
                <select
                  value={rightsType}
                  onChange={(e) => setRightsType(e.target.value)}
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  {Object.entries(RIGHTS_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Précisez votre demande (optionnel)"
                  rows={3}
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
                />
              </>
            )}

            {intent && (
              <button
                type="submit"
                disabled={sending}
                className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
              >
                {sending ? "Envoi…" : "Envoyer"}
              </button>
            )}
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
