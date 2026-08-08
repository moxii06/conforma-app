"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ContextBanner } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";

/**
 * Le bandeau qui rend le masquage utilisable au lieu de le rendre subi.
 *
 * Des coordonnées qui disparaissent sans explication passent pour un bug,
 * et un bug se contourne : on ressort le carnet d'adresses personnel, et
 * la donnée quitte le registre pour de bon. Le bandeau dit donc trois
 * choses dans l'ordre — ce qui est masqué, POURQUOI, et par où passer :
 *
 *   « Écrire à … »   — on peut toujours joindre l'apprenant, sans jamais
 *                      voir son email ni son téléphone ;
 *   « Demander au DPO » — s'il faut vraiment les coordonnées, la demande
 *                      est tracée dans le registre plutôt que résolue par
 *                      un contournement.
 */
export function RgpdAccesMasqueBanner({
  dossierId,
  prenom,
  lienMessagerie,
  filOuvert,
}: {
  dossierId: string;
  prenom: string;
  /**
   * L'onglet « Échanges apprenant » de cette fiche (LearnerThread), construit
   * par le chantier messagerie. `null` si la personne qui regarde n'a pas le
   * droit de suivre ce fil — l'URL est calculée par la fiche dossier, qui
   * seule connaît cette règle (peutSuivreFilApprenant).
   */
  lienMessagerie: string | null;
  /**
   * Le fil accepte-t-il encore des messages ?
   *
   * COLLISION CONNUE, à trancher côté produit : la messagerie ferme le fil
   * un mois après la fin de la formation (messagerieApprenant.ts,
   * DELAI_FERMETURE_MOIS), c'est-à-dire à l'instant précis où ce masquage
   * commence. Sur une session à date fixe, « Écrire à … » n'a donc jamais
   * de fenêtre. Plutôt que de promettre un bouton mort, le libellé dit la
   * vérité — on lit l'historique — et le recours reste le DPO. Le jour où
   * l'un des deux délais bouge, cette prop redevient utile telle quelle.
   */
  filOuvert: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  async function demanderAuDpo() {
    setEnCours(true);
    const res = await fetch("/api/rgpd/dpo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId }),
    });
    setEnCours(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.error ?? "La demande n'a pas pu être enregistrée.");
      return;
    }
    const b = await res.json();
    // Nommer le destinataire quand il existe : « demande envoyée » sans
    // savoir à qui ne dit pas si quelqu'un va la lire.
    const destinataire = b.assigneA ? `Assignée à ${b.assigneA}.` : "Aucun DPO déclaré : elle attend dans le registre.";
    toast.success(
      b.dejaExistante
        ? `Une demande est déjà en cours pour ${prenom}. ${destinataire}`
        : `Demande enregistrée dans le registre RGPD. ${destinataire}`
    );
    router.refresh();
  }

  return (
    <ContextBanner
      tone="warn"
      action={
        <span className="flex items-center gap-2">
          {lienMessagerie && (
            <Button href={lienMessagerie} variant="secondary" size="sm">
              {filOuvert ? `Écrire à ${prenom}` : `Voir les échanges avec ${prenom}`}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={demanderAuDpo} disabled={enCours}>
            {enCours ? "…" : "Demander au DPO"}
          </Button>
        </span>
      }
    >
      <strong className="font-semibold">
        Ce dossier est clos depuis plus d&apos;un mois — les coordonnées ne sont plus affichées.
      </strong>{" "}
      Le nom, la formation suivie, ses dates et sa réussite restent visibles.
    </ContextBanner>
  );
}
