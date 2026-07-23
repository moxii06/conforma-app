"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";

export function SignatureEditor({ initialSignature }: { initialSignature: string }) {
  const [signature, setSignature] = useState(initialSignature);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/profile/signature", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  async function handleUploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/profile/signature-logo", { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Échec de l'envoi de l'image.");
    return body.url as string;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <RichTextEditor
        html={signature}
        onChange={setSignature}
        resetKey="signature-initial"
        placeholder="Cordialement,&#10;Marie Lefèvre — Formations Nova"
        allowImages
        onUploadImage={handleUploadImage}
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
        >
          {saving ? "…" : "Enregistrer la signature"}
        </button>
        {saved && <span className="text-[12px] text-sage">Enregistrée.</span>}
      </div>
    </div>
  );
}
