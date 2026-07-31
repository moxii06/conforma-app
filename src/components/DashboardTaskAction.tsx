"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Les tâches du tableau de bord n'avaient qu'une destination : la ligne
// entière était un lien vers la fiche du dossier, où il fallait retrouver le
// bon bouton. Pour les cas les plus fréquents — envoyer une convocation, une
// convention, les accès, un questionnaire de satisfaction — l'action tient
// pourtant en un appel, et la tâche disparaît d'elle-même au rafraîchissement
// puisqu'elle est recalculée depuis l'état du dossier.
//
// Ne figurent ici que les tâches dont l'`id` EST un dossierId et pour
// lesquelles une route existe déjà. Rien n'est inventé côté serveur.
type ActionDef = { label: string; endpoint: (id: string) => string; body?: unknown; confirmer: (nom: string) => string };

const ACTIONS: Record<string, ActionDef> = {
  convocation: {
    label: "Envoyer la convocation",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "convocation" },
    confirmer: (nom) => `Envoyer la convocation à ${nom} maintenant ?`,
  },
  dossier_prep_contract: {
    label: "Envoyer la convention",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "contract" },
    confirmer: (nom) => `Générer et envoyer la convention à ${nom} maintenant ?`,
  },
  platform_access_after_payment: {
    label: "Envoyer les accès",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "platform_access" },
    confirmer: (nom) => `Envoyer ses accès à la plateforme à ${nom} maintenant ?`,
  },
  satisfaction_not_collected: {
    label: "Envoyer l'évaluation",
    endpoint: (id) => `/api/dossiers/${id}/satisfaction-surveys/cold/send`,
    confirmer: (nom) => `Envoyer le questionnaire de satisfaction à ${nom} maintenant ?`,
  },
};

export function DashboardTaskAction({ kind, id, contactName }: { kind: string; id: string; contactName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const action = ACTIONS[kind];
  if (!action) return null;

  async function handleClick(e: React.MouseEvent) {
    // La ligne entière est un lien vers la fiche : sans ça, cliquer le bouton
    // enverrait l'email ET quitterait la page.
    e.preventDefault();
    e.stopPropagation();
    // Un email part vers un vrai destinataire, et rien ne le rattrape. Dans
    // une liste dense où la ligne elle-même est cliquable, un envoi sur
    // fausse manœuvre est trop facile — on nomme la personne et on demande.
    if (!window.confirm(action.confirmer(contactName))) return;
    setLoading(true);
    setErreur(null);
    const res = await fetch(action.endpoint(id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action.body ?? {}),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErreur(body.error ?? "L'envoi a échoué.");
      return;
    }
    setEnvoye(true);
    router.refresh();
  }

  // Toutes les tâches ne disparaissent pas après l'envoi, et c'est correct :
  // « Convention non signée » attend une SIGNATURE, pas un envoi — la ligne
  // reste, et renvoyer plus tard est une relance légitime. Mais sans retour
  // visible on croirait le bouton cassé et on cliquerait deux fois. D'où cet
  // état, qui survit au rafraîchissement (la ligne garde sa clé) et disparaît
  // avec la ligne quand la tâche, elle, est bien close.
  if (envoye) return <span className="text-[11.5px] text-sage font-medium whitespace-nowrap">Envoyé ✓</span>;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="text-[11.5px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-pebble disabled:opacity-60 whitespace-nowrap"
      >
        {loading ? "Envoi…" : action.label}
      </button>
      {erreur && <span className="text-[11px] text-rust">{erreur}</span>}
    </>
  );
}
