"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import { formatInvoiceReference } from "@/lib/invoiceNumberFormat";

// Audit P1 : « Les factures doivent être numérotées dans l'ordre
// chronologique, comment cela se passe si le client fait d'autres factures
// via son outil en dehors de la plateforme ? »
//
// L'aperçu en direct fait tout le travail d'explication : plutôt que de
// décrire une règle de composition (« le préfixe est suivi du numéro sur
// 3 chiffres… »), on montre la référence exacte que la prochaine facture
// portera. C'est aussi ce qui rend inutile de normaliser les tirets — si
// l'organisme oublie le séparateur, il le voit.
export function InvoiceNumberingForm({
  initialPrefix,
  initialNextNumber,
  exempleAutomatique,
}: {
  initialPrefix: string | null;
  initialNextNumber: number | null;
  exempleAutomatique: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [configure, setConfigure] = useState(initialPrefix !== null);
  const [prefix, setPrefix] = useState(initialPrefix ?? `FAC-${new Date().getFullYear()}-`);
  const [nextNumber, setNextNumber] = useState(String(initialNextNumber ?? 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = Number.parseInt(nextNumber, 10);
  const numeroValide = Number.isInteger(numero) && numero >= 1;
  const apercu = numeroValide ? formatInvoiceReference(prefix, numero) : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/organization/invoice-numbering", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Préfixe vide = retour à la numérotation automatique, côté API.
      body: JSON.stringify({ prefix: configure ? prefix : "", nextNumber: numeroValide ? numero : 1 }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    toast.success(configure ? "Numérotation enregistrée." : "Retour à la numérotation automatique.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name="numerotation"
          checked={!configure}
          onChange={() => setConfigure(false)}
          className="mt-0.5 accent-seal"
        />
        <span className="text-[12.5px] text-ink">
          Numérotation automatique
          <span className="text-slate"> — Jalon numérote seul, une séquence par année ({exempleAutomatique}).</span>
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name="numerotation"
          checked={configure}
          onChange={() => setConfigure(true)}
          className="mt-0.5 accent-seal"
        />
        <span className="text-[12.5px] text-ink">
          Je reprends ma propre numérotation
          <span className="text-slate">
            {" "}
            — si vous émettez déjà des factures ailleurs, indiquez où vous en êtes pour que la séquence reste continue.
          </span>
        </span>
      </label>

      {configure && (
        <div className="flex flex-col gap-2.5 border border-line rounded-md p-3 bg-mist">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-slate uppercase tracking-wide">Préfixe</span>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="FAC-2026-"
                maxLength={20}
                className="w-full min-w-0 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-slate uppercase tracking-wide">Prochain numéro</span>
              <input
                inputMode="numeric"
                value={nextNumber}
                onChange={(e) => setNextNumber(e.target.value)}
                placeholder="47"
                className="w-full min-w-0 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              />
            </label>
          </div>
          <div className="text-[12px] text-ink">
            Prochaine facture :{" "}
            {apercu ? (
              <span className="font-mono font-medium">{apercu}</span>
            ) : (
              <span className="text-rust">indiquez un numéro à partir de 1</span>
            )}
          </div>
          <div className="text-[11.5px] text-slate">
            Le préfixe est repris tel quel — pensez au séparateur, et à l&apos;année si vous la voulez dedans. Le
            numéro avance tout seul à chaque facture émise ; vous pouvez toujours le corriger ici, et modifier la
            référence d&apos;une facture au cas par cas à sa création.
          </div>
        </div>
      )}

      {error && <div className="text-[11.5px] text-rust">{error}</div>}

      <Button onClick={handleSave} disabled={saving || (configure && !numeroValide)} className="self-start">
        {saving ? "…" : "Enregistrer"}
      </Button>
    </div>
  );
}
