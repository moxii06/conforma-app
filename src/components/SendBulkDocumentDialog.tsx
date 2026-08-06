"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { LibraryPanel } from "@/components/LibraryPanel";
import { Button } from "@/components/ui";
import { grouperModeles, libelleEntree, type ModeleChoisissable } from "@/lib/templatePicker";

type Template = ModeleChoisissable;
type Recipient = { id: string; name: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// QW9 — bulk counterpart to SendDocumentDialog: same "template from the
// library or upload from my computer" choice, but targets a checkbox
// selection of a session's enrolled learners instead of one dossier. The
// message uses [Prénom]-style merge tags (same as the single-send dialog)
// since it's personalized per recipient server-side — see
// /api/planning/sessions/[id]/documents/send-bulk.
export function SendBulkDocumentDialog({
  sessionId,
  templates,
  recipients,
  signatureHtml,
}: {
  sessionId: string;
  templates: Template[];
  recipients: Recipient[];
  // Résolue côté serveur depuis le profil de l'expéditeur — voir
  // SignatureCheckbox et emailSignature.ts.
  signatureHtml: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "upload">("template");
  const [templateId, setTemplateId] = useState("");
  const [panelTemplates, setPanelTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyResetKey, setBodyResetKey] = useState(0);
  const [message, setMessage] = useState("<p>Bonjour [Prénom],</p><p>Veuillez trouver ci-joint le document.</p>");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(recipients.map((r) => r.id)));
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    emailFailedCount: number;
    recipientCount: number;
    // Reprise d'un lot interrompu par le plafond par passage — voir la
    // route (audit S7 P1 n°7).
    batchId?: string;
    reste?: number;
    dejaEnvoyes?: number;
    echecs?: { nom: string; message: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePickTemplate(id: string) {
    setTemplateId(id);
    setError(null);
    if (!id) {
      setTitle("");
      setBodyHtml("");
      setBodyResetKey((k) => k + 1);
      return;
    }
    setLoadingPreview(true);
    const res = await fetch(`/api/planning/sessions/${sessionId}/documents/preview-template?templateId=${id}`);
    setLoadingPreview(false);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    setTitle(data.title);
    setBodyHtml(`<p>${data.bodyText.split("\n").join("</p><p>")}</p>`);
    setBodyResetKey((k) => k + 1);
    setCategory(data.category);
  }

  function reset() {
    setMode("template");
    setTemplateId("");
    setTitle("");
    setBodyHtml("");
    setBodyResetKey((k) => k + 1);
    setMessage("<p>Bonjour [Prénom],</p><p>Veuillez trouver ci-joint le document.</p>");
    setIncludeSignature(true);
    setCategory("other");
    setFile(null);
    setSelected(new Set(recipients.map((r) => r.id)));
    setResult(null);
    setError(null);
  }

  /**
   * Un passage d'envoi. `lot` porte la clé du lot en cours : absente au
   * premier clic (le serveur en pose une), rejouée telle quelle pour
   * poursuivre un envoi que le plafond par passage a interrompu. C'est
   * cette clé qui garantit qu'on ne renvoie rien à quelqu'un de déjà servi
   * — voir la route, audit S7 P1 n°7.
   */
  async function envoyer(lot?: string) {
    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", includeSignature ? message + signatureHtml : message);
    if (lot) formData.set("batchId", lot);
    for (const id of selected) formData.append("dossierIds", id);
    if (mode === "template") {
      formData.set("templateId", templateId);
      formData.set("bodyText", bodyHtml);
    } else {
      if (file) formData.set("file", file);
    }

    const res = await fetch(`/api/planning/sessions/${sessionId}/documents/send-bulk`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    // Les compteurs s'additionnent d'un passage à l'autre : ce que voit
    // l'utilisateur est le cumul du lot, pas le dernier passage seul.
    setResult((precedent) =>
      precedent
        ? {
            ...body,
            sentCount: precedent.sentCount + body.sentCount,
            emailFailedCount: precedent.emailFailedCount + body.emailFailedCount,
            echecs: [...(precedent.echecs ?? []), ...(body.echecs ?? [])],
          }
        : body
    );
    router.refresh();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Sélectionnez au moins un apprenant.");
      return;
    }
    setResult(null);
    await envoyer();
  }

  if (recipients.length === 0) return null;

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Envoyer à plusieurs apprenants
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Envoyer un document à plusieurs apprenants</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-slate hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-sage">
              {`${result.sentCount}/${result.recipientCount} email(s) envoyé(s)`}
              {(result.dejaEnvoyes ?? 0) > 0 && ` — ${result.dejaEnvoyes} déjà servi(s) lors d'un passage précédent, non renvoyé(s)`}
              .
            </div>

            {/* Le lot ne tient pas en un passage : on le dit et on propose de
                poursuivre, plutôt que de laisser croire que tout est parti.
                Poursuivre rejoue la MÊME clé de lot, donc reprend exactement
                là où le passage précédent s'est arrêté. */}
            {(result.reste ?? 0) > 0 && (
              <div className="border border-line rounded-md p-3 flex flex-col gap-2">
                <div className="text-[12px] text-ink">
                  {`Il reste ${result.reste} destinataire(s) — l'envoi est découpé pour ne jamais être interrompu en cours de route.`}
                </div>
                <button
                  type="button"
                  onClick={() => envoyer(result.batchId)}
                  disabled={sending}
                  className="self-start text-[12px] font-medium text-seal hover:underline disabled:opacity-50"
                >
                  {sending ? "Envoi…" : `Poursuivre pour les ${result.reste} suivants →`}
                </button>
              </div>
            )}

            {/* Échecs nommés, jamais résumés en « quelques erreurs » : sans le
                nom, impossible de savoir à qui transmettre le document. */}
            {result.emailFailedCount > 0 && (
              <div className="border border-rust/30 rounded-md p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                <div className="text-[12px] text-ink">
                  {`${result.emailFailedCount} email(s) non partis — le document est créé et rattaché au dossier, il reste à le transmettre à la main :`}
                </div>
                {(result.echecs ?? []).map((e, i) => (
                  <div key={i} className="text-[12px] text-ink">
                    <span className="font-medium">{e.nom}</span>
                    <span className="text-slate"> — {e.message}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="self-start text-[12.5px] text-slate hover:text-ink mt-1"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Destinataires ({selected.size}/{recipients.length})</div>
              <div className="border border-line rounded-md p-2 max-h-32 overflow-y-auto flex flex-col gap-1">
                {recipients.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-sage" />
                    {r.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSelected(new Set(recipients.map((r) => r.id)))} className="text-[11.5px] text-slate hover:text-ink underline decoration-line">
                  Tout sélectionner
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-[11.5px] text-slate hover:text-ink underline decoration-line">
                  Tout désélectionner
                </button>
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMode("template")}
                className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 border ${mode === "template" ? "bg-ink text-white border-ink" : "border-line text-slate hover:text-ink"}`}
              >
                Depuis la bibliothèque
              </button>
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 border ${mode === "upload" ? "bg-ink text-white border-ink" : "border-line text-slate hover:text-ink"}`}
              >
                Depuis mon ordinateur
              </button>
            </div>

            {mode === "template" && (
              <div className="flex flex-col gap-1.5">
                <select
                  value={templateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  <option value="">Choisir un modèle…</option>
                  {/* Groupé : une copie adaptée porte le titre de l'original
                      Jalon — voir lib/templatePicker.ts. */}
                  {grouperModeles([...templates, ...panelTemplates]).map((g) => (
                    <optgroup key={g.cle} label={g.label}>
                      {g.entrees.map((e) => (
                        <option key={e.modele.id} value={e.modele.id}>
                          {libelleEntree(e, CATEGORY_LABELS[e.modele.category] ?? e.modele.category)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Same dead end as the single-recipient dialog: the list
                    above only offers what already exists. */}
                <div className="flex items-center gap-1.5 text-[11.5px] text-slate">
                  <span>Le modèle n&apos;existe pas encore ?</span>
                  <LibraryPanel
                    label="Ouvrir la bibliothèque"
                    useLabel="Choisir"
                    onUse={(t) => {
                      setPanelTemplates((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
                      void handlePickTemplate(t.id);
                    }}
                  />
                </div>
              </div>
            )}

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre du document"
              required
              className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
            />

            {mode === "template" ? (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] text-slate uppercase tracking-wide">Contenu du document (PDF envoyé en pièce jointe, identique pour tous)</div>
                <RichTextEditor
                  html={bodyHtml}
                  onChange={setBodyHtml}
                  resetKey={bodyResetKey}
                  placeholder={loadingPreview ? "Chargement…" : "Sélectionnez un modèle pour préremplir le texte, puis adaptez-le si besoin."}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="text-[12px] text-ink" />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi (personnalisé par apprenant)</div>
              <RichTextEditor html={message} onChange={setMessage} placeholder="Votre message…" mergeTags={MERGE_TAGS} />
              <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                type="submit"
                size="sm"
                disabled={sending || !title.trim() || selected.size === 0 || (mode === "template" && !stripHtml(bodyHtml)) || (mode === "upload" && !file)}
              >
                {sending ? "Envoi…" : `Envoyer à ${selected.size} apprenant${selected.size > 1 ? "s" : ""}`}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Annuler
              </Button>
            </div>
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
