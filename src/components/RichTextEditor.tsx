"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Highlighter, Image as ImageIcon, Loader2 } from "lucide-react";
import { MERGE_TAGS } from "@/lib/mergeTags";

const FONT_OPTIONS = [
  { value: "Helvetica, Arial, sans-serif", label: "Sans" },
  { value: "Times New Roman, Georgia, serif", label: "Serif" },
  { value: "Courier New, monospace", label: "Mono" },
];

// contentEditable-based rich text input (bold/italic/underline/highlight/
// font) — deliberately not a library (Tiptap/Slate etc.): the formatting
// vocabulary is small and fixed, and document.execCommand, despite being
// long-deprecated, still does exactly this reliably in every evergreen
// browser. Uncontrolled by design: `html` only gets written into the DOM
// when `resetKey` changes (e.g. the caller loads a different template),
// never on every keystroke — a normal controlled re-render would fight the
// browser's own cursor/selection state on each character typed.
export function RichTextEditor({
  html,
  onChange,
  resetKey,
  placeholder,
  allowImages = false,
  onUploadImage,
  mergeTags,
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
  // Passed by composers sending to a specific learner/contact — see
  // lib/mergeTags.ts. Omit to hide the tag row entirely (e.g. SignatureEditor,
  // which isn't addressed to any one recipient).
  mergeTags?: typeof MERGE_TAGS;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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

  return (
    <div className="border border-line rounded-md overflow-hidden bg-white">
      <div className="flex items-center gap-1 border-b border-line bg-[#F7F5F0] px-2 py-1.5">
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("bold")} title="Gras" className="p-1.5 rounded hover:bg-white text-ink">
          <Bold size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("italic")} title="Italique" className="p-1.5 rounded hover:bg-white text-ink">
          <Italic size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("underline")} title="Souligné" className="p-1.5 rounded hover:bg-white text-ink">
          <Underline size={13} />
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => exec("hiliteColor", "#FFF3A0")} title="Surligner" className="p-1.5 rounded hover:bg-white text-ink">
          <Highlighter size={13} />
        </button>
        <div className="w-px h-4 bg-line mx-1" />
        <select
          defaultValue=""
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
        {allowImages && (
          <>
            <div className="w-px h-4 bg-line mx-1" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              title="Insérer une image (logo)"
              className="p-1.5 rounded hover:bg-white text-ink disabled:opacity-50"
            >
              {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
          </>
        )}
      </div>
      {mergeTags && mergeTags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-line bg-[#F7F5F0] px-2 py-1.5">
          {mergeTags.map((m) => (
            <button
              key={m.tag}
              type="button"
              onMouseDown={preserveSelection}
              onClick={() => insertTag(m.tag)}
              className="text-[11px] bg-white hover:bg-[#EFEDE7] text-ink rounded-full px-2 py-0.5"
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
        className="rich-text-editable px-3 py-2.5 text-[13px] text-ink min-h-[160px] max-h-[360px] overflow-y-auto focus:outline-none"
      />
      {imageError && <div className="px-3 py-1.5 text-[11px] text-rust border-t border-line">{imageError}</div>}
    </div>
  );
}
