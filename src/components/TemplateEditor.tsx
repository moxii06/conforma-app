"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

export function TemplateEditor({ templateId, title, bodyText }: { templateId: string; title: string; bodyText: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(bodyText);
  const [savedValue, setSavedValue] = useState(bodyText);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = value !== savedValue;

  // Un modèle est souvent long à réécrire — fermer l'onglet par réflexe
  // après une modification non enregistrée perdrait tout le texte sans
  // avertissement (audit S6, finding E3).
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/documents/templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyText: value }),
    });
    setSaving(false);
    setSavedValue(value);
    toast.success("Modèle enregistré.");
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/documents/templates/${templateId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        className="border border-line rounded-md px-3 py-2 text-[12.5px] text-ink outline-none focus:border-seal font-mono leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
        <button onClick={handleDelete} disabled={deleting} className="text-[12px] text-rust hover:underline disabled:opacity-60">
          {deleting ? "…" : "Supprimer"}
        </button>
      </div>
    </div>
  );
}
