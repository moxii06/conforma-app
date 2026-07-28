"use client";

import { useState } from "react";
import { Milestone, Upload, X } from "lucide-react";

const DEFAULT_COLOR = "#C9A15A"; // matches the app's own --seal fallback swatch

export function OrganizationBrandingForm({
  initial,
}: {
  initial: { logoUrl: string | null; brandColor: string | null; publicContactEmail?: string | null; publicContactPhone?: string | null };
}) {
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [color, setColor] = useState(initial.brandColor ?? "");
  const [publicContactEmail, setPublicContactEmail] = useState(initial.publicContactEmail ?? "");
  const [publicContactPhone, setPublicContactPhone] = useState(initial.publicContactPhone ?? "");
  const [uploading, setUploading] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/organization/logo", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(data.error ?? "Échec de l'envoi du logo.");
      return;
    }
    setLogoUrl(data.logoUrl);
  }

  async function handleRemoveLogo() {
    setUploading(true);
    setError(null);
    const res = await fetch("/api/organization/logo", { method: "DELETE" });
    setUploading(false);
    if (!res.ok) {
      setError("Échec de la suppression du logo.");
      return;
    }
    setLogoUrl(null);
  }

  async function handleSaveColor() {
    setSavingColor(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/organization/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandColor: color, publicContactEmail, publicContactPhone }),
    });
    setSavingColor(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: logoUrl ? "transparent" : color || undefined }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${color ? "" : "bg-seal"}`}>
              <Milestone size={22} className="text-ink" strokeWidth={2.4} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink hover:border-ink-soft cursor-pointer">
              <Upload size={13} />
              {uploading ? "Envoi…" : "Importer un logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={uploading}
                className="inline-flex items-center gap-1 text-[11.5px] text-slate hover:text-rust"
              >
                <X size={12} /> Retirer
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate">PNG, JPEG, GIF, WebP ou SVG — 2 Mo maximum.</div>
        </div>
      </div>

      <label className="flex flex-col gap-1 max-w-xs">
        <span className="text-[11px] text-slate uppercase tracking-wide">Couleur de marque</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color || DEFAULT_COLOR}
            onChange={(e) => {
              setColor(e.target.value);
              setSaved(false);
            }}
            className="w-8 h-8 rounded border border-line cursor-pointer bg-white p-0.5"
          />
          <input
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setSaved(false);
            }}
            placeholder="#C9A15A"
            className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </div>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-slate uppercase tracking-wide">Contact public (affiché sur les fiches formation publiques)</span>
        <div className="flex gap-2">
          <input
            type="email"
            value={publicContactEmail}
            onChange={(e) => { setPublicContactEmail(e.target.value); setSaved(false); }}
            placeholder="contact@votre-organisme.fr"
            className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
          <input
            value={publicContactPhone}
            onChange={(e) => { setPublicContactPhone(e.target.value); setSaved(false); }}
            placeholder="01 23 45 67 89"
            className="w-40 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleSaveColor}
          disabled={savingColor}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
        >
          {savingColor ? "…" : "Enregistrer"}
        </button>
        {saved && <span className="text-[12px] text-sage">Enregistrée.</span>}
        {error && <span className="text-[12px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
