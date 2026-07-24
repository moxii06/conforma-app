"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTOMATION_TRIGGER_LABELS, AUTOMATION_TRIGGER_VALUES } from "@/lib/automationRules";
import { insertTagAtCursor } from "@/lib/mergeTags";
import { MergeTagButtons } from "@/components/MergeTagButtons";

type Rule = {
  id: string;
  trigger: string;
  afterDays: number;
  sendEmail: boolean;
  emailSubject: string | null;
  emailBody: string | null;
  active: boolean;
};

// "Before" triggers count days back from a deadline (session date, access
// duration end); "after" triggers count forward from enrollment/session end.
// Just phrasing — the actual clock per trigger lives in dashboardTasks.ts.
const AFTER_DAYS_PHRASING: Record<string, string> = {
  needs_assessment_incomplete: "Relancer après",
  contract_not_signed: "Relancer après",
  convocation_missing: "Relancer si toujours pas envoyée, à partir de",
  rolling_duration_expiring: "Prévenir",
  satisfaction_not_collected: "Relancer après",
};
const AFTER_DAYS_SUFFIX: Record<string, string> = {
  convocation_missing: "jours avant la session",
  rolling_duration_expiring: "jours avant la fin de la durée d'accès",
};

// Client feedback: staff should be able to set a rule per formation instead
// of relying only on the app's fixed global relance thresholds — "after N
// days, flag it" and, optionally, write a reminder email once (with
// clickable [Prénom]/[Nom]/... merge tags) that's filled in and sent
// automatically for every learner the rule fires for.
export function AutomationRulesPanel({ courseId, rules }: { courseId: string; rules: Rule[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [trigger, setTrigger] = useState<string>(AUTOMATION_TRIGGER_VALUES[0]);
  const [afterDays, setAfterDays] = useState("7");
  const [sendEmail, setSendEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<"subject" | "body">("body");

  function insertTag(tag: string) {
    if (activeField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const { text, cursor } = insertTagAtCursor(el, emailSubject, tag);
      setEmailSubject(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const { text, cursor } = insertTagAtCursor(el, emailBody, tag);
      setEmailBody(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    }
  }

  function resetForm() {
    setTrigger(AUTOMATION_TRIGGER_VALUES[0]);
    setAfterDays("7");
    setSendEmail(false);
    setEmailSubject("");
    setEmailBody("");
    setError(null);
  }

  async function handleAdd() {
    const days = parseInt(afterDays, 10);
    if (!days || days < 1) return;
    if (sendEmail && (!emailSubject.trim() || !emailBody.trim())) {
      setError("L'objet et le corps de l'email sont requis pour une relance avec envoi automatique.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}/automation-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger,
        afterDays: days,
        sendEmail,
        emailSubject: sendEmail ? emailSubject : undefined,
        emailBody: sendEmail ? emailBody : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création de la règle.");
      return;
    }
    setAdding(false);
    resetForm();
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
              {AUTOMATION_TRIGGER_LABELS[rule.trigger] ?? rule.trigger} — {rule.afterDays} j
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
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          >
            {AUTOMATION_TRIGGER_VALUES.map((key) => (
              <option key={key} value={key}>
                {AUTOMATION_TRIGGER_LABELS[key]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[11.5px] text-slate">
            {AFTER_DAYS_PHRASING[trigger]}
            <input
              type="number"
              min={1}
              value={afterDays}
              onChange={(e) => setAfterDays(e.target.value)}
              className="w-16 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
            />
            {AFTER_DAYS_SUFFIX[trigger] ?? "jours"}
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-sage" />
            Envoyer aussi un email automatique à l&apos;apprenant
          </label>

          {sendEmail && (
            <div className="flex flex-col gap-1.5 border border-line rounded-md p-2 bg-white">
              <MergeTagButtons onInsert={insertTag} />
              <input
                ref={subjectRef}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                onFocus={() => (activeField.current = "subject")}
                placeholder="Objet de l'email"
                className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
              />
              <textarea
                ref={bodyRef}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                onFocus={() => (activeField.current = "body")}
                rows={5}
                placeholder="Bonjour [Prénom], ..."
                className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
              />
            </div>
          )}

          <div className="flex items-center gap-2.5 mt-1">
            <button type="button" onClick={handleAdd} disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
              {loading ? "…" : "Créer la règle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                resetForm();
              }}
              className="text-[12px] text-slate hover:text-ink"
            >
              Annuler
            </button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </div>
      )}
    </div>
  );
}
