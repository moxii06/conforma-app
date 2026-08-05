"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { DialogShell } from "@/components/DialogShell";
import { TASK_ACTIONS, MAX_ENVOIS_PAR_LOT, CONCURRENCE_LOT } from "@/lib/dashboardTaskActions";

export type BulkTarget = { id: string; contactName: string };

type Resultat = { envoyes: number; echecs: { nom: string; message: string }[] };

/**
 * Envoi groupé depuis le tableau de bord.
 *
 * Le principe directeur : **on ne clique jamais « envoyer à 47 personnes »
 * sans avoir vu les 47 noms**. Chaque ligne est décochable, le bouton
 * porte le nombre exact, et rien ne part avant.
 *
 * C'est la même famille de risque que les relances automatiques : un email
 * parti ne se rattrape pas. La différence est qu'ici c'est un humain qui
 * déclenche — raison de plus pour qu'il voie ce qu'il déclenche.
 *
 * Les envois rejouent les MÊMES routes que le bouton individuel, une par
 * destinataire (voir dashboardTaskActions.ts pour le pourquoi). Concurrence
 * bornée : ni en série, ce qui serait interminable, ni tout d'un coup, ce
 * qui noierait le fournisseur d'emails.
 */
export function BulkTaskActionDialog({
  kind,
  libelle,
  cibles,
}: {
  kind: string;
  /** Libellé pluriel de la famille, pour les phrases du dialogue. */
  libelle: string;
  cibles: BulkTarget[];
}) {
  const router = useRouter();
  const action = TASK_ACTIONS[kind];
  const [ouvert, setOuvert] = useState(false);
  // Le lot est plafonné, et ce sont les plus anciens qui sont proposés —
  // ils arrivent déjà triés par urgence.
  const proposees = cibles.slice(0, MAX_ENVOIS_PAR_LOT);
  const [selection, setSelection] = useState<Set<string>>(() => new Set(proposees.map((c) => c.id)));
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(0);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  if (!action) return null;

  const retenues = proposees.filter((c) => selection.has(c.id));
  const reste = cibles.length - proposees.length;

  function basculer(id: string) {
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  function fermer() {
    setOuvert(false);
    setResultat(null);
    setProgression(0);
    setSelection(new Set(proposees.map((c) => c.id)));
  }

  async function envoyer() {
    setEnCours(true);
    setProgression(0);
    const echecs: Resultat["echecs"] = [];
    let envoyes = 0;

    // File partagée + N ouvriers : la concurrence reste bornée quel que
    // soit le nombre de destinataires.
    const file = [...retenues];
    async function ouvrier() {
      for (;;) {
        const cible = file.shift();
        if (!cible) return;
        try {
          const res = await fetch(action.endpoint(cible.id), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.body ?? {}),
          });
          if (res.ok) envoyes++;
          else {
            const b = await res.json().catch(() => ({}));
            echecs.push({ nom: cible.contactName, message: b.error ?? `Erreur ${res.status}` });
          }
        } catch {
          echecs.push({ nom: cible.contactName, message: "Réseau indisponible" });
        }
        setProgression((p) => p + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCE_LOT, retenues.length) }, ouvrier));

    setEnCours(false);
    setResultat({ envoyes, echecs });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-[12px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-pebble whitespace-nowrap shrink-0"
      >
        {action.labelLot}
      </button>

      {ouvert && (
        <DialogShell title={action.labelLot} onClose={fermer}>
          {resultat ? (
            <div className="flex flex-col gap-3">
              <div className="text-[13px] text-ink">
                {resultat.envoyes.toLocaleString("fr-FR")} envoi{resultat.envoyes > 1 ? "s" : ""} réussi
                {resultat.envoyes > 1 ? "s" : ""}
                {resultat.echecs.length > 0 && `, ${resultat.echecs.length} échec${resultat.echecs.length > 1 ? "s" : ""}`}
                .
              </div>
              {/* Les échecs sont nommés, jamais résumés en « quelques erreurs » :
                  sans le nom, impossible de savoir qui relancer à la main. */}
              {resultat.echecs.length > 0 && (
                <div className="border border-rust/30 rounded-md p-3 max-h-48 overflow-y-auto flex flex-col gap-1">
                  {resultat.echecs.map((e, i) => (
                    <div key={i} className="text-[12px] text-ink">
                      <span className="font-medium">{e.nom}</span>
                      <span className="text-slate"> — {e.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={fermer} className="self-start">
                Fermer
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-[12.5px] text-slate">
                Un email part vers chaque personne cochée, et rien ne le rattrape. Décochez celles que vous ne voulez
                pas {action.actionLot}.
              </div>

              {reste > 0 && (
                // Phrase construite en une chaîne : à force d'expressions et
                // de retours à la ligne, JSX avalait l'espace entre le nombre
                // et le mot suivant (« Les 50plus anciennes »).
                <div className="text-[12px] text-ink bg-linen border border-line rounded-md p-2.5">
                  {`${cibles.length.toLocaleString("fr-FR")} ${libelle} au total. Les ${proposees.length.toLocaleString("fr-FR")} plus anciennes sont proposées ici — relancez l'envoi pour les ${reste.toLocaleString("fr-FR")} suivantes.`}
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelection(new Set(proposees.map((c) => c.id)))}
                  className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={() => setSelection(new Set())}
                  className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink"
                >
                  Tout décocher
                </button>
              </div>

              <div className="border border-line rounded-md max-h-64 overflow-y-auto">
                {proposees.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 border-t border-line first:border-t-0 cursor-pointer hover:bg-linen"
                  >
                    <input
                      type="checkbox"
                      checked={selection.has(c.id)}
                      onChange={() => basculer(c.id)}
                      disabled={enCours}
                      className="h-3.5 w-3.5 accent-seal"
                    />
                    <span className="text-[12.5px] text-ink">{c.contactName}</span>
                  </label>
                ))}
              </div>

              {enCours && (
                <div className="text-[12px] text-slate">
                  Envoi en cours — {progression.toLocaleString("fr-FR")} sur {retenues.length.toLocaleString("fr-FR")}…
                </div>
              )}

              <div className="flex items-center gap-2.5 border-t border-line pt-3">
                <Button onClick={envoyer} disabled={enCours || retenues.length === 0}>
                  {enCours
                    ? "Envoi…"
                    : `Envoyer à ${retenues.length.toLocaleString("fr-FR")} personne${retenues.length > 1 ? "s" : ""}`}
                </Button>
                <Button variant="tertiary" onClick={fermer} disabled={enCours}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </DialogShell>
      )}
    </>
  );
}
