"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Converts a flat template into a conditional one, non-destructively: the
// current bodyText becomes the first, always-included paragraph, so nothing
// is lost — from then on the template renders via TemplateBlocksEditor
// instead (presence of blocks is the only signal, see its own comment).
export function ActivateBlocksButton({ templateId, bodyText }: { templateId: string; bodyText: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/documents/templates/${templateId}/blocks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ bodyText, conditions: null }] }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className="text-[11.5px] text-slate hover:text-ink underline decoration-line disabled:opacity-60">
      {loading ? "…" : "Passer en paragraphes conditionnels"}
    </button>
  );
}
