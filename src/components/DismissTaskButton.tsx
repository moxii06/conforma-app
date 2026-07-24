"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function DismissTaskButton({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    await fetch("/api/dashboard/tasks/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDismiss}
      disabled={loading}
      title="Ignorer — ne réapparaîtra plus dans À faire"
      className="text-slate hover:text-rust disabled:opacity-60 shrink-0"
    >
      <X size={13} />
    </button>
  );
}
