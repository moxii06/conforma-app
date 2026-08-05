"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { DialogShell, Field } from "@/components/DialogShell";
import { useToast } from "@/components/ToastProvider";

/**
 * Date de reprise du « à faire » — l'échappatoire de la migration.
 *
 * Un organisme qui verse son historique dans Jalon n'y a coché aucune
 * case : trois ans de dossiers clos remontent comme du travail en retard.
 * Une date, et la liste redevient celle de son activité réelle.
 *
 * Ce dialogue n'annonce volontairement AUCUN nombre. Une première version
 * en affichait un, calculé sur les tâches déjà rendues — et il était faux :
 * les familles nombreuses sont plafonnées, si bien qu'annoncer « 214 tâches
 * seront masquées » alors que 3 903 dossiers étaient concernés donnait une
 * fausse idée de l'effet. Mieux vaut décrire exactement ce que fait le
 * réglage que d'avancer un chiffre que la liste, elle, ne peut pas
 * connaître.
 */
export function DismissBeforeDialog({ repriseActuelleIso }: { repriseActuelleIso: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(repriseActuelleIso ? repriseActuelleIso.slice(0, 10) : "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const seuil = date ? new Date(date) : null;
  const valide = seuil !== null && !Number.isNaN(seuil.getTime());

  function fermer() {
    setOuvert(false);
    setDate(repriseActuelleIso ? repriseActuelleIso.slice(0, 10) : "");
    setErreur(null);
  }

  async function enregistrer(avant: string | null) {
    setEnCours(true);
    setErreur(null);
    const res = await fetch("/api/dashboard/tasks/dismiss-before", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avant }),
    });
    setEnCours(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErreur(b.error ?? "L'enregistrement a échoué.");
      return;
    }
    toast.success(avant ? "Date de reprise enregistrée." : "Toutes les tâches sont de nouveau affichées.");
    setOuvert(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-[11.5px] text-slate hover:text-ink underline decoration-line whitespace-nowrap"
      >
        {repriseActuelleIso ? "Date de reprise…" : "Ignorer les anciennes…"}
      </button>

      {ouvert && (
        <DialogShell title="Date de reprise du « à faire »" onClose={fermer}>
          <div className="text-[12.5px] text-slate">
            Utile après une reprise d&apos;historique : les dossiers clos depuis longtemps remontent comme du travail
            en retard alors qu&apos;ils ne le sont pas. Rien d&apos;antérieur à cette date n&apos;apparaîtra plus dans
            « à faire », pour toute l&apos;équipe. Les données ne sont pas touchées, et le réglage s&apos;annule à tout
            moment.
          </div>

          <Field label="Ne plus rien afficher d'antérieur au">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
            />
          </Field>

          {erreur && <div className="text-[11.5px] text-rust">{erreur}</div>}

          <div className="flex items-center gap-2.5 border-t border-line pt-3">
            <Button onClick={() => valide && enregistrer(seuil.toISOString())} disabled={enCours || !valide}>
              {enCours ? "…" : "Enregistrer"}
            </Button>
            {repriseActuelleIso && (
              <Button variant="tertiary" onClick={() => enregistrer(null)} disabled={enCours}>
                Tout réafficher
              </Button>
            )}
            <Button variant="tertiary" onClick={fermer} disabled={enCours}>
              Annuler
            </Button>
          </div>
        </DialogShell>
      )}
    </>
  );
}
