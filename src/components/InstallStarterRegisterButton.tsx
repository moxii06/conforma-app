"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_REGISTER, STARTER_REGISTER_NOTICE } from "@/lib/rgpdStarterRegister";
import { Button } from "@/components/ui";

// Le registre type, proposé au lieu d'une page blanche. On montre ce qui
// sera créé AVANT de le créer : installer dix traitements d'un clic sans les
// avoir lus produirait un registre que personne dans l'organisme ne connaît,
// ce qui est à peine mieux qu'un registre vide.
export function InstallStarterRegisterButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function installer() {
    setLoading(true);
    setErreur(null);
    const res = await fetch("/api/rgpd/processing-activities/install-starter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeSubProcessors: true }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErreur(body.error ?? "L'installation a échoué.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const aRevoir = STARTER_REGISTER.filter((p) => p.needsReview).length;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="self-start">
        Partir du registre type d&apos;un organisme de formation
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl bg-white border border-line rounded-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-line">
              <div className="text-[14px] font-semibold text-ink">
                {STARTER_REGISTER.length} traitements seront ajoutés à votre registre
              </div>
              <div className="text-[12px] text-slate mt-1 leading-relaxed">{STARTER_REGISTER_NOTICE}</div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
              {STARTER_REGISTER.map((p) => (
                <div key={p.name} className="py-2.5 border-t border-line first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[12.5px] text-ink font-medium">{p.name}</div>
                    {p.needsReview && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E9D8D3] text-rust shrink-0">
                        à revoir
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-slate mt-0.5 leading-relaxed">{p.purpose}</div>
                  {p.reviewNote && <div className="text-[11.5px] text-rust mt-1 leading-relaxed">{p.reviewNote}</div>}
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-line flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11.5px] text-slate">
                {aRevoir > 0 && `${aRevoir} demandent une décision de votre part. `}
                Les traitements déjà présents ne seront pas dupliqués.
              </div>
              <div className="flex items-center gap-2.5">
                {erreur && <span className="text-[12px] text-rust">{erreur}</span>}
                <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="button" onClick={installer} disabled={loading}>
                  {loading ? "Installation…" : "Installer ces traitements"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
