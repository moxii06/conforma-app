"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTOMATION_TRIGGER_LABELS } from "@/lib/automationRules";

type Rule = {
  id: string;
  trigger: string;
  afterDays: number;
  sendEmail: boolean;
  active: boolean;
};

// Client feedback: instead of relying only on the app's fixed global
// relance thresholds, staff should be able to set a rule per formation —
// "after N days, flag it" and, optionally, send an automatic reminder
// email. Only one trigger kind exists today (needs_assessment_incomplete),
// hidden as a fixed label rather than a picker since there's nothing to
// choose between yet — see lib/automationRules.ts.
export function AutomationRulesPanel({ courseId, rules }: { courseId: string; rules: Rule[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [afterDays, setAfterDays] = useState("7");
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const days = parseInt(afterDays, 10);
    if (!days || days < 1) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}/automation-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ afterDays: days, sendEmail }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création de la règle.");
      return;
    }
    setAdding(false);
    setAfterDays("7");
    setSendEmail(false);
    router.refresh();
  }

  async function toggleActive(rule: Rule) {
    await fetch(`/api/automation-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    router.refresh();
  }

  async function removeRule(ruleId: string) {
    await fetch(`/api/automation-rules/${ruleId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Règles de relance automatisées</div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
            + Ajouter une règle
          </button>
        )}
      </div>

      {rules.length === 0 && !adding && (
        <div className="text-[11.5px] text-slate">Aucune règle — les seuils par défaut de l&apos;application s&apos;appliquent.</div>
      )}

      <div className="flex flex-col gap-1.5">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-line first:border-t-0 text-[12px]">
            <div className={rule.active ? "text-ink" : "text-slate line-through"}>
              {AUTOMATION_TRIGGER_LABELS[rule.trigger] ?? rule.trigger} — après {rule.afterDays} j
              {rule.sendEmail && " · email automatique"}
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button type="button" onClick={() => toggleActive(rule)} className="text-slate hover:text-ink">
                {rule.active ? "Désactiver" : "Activer"}
              </button>
              <button type="button" onClick={() => removeRule(rule.id)} className="text-slate hover:text-rust">
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="flex flex-col gap-1.5 mt-2 border border-line rounded-md p-2.5 bg-[#FAF9F6]">
          <div className="text-[11.5px] text-ink">{AUTOMATION_TRIGGER_LABELS.needs_assessment_incomplete}</div>
          <label className="flex items-center gap-2 text-[11.5px] text-slate">
            Relancer après
            <input
              type="number"
              min={1}
              value={afterDays}
              onChange={(e) => setAfterDays(e.target.value)}
              className="w-16 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
            />
            jours
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-sage" />
            Envoyer aussi un email automatique à l&apos;apprenant
          </label>
          <div className="flex items-center gap-2.5 mt-1">
            <button type="button" onClick={handleAdd} disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
              {loading ? "…" : "Créer la règle"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-slate hover:text-ink">
              Annuler
            </button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </div>
      )}
    </div>
  );
}
