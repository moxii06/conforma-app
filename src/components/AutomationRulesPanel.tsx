"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_TRIGGER_VALUES,
  AUTOMATION_DELAY_PHRASING,
  DECLENCHEURS_EMAIL_OBLIGATOIRE,
  regleSansEffet,
  resumerDelaiRegle,
} from "@/lib/automationRules";
import { SEUILS_PAR_DEFAUT_RESUME } from "@/lib/relanceDefaults";
import { insertTagAtCursor } from "@/lib/mergeTags";
import { MergeTagButtons } from "@/components/MergeTagButtons";
import { Button } from "@/components/ui";

type Rule = {
  id: string;
  trigger: string;
  afterDays: number;
  sendEmail: boolean;
  emailSubject: string | null;
  emailBody: string | null;
  active: boolean;
};

// Les formulations vivent désormais dans lib/automationRules.ts, à côté des
// déclencheurs qu'elles décrivent : trois d'entre eux n'avaient aucun
// suffixe et retombaient sur un « jours » nu, qui ne disait pas à partir de
// quoi le délai courait. Séparer le libellé de son repère, c'est se garantir
// qu'un déclencheur ajouté plus tard n'aura ni l'un ni l'autre.

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

  // Sur ces déclencheurs, décocher l'email revient à créer une règle qui ne
  // fait rien (voir DECLENCHEURS_EMAIL_OBLIGATOIRE) : la case reste cochée
  // et verrouillée plutôt que de laisser fabriquer une ligne inerte.
  const emailObligatoire = DECLENCHEURS_EMAIL_OBLIGATOIRE.includes(trigger);
  const emailAffiche = sendEmail || emailObligatoire;

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
    if (emailAffiche && (!emailSubject.trim() || !emailBody.trim())) {
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
        sendEmail: emailAffiche,
        emailSubject: emailAffiche ? emailSubject : undefined,
        emailBody: emailAffiche ? emailBody : undefined,
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

      {/* Nommer les seuils, pas seulement leur existence. « Les seuils par
          défaut s'appliquent » rassure sans permettre de décider : on ne
          surcharge pas une valeur qu'on ne voit pas. Les nombres viennent du
          module que le moteur lit lui-même, jamais d'une recopie. */}
      {rules.length === 0 && !adding && (
        <div className="text-[11.5px] text-slate leading-relaxed">
          Aucune règle propre à cette formation — les seuils par défaut s&apos;appliquent :{" "}
          {SEUILS_PAR_DEFAUT_RESUME}. Ajoutez une règle pour changer une cadence ou envoyer un email automatique.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-line first:border-t-0 text-[12px]">
            <div className={rule.active ? "text-ink" : "text-slate line-through"}>
              {AUTOMATION_TRIGGER_LABELS[rule.trigger] ?? rule.trigger} — {resumerDelaiRegle(rule.trigger, rule.afterDays)}
              {rule.sendEmail && " · email automatique"}
              {/* Les règles créées avant que l'email ne soit exigé sur ces
                  déclencheurs : elles se comptent parmi les règles actives et
                  ne font rien. Le dire ici, là où on peut les supprimer. */}
              {rule.active && regleSansEffet(rule.trigger, rule.sendEmail) && (
                <span className="text-rust"> · sans effet : aucun email configuré</span>
              )}
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
        <div className="flex flex-col gap-1.5 mt-2 border border-line rounded-md p-2.5 bg-mist">
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
          {/* Le nombre est encadré : ce qui se passe avant lui, le repère
              d'où il compte après. « Relancer 7 jours après l'inscription »
              se comprend seul ; « Relancer après 7 jours » posait la
              question qu'il prétendait résoudre. */}
          <label className="flex items-center gap-2 text-[11.5px] text-slate flex-wrap">
            {AUTOMATION_DELAY_PHRASING[trigger]?.avant ?? "Déclencher après"}
            <input
              type="number"
              min={1}
              value={afterDays}
              onChange={(e) => setAfterDays(e.target.value)}
              className="w-16 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
            />
            {AUTOMATION_DELAY_PHRASING[trigger]?.apres ?? "jours"}
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink">
            <input
              type="checkbox"
              checked={emailAffiche}
              disabled={emailObligatoire}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="accent-sage"
            />
            Envoyer aussi un email automatique à l&apos;apprenant
          </label>
          {/* Dire pourquoi la case est verrouillée, sinon elle passe pour un
              bug. Les cinq autres déclencheurs produisent bien une tâche dans
              « À faire » sans email — ces trois-là, non. */}
          {emailObligatoire && (
            <div className="text-[11px] text-slate leading-relaxed">
              Ce déclencheur n&apos;agit que par email. Sans lui, la règle ne produirait ni envoi ni ligne dans votre
              liste à faire.
            </div>
          )}

          {emailAffiche && (
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
            <Button type="button" size="sm" onClick={handleAdd} disabled={loading}>
              {loading ? "…" : "Créer la règle"}
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setAdding(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </div>
      )}
    </div>
  );
}
