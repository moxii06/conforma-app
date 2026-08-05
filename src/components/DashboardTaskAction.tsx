"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { TASK_ACTIONS } from "@/lib/dashboardTaskActions";

// La table des actions vit dans lib/dashboardTaskActions.ts : l'envoi en
// lot (BulkTaskActionDialog) doit viser exactement les mêmes routes avec
// exactement les mêmes corps de requête, et deux copies auraient divergé au
// premier ajout.

export function DashboardTaskAction({ kind, id, contactName }: { kind: string; id: string; contactName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const action = TASK_ACTIONS[kind];
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
