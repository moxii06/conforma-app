"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { QUESTIONS, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { CLAUSES_PALETTE, CLAUSE_PALETTE_BY_ID, clausePaletteDuBloc } from "@/lib/documentAssembly";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export type BlockCondition = { questionKey: QuestionKey; in: string[] };
export type BlockRow = { bodyText: string; conditions: BlockCondition[] | null };

function emptyBlock(): BlockRow {
  return { bodyText: "", conditions: null };
}

function blockDeClause(id: string): BlockRow | null {
  const clause = CLAUSE_PALETTE_BY_ID[id];
  if (!clause) return null;
  return { bodyText: clause.bodyText, conditions: clause.conditions.map((c) => ({ ...c, in: [...c.in] })) };
}

/**
 * Les clauses prêtes à l'emploi, en pastilles à cocher.
 *
 * Purement présentationnel, pour que les deux points d'entrée — un modèle
 * déjà découpé en paragraphes, et un modèle importé qui n'est encore qu'un
 * bloc de texte — présentent exactement la même liste avec les mêmes mots.
 * Bordure pointillée : ce sont des propositions à prendre, pas des éléments
 * du modèle tant qu'on ne les a pas cochées.
 */
export function ClausePalette({
  cocheesIds,
  onToggle,
  disabled,
}: {
  cocheesIds: string[];
  onToggle: (id: string, coche: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Clauses prêtes à l&apos;emploi</div>
      <div className="text-[11px] text-slate leading-relaxed">
        Cochez une clause pour l&apos;ajouter à ce modèle : elle arrive avec sa condition. À la génération, elle
        s&apos;insère ou se retire toute seule selon les réponses au questionnaire — vous n&apos;avez rien à réécrire.
        Comme les modèles fournis par Jalon, ces textes sont des points de départ génériques, à faire relire par un
        juriste.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CLAUSES_PALETTE.map((clause) => {
          const cochee = cocheesIds.includes(clause.id);
          return (
            <button
              key={clause.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(clause.id, !cochee)}
              title={clause.description}
              aria-pressed={cochee}
              className={`text-[11px] rounded-md px-2 py-1 border border-dashed transition-colors disabled:opacity-60 ${
                cochee ? "border-sage bg-linen text-sage font-semibold" : "border-ash text-slate hover:text-ink hover:border-slate"
              }`}
            >
              {cochee ? "✓ " : "+ "}
              {clause.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Renders a template's conditional paragraphs — either editable (an org's
// own template, canEdit) or read-only (a global Jalon starter template,
// browsed before forking). Presence of blocks is what makes a template
// "conditionnel" in the first place; there's no separate flag to keep in
// sync — see the DocumentTemplate.blocks schema comment.
export function TemplateBlocksEditor({
  templateId,
  initialBlocks,
  canEdit,
}: {
  templateId: string;
  initialBlocks: BlockRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = initialBlocks.length > 0 ? initialBlocks : [emptyBlock()];
  const [blocks, setBlocks] = useState<BlockRow[]>(initial);
  const [savedBlocks, setSavedBlocks] = useState<BlockRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(blocks) !== JSON.stringify(savedBlocks);

  // Un questionnaire de paragraphes conditionnels se construit bloc par
  // bloc — perdre la session en fermant l'onglet par erreur signifie tout
  // reprendre depuis zéro (audit S6, finding E3).
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateBlock(index: number, patch: Partial<BlockRow>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function move(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, emptyBlock()]);
  }

  // Cocher ajoute la clause en fin de liste (elle se remonte ensuite comme
  // n'importe quel paragraphe) ; décocher la retire. Reconnaissance par
  // l'intitulé d'article — voir clausePaletteDuBloc pour pourquoi le corps du
  // texte ne sert pas de clé.
  const clausesCochees = blocks
    .map((b) => clausePaletteDuBloc(b.bodyText))
    .filter((id): id is string => id !== null);

  function toggleClause(id: string, coche: boolean) {
    setBlocks((prev) => {
      if (!coche) return prev.filter((b) => clausePaletteDuBloc(b.bodyText) !== id);
      if (prev.some((b) => clausePaletteDuBloc(b.bodyText) === id)) return prev;
      const bloc = blockDeClause(id);
      if (!bloc) return prev;
      return [...prev, bloc];
    });
  }

  function setConditional(index: number, conditional: boolean) {
    updateBlock(index, { conditions: conditional ? [{ questionKey: QUESTIONS[0].key, in: [] }] : null });
  }

  function updateCondition(blockIndex: number, condIndex: number, patch: Partial<BlockCondition>) {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIndex || !b.conditions) return b;
        const conditions = b.conditions.map((c, j) => (j === condIndex ? { ...c, ...patch } : c));
        return { ...b, conditions };
      }),
    );
  }

  function addCondition(blockIndex: number) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === blockIndex ? { ...b, conditions: [...(b.conditions ?? []), { questionKey: QUESTIONS[0].key, in: [] }] } : b)),
    );
  }

  function removeCondition(blockIndex: number, condIndex: number) {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIndex || !b.conditions) return b;
        const conditions = b.conditions.filter((_, j) => j !== condIndex);
        return { ...b, conditions: conditions.length > 0 ? conditions : null };
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = blocks
      .filter((b) => b.bodyText.trim() !== "")
      .map((b) => ({
        bodyText: b.bodyText,
        conditions: b.conditions && b.conditions.every((c) => c.in.length > 0) ? b.conditions : null,
      }));
    const res = await fetch(`/api/documents/templates/${templateId}/blocks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: payload }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "L'enregistrement a échoué.");
      return;
    }
    setSavedBlocks(blocks);
    toast.success("Paragraphes enregistrés.");
    router.refresh();
  }

  const label = "text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1";
  const field = "w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] text-slate">
        Paragraphes conditionnels : chaque bloc peut être toujours inclus, ou seulement si les réponses du dossier
        correspondent aux conditions choisies. À la génération, seuls les blocs dont les conditions sont remplies
        sont assemblés — l&apos;ordre ci-dessous est celui du document final.
      </div>

      {canEdit && (
        <div className="border border-line rounded-md p-3 bg-linen">
          <ClausePalette cocheesIds={clausesCochees} onToggle={toggleClause} disabled={saving} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {blocks.map((block, i) => (
          <div key={i} className="border border-line rounded-md p-3 bg-linen flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate uppercase tracking-wide">Paragraphe {i + 1}</span>
              {canEdit && (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-slate hover:text-ink disabled:opacity-30">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="text-slate hover:text-ink disabled:opacity-30">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeBlock(i)} className="text-slate hover:text-rust">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {canEdit ? (
              <textarea
                value={block.bodyText}
                onChange={(e) => updateBlock(i, { bodyText: e.target.value })}
                rows={5}
                placeholder="Texte du paragraphe…"
                className="border border-line rounded-md px-3 py-2 text-[12.5px] text-ink outline-none focus:border-seal font-mono leading-relaxed bg-white"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-[12px] text-slate font-sans leading-relaxed">{block.bodyText}</pre>
            )}

            {canEdit && (
              <label className="flex items-center gap-2 text-[11.5px] text-ink">
                <input
                  type="checkbox"
                  checked={block.conditions !== null}
                  onChange={(e) => setConditional(i, e.target.checked)}
                  className="accent-sage"
                />
                Inclure seulement si…
              </label>
            )}

            {block.conditions && block.conditions.length > 0 && (
              <div className="flex flex-col gap-1.5 pl-1">
                {block.conditions.map((cond, j) => {
                  const question = QUESTION_BY_KEY[cond.questionKey];
                  return (
                    <div key={j} className="flex flex-col gap-1 border-t border-line pt-1.5 first:border-t-0 first:pt-0">
                      <div className="flex items-center gap-1.5">
                        {canEdit ? (
                          <select
                            value={cond.questionKey}
                            onChange={(e) => updateCondition(i, j, { questionKey: e.target.value as QuestionKey, in: [] })}
                            className={field}
                          >
                            {QUESTIONS.map((q) => (
                              <option key={q.key} value={q.key}>{q.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11.5px] text-ink">{question.label}</span>
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => removeCondition(i, j)} className="text-slate hover:text-rust shrink-0">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2.5 pl-1">
                        {question.options.map((opt) => {
                          const checked = cond.in.includes(opt.value);
                          return (
                            <label key={opt.value} className="flex items-center gap-1.5 text-[11.5px] text-ink">
                              {canEdit ? (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    updateCondition(i, j, {
                                      in: e.target.checked ? [...cond.in, opt.value] : cond.in.filter((v) => v !== opt.value),
                                    })
                                  }
                                  className="accent-sage"
                                />
                              ) : (
                                checked && <span className="text-sage">✓</span>
                              )}
                              {(canEdit || checked) && <span>{opt.label}</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {canEdit && (
                  <button type="button" onClick={() => addCondition(i)} className="self-start text-[11px] text-ink underline decoration-line hover:decoration-ink mt-0.5">
                    + condition (ET)
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={addBlock} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
            + Ajouter un paragraphe
          </button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "…" : "Enregistrer"}
          </Button>
        </div>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}

/**
 * La même palette, sur un modèle qui n'est encore qu'un bloc de texte —
 * typiquement celui qu'un organisme a importé ou écrit lui-même.
 *
 * C'était le trou : le moteur conditionnel n'était accessible qu'aux modèles
 * DÉJÀ découpés en paragraphes, c'est-à-dire, en pratique, à ceux de Jalon.
 * L'enregistrement fait la conversion, sans rien perdre : le texte actuel
 * devient le premier paragraphe, toujours inclus (même geste que
 * ActivateBlocksButton), et les clauses cochées se placent à sa suite avec
 * leurs conditions.
 */
export function ClausePaletteModelePlat({ templateId, bodyText }: { templateId: string; bodyText: string }) {
  const router = useRouter();
  const toast = useToast();
  const [cochees, setCochees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, coche: boolean) {
    setCochees((prev) => (coche ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((c) => c !== id)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    // Un modèle encore vide n'a pas de premier paragraphe à conserver — et la
    // route refuse un bloc sans texte.
    const blocs = [
      ...(bodyText.trim() !== "" ? [{ bodyText, conditions: null }] : []),
      ...cochees.flatMap((id) => {
        const bloc = blockDeClause(id);
        return bloc ? [bloc] : [];
      }),
    ];
    const res = await fetch(`/api/documents/templates/${templateId}/blocks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: blocs }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "L'ajout des clauses a échoué.");
      return;
    }
    toast.success(cochees.length > 1 ? "Clauses ajoutées au modèle." : "Clause ajoutée au modèle.");
    router.refresh();
  }

  return (
    <div className="border border-line rounded-md p-3 bg-linen flex flex-col gap-2.5">
      <ClausePalette cocheesIds={cochees} onToggle={toggle} disabled={saving} />
      {cochees.length > 0 && (
        <>
          <div className="text-[11px] text-slate">
            À l&apos;enregistrement, votre texte actuel devient le premier paragraphe du modèle, toujours inclus — rien
            n&apos;est perdu ni réécrit. Les clauses cochées viennent ensuite, et vous pourrez les déplacer ou les
            modifier comme n&apos;importe quel paragraphe.
          </div>
          <Button type="button" size="sm" className="self-start" onClick={handleSave} disabled={saving}>
            {saving ? "…" : `Ajouter ${cochees.length} clause${cochees.length > 1 ? "s" : ""} au modèle`}
          </Button>
        </>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
