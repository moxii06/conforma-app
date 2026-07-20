"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkContractSignedButton({ outreachId }: { outreachId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/client-outreach/${outreachId}`, { method: "PATCH" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={handleClick} disabled={loading} className="text-[11.5px] font-medium text-sage underline decoration-line hover:decoration-sage disabled:opacity-60">
      {loading ? "…" : "Marquer signé"}
    </button>
  );
}
