"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function DeleteAttachmentButton({ attachmentId }: { attachmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/lms/modules/attachments/${attachmentId}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={handleClick} disabled={loading} title="Retirer ce document" className="text-slate hover:text-rust shrink-0 disabled:opacity-60">
      <X size={13} />
    </button>
  );
}
