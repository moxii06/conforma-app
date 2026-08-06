"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Highlighter, Image as ImageIcon, List, ListOrdered, Loader2, Braces, Search, X } from "lucide-react";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { grouperBalises } from "@/lib/mergeFieldCatalog";

const FONT_OPTIONS = [
  { value: "Helvetica, Arial, sans-serif", label: "Sans" },
  { value: "Times New Roman, Georgia, serif", label: "Serif" },
  { value: "Courier New, monospace", label: "Mono" },
];

// contentEditable-based rich text input (bold/italic/underline/highlight/
// font/lists) — deliberately not a library (Tiptap/Slate etc.): the
// formatting vocabulary is small and fixed, and document.execCommand,
// despite being long-deprecated, still does exactly this reliably in every
// evergreen browser. Uncontrolled by design: `html` only gets written into
// the DOM when `resetKey` changes (e.g. the caller loads a different
// template), never on every keystroke — a normal controlled re-render would
// fight the browser's own cursor/selection state on each character typed.
//
// `lg` est le mode « document » : pas d'ascenseur interne, la page défile, et
// la barre d'outils SUIT le rédacteur (position: sticky). Retour client :
// « il faut que la barre suive pour qu'il n'ait pas à monter à chaque fois
// pour changer la typographie ou mettre en gras ». Un ascenseur interne
// rendrait cette barre inutile — on ne peut pas coller au haut d'un cadre
// qu'on a soi-même fait défiler.
const SIZE_CLASSES = {
  sm: "min-h-[100px] max-h-[220px] overflow-y-auto",
  md: "min-h-[160px] max-h-[360px] overflow-y-auto",
  lg: "min-h-[420px]",
};

