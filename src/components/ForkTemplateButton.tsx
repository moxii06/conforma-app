"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ForkTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/documents/templates/${templateId}/fork`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
    >
      {loading ? "…" : "Adapter ce modèle"}
    </button>
  );
}
