"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scopeLabel, scopeHint, type DocumentScope } from "@/lib/documentScope";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ensureHtml } from "@/lib/plainTextToHtml";
import { Button } from "@/components/ui";

// L'écran de création : le document à gauche, les réglages à droite.
//
// Deux volets plutôt qu'un formulaire puis un aperçu, parce que la question
// qu'on se pose en cochant une option est toujours « qu'est-ce que ça
// change dans le texte ? ». La réponse doit être visible sans changer
// d'écran.

type Question = { key: string; label: string; options: { value: string; label: string }[] };
type Preview = {
  title: string;
  bodyText: string;
  scope: DocumentScope;
  learnerCount: number;
  needsAnswers: Question[];
  missingFields?: { key: string; label: string; fixHref: string }[];
  remainingTags?: string[];
  applied?: { key: string; value: string }[];
};

export function DocumentComposer({
  template,
  sessions,
  mergeFields,
  draft,
}: {
  template: { id: string; title: string; category: string };
  sessions: { id: string; label: string; learnerCount: number }[];
  mergeFields: string[];
  draft: { id: string; title: string; bodyText: string; sessionId: string | null } | null;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(draft?.sessionId ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Le texte édité à la main. Tant qu'il est null, la prévisualisation
  // pilote l'affichage ; dès que l'organisme écrit, c'est SON texte qui
  // fait foi — sinon un changement d'option écraserait sa rédaction.
  const [texteÉdité, setTexteÉdité] = useState<string | null>(draft ? ensureHtml(draft.bodyText) : null);
  const [enÉdition, setEnÉdition] = useState(false);

  // La conversation avec l'assistant. La proposition en cours n'est PAS
  // appliquée : elle s'affiche à gauche, en vert, et attend Accepter ou
  // Refuser. Sur un contrat, une IA qui écrirait directement serait
  // exactement le mauvais compromis.
  const [échanges, setÉchanges] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [instruction, setInstruction] = useState("");
  const [proposition, setProposition] = useState<{ bodyText: string; explanation: string } | null>(null);
  const [iaEnCours, setIaEnCours] = useState(false);
  const [iaErreur, setIaErreur] = useState<string | null>(null);

  const [documentId, setDocumentId] = useState<string | null>(draft?.id ?? null);
  const [enregistrement, setEnregistrement] = useState<"idle" | "saving" | "saved">("idle");
  const [finalisé, setFinalisé] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const params = new URLSearchParams({ templateId: template.id });
    if (sessionId) params.set("sessionId", sessionId);
    if (Object.keys(answers).length > 0) params.set("answers", JSON.stringify(answers));
    const res = await fetch(`/api/documents/preview?${params}`);
    const body = await res.json().catch(() => ({}));
    setChargement(false);
    if (!res.ok) {
      setErreur(body.error ?? "Impossible de charger l'aperçu.");
      return;
    }
    setPreview(body);
  }, [template.id, sessionId, answers]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const scope: DocumentScope = preview?.scope ?? "single";
  // Toujours du HTML côté écran : l'aperçu arrive en texte brut du
  // serveur, l'éditeur produit du HTML, et le générateur PDF attend du
  // HTML. Convertir ici évite que chaque appelant s'en préoccupe.
  const texte = texteÉdité ?? (preview?.bodyText ? ensureHtml(preview.bodyText) : "");
  const titre = preview?.title ?? template.title;
  const balisesRestantes = texteÉdité
    ? // Recalculé côté serveur à l'enregistrement ; ici on se contente de
      // ne pas afficher une alerte périmée sur un texte que l'organisme
      // vient de corriger.
      []
    : (preview?.remainingTags ?? []);


  async function demanderIa(texteDemande?: string) {
    const demande = (texteDemande ?? instruction).trim();
    if (!demande) return;
    setIaEnCours(true);
    setIaErreur(null);
    setInstruction("");
    const suite = [...échanges, { role: "user" as const, content: demande }];
    setÉchanges(suite);

    const res = await fetch("/api/documents/ai-revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyText: texte, instruction: demande, category: template.category, history: échanges }),
    });
    const body = await res.json().catch(() => ({}));
    setIaEnCours(false);
    if (!res.ok) {
      setIaErreur(body.error ?? "Échec de la rédaction assistée.");
      return;
    }
    setProposition(body);
    setÉchanges([...suite, { role: "assistant" as const, content: body.explanation }]);
  }

  function accepterProposition() {
    if (!proposition) return;
    setTexteÉdité(proposition.bodyText);
    setProposition(null);
  }

  async function enregistrer(finalize: boolean) {
    setEnregistrement("saving");
    setErreur(null);
    const res = await fetch("/api/documents/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: documentId ?? undefined,
        templateId: template.id,
        sessionId: sessionId || null,
        title: titre,
        bodyText: texte,
        category: template.category,
        finalize,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setEnregistrement("idle");
    if (!res.ok) {
      setErreur(body.error ?? "Échec de l'enregistrement.");
      return;
    }
    setDocumentId(body.id);
    if (finalize) {
      setFinalisé(true);
      router.push("/documents?tab=final");
      return;
    }
    setEnregistrement("saved");
    setTimeout(() => setEnregistrement("idle"), 2200);
  }

  async function supprimer() {
    if (!documentId) {
      router.push("/documents/nouveau");
      return;
    }
    if (!confirm("Supprimer définitivement ce brouillon ?")) return;
    const res = await fetch(`/api/documents/draft?id=${documentId}`, { method: "DELETE" });
    if (res.ok) router.push("/documents");
  }

  // ATTENTION : le vocabulaire du document est {{cle.pointee}} — voir
  // mergeTemplate.ts. MERGE_TAGS (mergeTags.ts) porte des [Crochets] et
  // sert aux corps d'emails d'automatisation ; les passer ici ferait
  // insérer dans un contrat des balises que le moteur ne résoudrait
  // jamais, et le document partirait chez le client avec « [Prénom] »
  // en toutes lettres.
  const balisesDocument = mergeFields.map((cle) => ({ tag: `{{${cle}}}`, label: cle }));

  const btn = "text-[13px] font-medium rounded-md inline-flex items-center justify-center min-h-[40px] px-4 disabled:opacity-50";
  const champ = "w-full border border-line rounded-md px-2.5 py-2 text-[12.5px] text-ink outline-none focus:border-seal min-h-[40px]";

  return (
    <>
      <div className="flex items-start justify-between gap-4 px-8 pt-5 pb-4 border-b border-line flex-wrap">
        <div>
          <Link href="/documents/nouveau" className="text-[12.5px] text-slate hover:text-ink">
            ← Changer de type
          </Link>
          <div className="font-display text-[22px] text-ink mt-1">{template.title}</div>
          <div className="text-[13px] text-slate mt-0.5">
            {finalisé ? "Finalisé · le document n'est plus modifiable" : documentId ? "Brouillon enregistré" : "Nouveau brouillon"}
          </div>
        </div>
        <div className="inline-flex bg-linen rounded-md p-1 gap-1">
          <button
            type="button"
            onClick={() => setEnÉdition(false)}
            aria-pressed={!enÉdition}
            className={`text-[12px] font-medium rounded px-3 min-h-[34px] ${!enÉdition ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"}`}
          >
            Prévisualiser
          </button>
          <button
            type="button"
            onClick={() => setEnÉdition(true)}
            aria-pressed={enÉdition}
            className={`text-[12px] font-medium rounded px-3 min-h-[34px] ${enÉdition ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"}`}
          >
            Modifier mon document
          </button>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-4">
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
          {/* Volet gauche : le document */}
          <div className="flex flex-col gap-2">
            {enÉdition ? (
              <RichTextEditor
                html={texte}
                onChange={setTexteÉdité}
                mergeTags={balisesDocument}
                size="lg"
                placeholder="Rédigez votre document…"
              />
            ) : (
              <div
                className="bg-white border border-line rounded-card p-6 text-[12.5px] text-ink leading-relaxed overflow-y-auto"
                style={{ minHeight: 520, maxHeight: 620 }}
              >
                {chargement ? (
                  <span className="text-slate">Chargement de l&apos;aperçu…</span>
                ) : proposition ? (
                  <div
                    className="bg-[#E4EAE6] -m-2 p-2 rounded"
                    dangerouslySetInnerHTML={{ __html: ensureHtml(proposition.bodyText) }}
                  />
                ) : texte ? (
                  // Le corps vient de nos propres modèles et de l'éditeur,
                  // tous deux passés par plainTextToHtml qui échappe déjà
                  // le balisage saisi. Aucune source tierce n'alimente ce
                  // champ.
                  <div dangerouslySetInnerHTML={{ __html: texte }} />
                ) : (
                  <span className="text-slate">Aperçu vide.</span>
                )}
              </div>
            )}
          </div>

          {/* Volet droit : les réglages */}
          <div className="bg-white border border-line rounded-card divide-y divide-line">
            <div className="p-4">
              <div className="text-[11px] font-semibold text-ink mb-2">Formation concernée</div>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={champ}>
                <option value="">— Aucune formation (document générique) —</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.learnerCount})
                  </option>
                ))}
              </select>
              <div className="bg-linen rounded-md px-3 py-2 text-[11.5px] text-ink mt-2 leading-snug">
                {sessionId
                  ? "Les informations de la formation — intitulé, dates, lieu, prix, formateur — sont reprises automatiquement dans le document."
                  : "Aucune reprise automatique. Les balises resteront à remplir."}
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-[11px] font-semibold text-ink">Destinataires</div>
                <span
                  className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${
                    scope === "per_learner" ? "bg-[#EFE7D6] text-seal-dark" : "bg-[#E4EAE6] text-sage"
                  }`}
                >
                  {scopeLabel(scope)}
                </span>
              </div>
              <div className="text-[11.5px] text-slate leading-snug">
                {scopeHint(scope, preview?.learnerCount ?? 0)}
              </div>
            </div>

            {(preview?.needsAnswers.length ?? 0) > 0 && (
              <div className="p-4">
                <div className="text-[11px] font-semibold text-ink mb-1">Options du document</div>
                <div className="text-[11.5px] text-slate mb-2.5 leading-snug">
                  Ce modèle contient des paragraphes conditionnels. Ces réponses décident lesquels apparaissent.
                </div>
                <div className="flex flex-col gap-2.5">
                  {preview!.needsAnswers.map((q) => (
                    <div key={q.key}>
                      <label htmlFor={`q-${q.key}`} className="block text-[12px] text-ink mb-1">
                        {q.label}
                      </label>
                      <select
                        id={`q-${q.key}`}
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers((p) => ({ ...p, [q.key]: e.target.value }))}
                        className={champ}
                      >
                        <option value="">Choisir…</option>
                        {q.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(preview?.applied?.length ?? 0) > 0 && (
              <div className="p-4">
                <div className="text-[11px] font-semibold text-ink mb-2">Paragraphes retenus</div>
                <div className="flex flex-wrap gap-1.5">
                  {preview!.applied!.map((a) => (
                    <span key={a.key} className="text-[10.5px] bg-linen text-slate rounded px-1.5 py-0.5">
                      {a.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {balisesRestantes.length > 0 && (
              <div className="p-4">
                <div className="text-[11px] font-semibold text-rust mb-1.5">
                  {balisesRestantes.length} balise{balisesRestantes.length > 1 ? "s" : ""} non remplie
                  {balisesRestantes.length > 1 ? "s" : ""}
                </div>
                <div className="text-[11.5px] text-slate leading-snug mb-2">
                  Un document qui part avec une balise visible est un document raté chez le destinataire. Choisissez une
                  formation, ou complétez le texte à la main.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {balisesRestantes.map((t) => (
                    <span key={t} className="font-mono text-[10.5px] bg-[#F3E6E2] text-rust rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4">
              <div className="text-[11px] font-semibold text-seal-dark uppercase tracking-wide mb-2">
                ✦ Assistant de rédaction
              </div>

              {échanges.length === 0 && (
                <div className="text-[11.5px] text-slate leading-snug mb-2.5">
                  Reformuler un article, en ajouter un, adapter le ton. Le document reste visible à gauche : chaque
                  proposition s&apos;y affiche avant que vous ne l&apos;acceptiez.
                </div>
              )}

              {échanges.length > 0 && (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto mb-2.5">
                  {échanges.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "bg-ink text-white text-[12px] rounded-lg rounded-br-sm px-2.5 py-1.5 self-end max-w-[92%] leading-snug"
                          : "bg-linen text-ink text-[12px] rounded-lg rounded-bl-sm px-2.5 py-1.5 self-start max-w-[92%] leading-snug"
                      }
                    >
                      {m.content}
                    </div>
                  ))}
                </div>
              )}

              {proposition && (
                <div className="bg-[#E4EAE6] border border-sage/30 rounded-md p-2.5 mb-2.5">
                  <div className="text-[11.5px] text-ink leading-snug mb-2">
                    La version proposée s&apos;affiche à gauche. Comparez avant d&apos;accepter.
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={accepterProposition}
                      className="text-[12px] font-medium bg-seal text-white rounded px-2.5 min-h-[32px]"
                    >
                      Accepter
                    </button>
                    <button
                      type="button"
                      onClick={() => setProposition(null)}
                      className="text-[12px] font-medium text-slate hover:text-ink rounded px-2.5 min-h-[32px]"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              )}

              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Par exemple : ajoute une clause d'annulation à moins de 15 jours"
                className={champ}
                style={{ minHeight: 58 }}
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => demanderIa()}
                  disabled={iaEnCours || !instruction.trim()}
                  className="text-[12px] font-medium bg-seal text-white rounded-md px-3 min-h-[34px] disabled:opacity-50 hover:bg-seal-dark"
                >
                  {iaEnCours ? "Rédaction…" : "Demander"}
                </button>
                <button
                  type="button"
                  onClick={() => demanderIa("Simplifie le vocabulaire sans changer la portée juridique.")}
                  disabled={iaEnCours}
                  className="text-[12px] text-slate hover:text-ink rounded px-2 min-h-[34px] disabled:opacity-50"
                >
                  Simplifier
                </button>
              </div>
              {iaErreur && <div className="text-[11.5px] text-rust mt-2 leading-snug">{iaErreur}</div>}
            </div>
          </div>
        </div>

        {/* Barre d'action : un seul bouton dominant, le destructif à l'opposé */}
        <div className="bg-white border border-line rounded-card p-3 flex items-center gap-2.5 flex-wrap">
          <button type="button" onClick={supprimer} className={`${btn} text-rust hover:bg-[#F3E6E2] px-3`}>
            Supprimer
          </button>
          <div className="flex-1" />
          {erreur && <div className="text-[12px] text-rust">{erreur}</div>}
          {enregistrement === "saved" && <div className="text-[12px] text-sage">Brouillon enregistré</div>}
          <Button
            onClick={() => enregistrer(false)}
            disabled={enregistrement === "saving" || finalisé}
            variant="secondary"
          >
            {enregistrement === "saving" ? "…" : "Enregistrer le brouillon"}
          </Button>
          <Button
            onClick={() => enregistrer(true)}
            disabled={enregistrement === "saving" || finalisé || !texte}
          >
            Finaliser le document
          </Button>
        </div>
      </div>
    </>
  );
}