export function RichTextEditor({
  html,
  onChange,
  resetKey,
  placeholder,
  allowImages = false,
  onUploadImage,
  mergeTags,
  mergeFields,
  size = "md",
}: {
  html: string;
  onChange: (html: string) => void;
  resetKey?: string | number;
  placeholder?: string;
  // Only SignatureEditor passes these — the document-body editor (whose
  // output feeds generatePdfFromRichText) never does, since that generator
  // draws text only and would silently drop an inserted image.
  allowImages?: boolean;
  onUploadImage?: (file: File) => Promise<string>;
  // Le petit jeu de balises des emails ([Prénom], [Formation]…) — une
  // poignée, affichées telles quelles. Voir lib/mergeTags.ts.
  mergeTags?: typeof MERGE_TAGS;
  // Les balises {{...}} des documents — 59 clés. Passées ici comme une liste
  // de clés brutes ; c'est l'éditeur qui les nomme et les regroupe, via
  // lib/mergeFieldCatalog.ts. Elles s'affichaient auparavant à plat, par
  // ordre alphabétique, sur toute la hauteur de l'écran.
  mergeFields?: string[];
  // "lg" for content meant to be read at length (a document, an LMS module's
  // own body) — client feedback: the default height was fine for a short
  // email note but too cramped for real content.
  size?: keyof typeof SIZE_CLASSES;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [balisesOuvertes, setBalisesOuvertes] = useState(false);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
    // Only re-sync when resetKey changes, not on every `html` update from
    // our own onChange — see the component-level note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    // Firefox doesn't support hiliteColor — backColor is the fallback there.
    // Chrome/Edge support both but only hiliteColor doesn't fight the text
    // selection color, so try it first.
    if (command === "hiliteColor" && !document.execCommand("hiliteColor", false, arg)) {
      document.execCommand("backColor", false, arg);
    } else {
      document.execCommand(command, false, arg);
    }
    onChange(ref.current?.innerHTML ?? "");
  }

  // Same document.execCommand path as bold/italic/etc — inserts at the
  // current caret position exactly like typing would, so it composes
  // naturally with preserveSelection below (no custom range math needed,
  // unlike the plain <textarea> composers' insertTagAtCursor).
  function insertTag(tag: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, tag);
    onChange(ref.current?.innerHTML ?? "");
  }

  // Toolbar buttons are outside the contentEditable, so a plain click first
  // fires mousedown -> the browser collapses/clears the current text
  // selection before the click handler (and thus exec()) ever runs. By the
  // time execCommand fires there's nothing selected left to highlight/bold.
  // Preventing default on mousedown keeps the selection intact.
  function preserveSelection(e: React.MouseEvent) {
    e.preventDefault();
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUploadImage) return;
    setImageError(null);
    setUploadingImage(true);
    try {
      const url = await onUploadImage(file);
      // Deliberately not routed through exec()/execCommand: the native file
      // picker steals focus away from the contentEditable, so by the time
      // this resolves there's no reliable caret position left — in Chrome,
      // execCommand("insertHTML") in that state can select-and-replace the
      // *entire* existing content instead of inserting at a point (this is
      // exactly what silently wiped a saved signature's text down to just
      // the image). Appending directly to the DOM has no such ambiguity.
      if (ref.current) {
        ref.current.insertAdjacentHTML("beforeend", `<img src="${url}" alt="Logo" style="max-height:48px;vertical-align:middle;">`);
        onChange(ref.current.innerHTML);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Échec de l'envoi de l'image.");
    } finally {
      setUploadingImage(false);
    }
  }

  const outil = "p-1.5 rounded hover:bg-white text-ink disabled:opacity-50";
  const groupes = mergeFields ? grouperBalises(mergeFields, recherche) : [];
  const modeDocument = size === "lg";

  return (
    // Pas d'`overflow-hidden` ici : n'importe quel overflow autre que
    // `visible` sur un ancêtre annule `position: sticky` sur la barre
    // d'outils. Les coins sont donc arrondis sur les enfants.
    <div className="border border-line rounded-md bg-white">
      <div className="sticky top-0 z-20 flex items-center gap-1 flex-wrap border-b border-line bg-mist rounded-t-md px-2 py-1.5">
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("bold")} title="Gras" aria-label="Gras" className={outil}>
          <Bold size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("italic")} title="Italique" aria-label="Italique" className={outil}>
          <Italic size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("underline")} title="Souligné" aria-label="Souligné" className={outil}>
          <Underline size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("hiliteColor", "#FFF3A0")} title="Surligner" aria-label="Surligner" className={outil}>
          <Highlighter size={13} />
        </button>

        <div className="w-px h-4 bg-line mx-1" />

        {/* Les listes. `insertUnorderedList` produit un vrai <ul><li>, que
            splitIntoBlocks sait porter jusqu'au PDF et au .docx — c'est ce
            qui rend le bouton honnête. */}
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("insertUnorderedList")} title="Liste à puces" aria-label="Liste à puces" className={outil}>
          <List size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("insertOrderedList")} title="Liste numérotée" aria-label="Liste numérotée" className={outil}>
          <ListOrdered size={13} />
        </button>

        <div className="w-px h-4 bg-line mx-1" />

        <select
          defaultValue=""
          aria-label="Police"
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
            e.target.value = "";
          }}
          className="text-[11.5px] text-ink bg-white border border-line rounded px-1.5 py-1 outline-none"
        >
          <option value="" disabled>
            Police…
          </option>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {mergeFields && mergeFields.length > 0 && (
          <>
            <div className="w-px h-4 bg-line mx-1" />
            {/* Repliées par défaut : 59 pastilles ouvertes en permanence
                repoussaient le document hors de l'écran. */}
            <button
              type="button"
              onClick={() => setBalisesOuvertes((v) => !v)}
              aria-expanded={balisesOuvertes}
              title="Insérer une information reprise automatiquement"
              className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded px-2 py-1 ${
                balisesOuvertes ? "bg-ink text-white" : "text-ink hover:bg-white"
              }`}
            >
              <Braces size={12} />
              Informations
            </button>
          </>
        )}

        {allowImages && (
          <>
            <div className="w-px h-4 bg-line mx-1" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              title="Insérer une image (logo)"
              aria-label="Insérer une image"
              className={outil}
            >
              {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
          </>
        )}
      </div>

      {/* Le panneau des balises de document, groupées et cherchables. */}
      {mergeFields && balisesOuvertes && (
        <div className="border-b border-line bg-mist px-3 py-2.5 max-h-[280px] overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher une information — « prix », « SIRET », « date »…"
                aria-label="Chercher une information"
                className="w-full bg-white border border-line rounded-md pl-7 pr-2 py-1.5 text-[12px] text-ink outline-none focus:border-seal placeholder:text-ash"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setBalisesOuvertes(false);
                setRecherche("");
              }}
              aria-label="Fermer les informations"
              className="text-slate hover:text-ink shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="text-[11px] text-slate mb-2 leading-snug">
            Cliquez pour insérer un emplacement : il sera remplacé par la vraie valeur au moment de générer le document.
          </div>

          {groupes.length === 0 ? (
            <div className="text-[11.5px] text-slate py-1.5">Aucune information ne correspond à « {recherche.trim()} ».</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {groupes.map((g) => (
                <div key={g.famille.prefixe}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">{g.famille.titre}</div>
                    {g.famille.precision && <div className="text-[10.5px] text-ash">{g.famille.precision}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.balises.map((b) => (
                      <button
                        key={b.cle}
                        type="button"
                        onMouseDown={preserveSelection}
                        onClick={() => insertTag(b.tag)}
                        // La clé technique en infobulle : elle reste la
                        // référence pour qui relit un modèle existant.
                        title={b.tag}
                        className="text-[11px] bg-white border border-line hover:border-seal hover:text-seal-dark text-ink rounded-full px-2 py-0.5"
                      >
                        {b.libelle}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Les balises courtes des emails — une poignée, sans regroupement. */}
      {mergeTags && mergeTags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-line bg-mist px-2 py-1.5">
          {mergeTags.map((m) => (
            <button
              key={m.tag}
              type="button"
              onMouseDown={preserveSelection}
              onClick={() => insertTag(m.tag)}
              className="text-[11px] bg-white hover:bg-linen text-ink rounded-full px-2 py-0.5"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className={`rich-text-editable focus:outline-none ${
          modeDocument
            ? // Le document se rédige tel qu'il se lira : même classe de mise
              // en page que l'aperçu, posée sur une feuille avec ses marges.
              "document-prose mx-auto px-9 py-7"
            : "px-3 py-2.5 text-[13px] text-ink"
        } ${SIZE_CLASSES[size]}`}
      />
      {imageError && <div className="px-3 py-1.5 text-[11px] text-rust border-t border-line">{imageError}</div>}
    </div>
  );
}
