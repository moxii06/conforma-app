"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { DialogShell } from "@/components/DialogShell";

export type BulkItem = { id: string; libelle: string; detail?: string };
export type BulkResult = { reussis: number; echecs: { nom: string; message: string }[] };

/**
 * Agir sur plusieurs lignes d'une liste, en les ayant vues.
 *
 * Même doctrine que BulkTaskActionDialog, dont ceci est la généralisation
 * aux actions qui ne partent PAS en email (changer un statut de facture,
 * archiver des prospects) : **on ne valide jamais une action sur quarante
 * lignes sans avoir lu les quarante libellés**, chacun décochable, et le
 * bouton porte le nombre exact.
 *
 * La différence avec l'envoi groupé n'est pas cosmétique : ici rien ne part
 * chez un tiers, donc l'action est rattrapable. C'est pour cela qu'elle se
 * fait en une requête et non destinataire par destinataire — mais la
 * confirmation nominative, elle, reste la même, parce que se tromper de
 * quarante lignes coûte cher même quand c'est réversible.
 *
 * Les cibles proposées viennent de l'ENSEMBLE FILTRÉ, pas de la page
 * affichée : c'est le filtre qu'on vient de poser qui définit le lot, et
 * une action limitée aux trente lignes visibles serait une surprise.
 */
export function BulkListActionDialog({
  declencheur,
  titre,
  avertissement,
  cibles,
  total,
  libelleAction,
  onConfirm,
  ton = "ink",
}: {
  declencheur: string;
  titre: string;
  avertissement: string;
  cibles: BulkItem[];
  /** Le nombre réel dans l'ensemble filtré — `cibles` peut être plafonné. */
  total: number;
  libelleAction: (n: number) => string;
  onConfirm: (ids: string[]) => Promise<BulkResult>;
  ton?: "ink" | "rust";
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(() => new Set(cibles.map((c) => c.id)));
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<BulkResult | null>(null);

  if (cibles.length === 0) return null;

  const retenues = cibles.filter((c) => selection.has(c.id));
  const reste = total - cibles.length;

  function fermer() {
    setOuvert(false);
    setResultat(null);
    setSelection(new Set(cibles.map((c) => c.id)));
  }

  async function confirmer() {
    setEnCours(true);
    try {
      const r = await onConfirm(retenues.map((c) => c.id));
      setResultat(r);
      router.refresh();
    } catch {
      setResultat({ reussis: 0, echecs: [{ nom: "—", message: "Réseau indisponible" }] });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={`text-[12px] font-medium border border-line rounded px-2.5 py-1 hover:bg-pebble whitespace-nowrap ${
          ton === "rust" ? "text-rust" : "text-ink"
        }`}
      >
        {declencheur}
      </button>

      {ouvert && (
        <DialogShell title={titre} onClose={fermer}>
          {resultat ? (
            <div className="flex flex-col gap-3">
              <div className="text-[13px] text-ink">
                {resultat.reussis.toLocaleString("fr-FR")} ligne{resultat.reussis > 1 ? "s" : ""} traitée
                {resultat.reussis > 1 ? "s" : ""}
                {resultat.echecs.length > 0 &&
                  `, ${resultat.echecs.length.toLocaleString("fr-FR")} échec${resultat.echecs.length > 1 ? "s" : ""}`}
                .
              </div>
              {/* Les échecs sont nommés, jamais résumés : sans le nom, on ne
                  sait pas ce qu'il reste à reprendre à la main. */}
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
              <div className="text-[12.5px] text-slate">{avertissement}</div>

              {reste > 0 && (
                <div className="text-[12px] text-ink bg-linen border border-line rounded-md p-2.5">
                  {`${total.toLocaleString("fr-FR")} lignes correspondent à ce filtre. Les ${cibles.length.toLocaleString("fr-FR")} premières sont proposées ici — relancez l'action pour les ${reste.toLocaleString("fr-FR")} suivantes.`}
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelection(new Set(cibles.map((c) => c.id)))}
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
                {cibles.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 border-t border-line first:border-t-0 cursor-pointer hover:bg-linen"
                  >
                    <input
                      type="checkbox"
                      checked={selection.has(c.id)}
                      onChange={() =>
                        setSelection((s) => {
                          const suivant = new Set(s);
                          if (suivant.has(c.id)) suivant.delete(c.id);
                          else suivant.add(c.id);
                          return suivant;
                        })
                      }
                      disabled={enCours}
                      className="h-3.5 w-3.5 accent-seal"
                    />
                    <span className="text-[12.5px] text-ink truncate">{c.libelle}</span>
                    {c.detail && <span className="text-[11.5px] text-slate shrink-0 ml-auto">{c.detail}</span>}
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2.5 border-t border-line pt-3">
                <Button onClick={confirmer} disabled={enCours || retenues.length === 0}>
                  {enCours ? "En cours…" : libelleAction(retenues.length)}
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
