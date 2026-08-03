"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export function SignatureEditor({ initialSignature }: { initialSignature: string }) {
  const [signature, setSignature] = useState(initialSignature);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/profile/signature", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature }),
    });
    setSaving(false);
    if (res.ok) toast.success("Signature enregistrée.");
    else toast.error("Échec de l'enregistrement de la signature.");
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
        <Button type="button" size="sm" className="self-start" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer la signature"}
        </Button>
      </div>
    </div>
  );
}
