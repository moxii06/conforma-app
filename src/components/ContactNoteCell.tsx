"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";

// Note libre du contact, éditable depuis la liste CRM (audit P1 : « un
// commentaire que l'OFP peut ajouter après avoir créé le contact et aussi
// dans le CRM directement »). Clic → textarea en place ; le PATCH passe
// par la même route que la fiche contact, donc une note posée ici et une
// note posée sur la fiche sont le même champ.
export function ContactNoteCell({ contactId, note, canWrite }: { contactId: string; note: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  if (!canWrite) {
    return note ? <span className="text-slate">{note}</span> : <span className="text-slate">—</span>;
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/crm/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: draft.trim() || null }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[180px]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          className="border border-line rounded-md px-2 py-1.5 text-[12px] text-ink outline-none focus:border-seal resize-y"
          placeholder="Note interne sur ce contact…"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving} className="text-[11.5px] font-medium text-seal-dark hover:underline">
            {saving ? "…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(note ?? "");
              setEditing(false);
            }}
            className="text-[11.5px] text-slate hover:text-ink"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={note ? "Modifier la note" : "Ajouter une note"}
      className="text-left group inline-flex items-start gap-1 max-w-[220px]"
    >
      {note ? (
        <span className="text-slate group-hover:text-ink line-clamp-2">{note}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11.5px] text-ash group-hover:text-slate">
          <StickyNote size={11} /> Ajouter une note
        </span>
      )}
    </button>
  );
}
