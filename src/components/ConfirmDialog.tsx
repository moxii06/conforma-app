"use client";

import { Button } from "@/components/ui";

// Strong confirmation for irreversible actions (audit S5) : the dialog
// names exactly what is about to be deleted — "Supprimer Jean Dupuis ?" —
// instead of a native confirm() the user validates on reflex without
// reading. One shared component so the wording, layout and button
// hierarchy can't drift between the delete buttons that use it.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Supprimer définitivement",
  loading = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-card sm:rounded-card border border-line p-5 flex flex-col gap-2.5">
        <div className="text-[14.5px] font-semibold text-ink">{title}</div>
        <p className="text-[12.5px] text-slate leading-relaxed">{description}</p>
        {error && <div className="text-[12px] text-rust">{error}</div>}
        <div className="flex items-center justify-end gap-2.5 mt-1.5">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
