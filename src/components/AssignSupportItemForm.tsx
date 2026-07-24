"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

type Member = { id: string; name: string };

export function AssignSupportItemForm({
  kind,
  itemId,
  members,
  initial,
}: {
  kind: "complaints" | "secure-reports";
  itemId: string;
  members: Member[];
  initial: { assignedToUserId: string | null; assigneeComment: string | null; assigneeDeadline: Date | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState(initial.assignedToUserId ?? "");
  const [comment, setComment] = useState(initial.assigneeComment ?? "");
  const [deadline, setDeadline] = useState(initial.assigneeDeadline ? format(initial.assigneeDeadline, "yyyy-MM-dd") : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/${kind}/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedToUserId: assignedToUserId || null,
        assigneeComment: comment || null,
        assigneeDeadline: deadline || null,
      }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
        {initial.assignedToUserId ? "Modifier l'assignation" : "Assigner"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 bg-[#EFEDE7] border border-line rounded-md p-2.5">
      <div className="flex items-center gap-1.5">
        <select value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink flex-1">
          <option value="">Non assigné</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (contexte, prochaine étape…)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={handleSave} disabled={saving} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11.5px] text-slate hover:text-ink">Annuler</button>
      </div>
    </div>
  );
}
