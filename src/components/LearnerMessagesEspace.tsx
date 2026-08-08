"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { initialsOf } from "@/components/ui";
import { LearnerThreadPanel } from "@/components/LearnerThreadPanel";
import { INTERVALLE_SONDAGE_MS } from "@/lib/messagerie";

type Fil = {
  dossierId: string;
  titre: string;
  formateur: string | null;
  dateSession: string | null;
  ferme: boolean;
  nonLus: number;
  lastMessageAt: string | null;
};

function heure(iso: string): string {
  const d = new Date(iso);
  const memeJour = d.toDateString() === new Date().toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// Qui est en face, et de quelle session on parle. La date compte : deux
// inscriptions à la même formation ne se distinguent que par elle, et le titre
// seul laisserait l'apprenant écrire dans le mauvais fil.
function sousTitreDe(f: Fil): string {
  const parties = [f.formateur ? `Votre formateur : ${f.formateur}` : "Votre organisme de formation"];
  if (f.dateSession) {
    parties.push(`session du ${new Date(f.dateSession).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);
  }
  return parties.join(" · ");
}

/**
 * « Mes échanges » — l'espace de l'apprenant pour écrire aux formateurs de sa
 * session et à l'équipe.
 *
 * Deux volets, comme la messagerie interne de l'équipe : la liste à gauche, le
 * fil à droite. Ici la liste n'est pas une liste de conversations mais de
 * FORMATIONS — un fil par dossier, c'est la règle du modèle (LearnerThread
 * porte un dossierId unique). Quelqu'un inscrit à trois formations a trois
 * interlocuteurs différents et ne doit pas avoir à deviner à qui il écrit.
 *
 * La liste se rafraîchit au même rythme que le fil, et pour la même raison :
 * un message reçu sur une AUTRE formation que celle affichée doit se voir.
 * L'interrogation s'arrête quand l'onglet passe en arrière-plan.
 */
export function LearnerMessagesEspace({ moiId }: { moiId: string }) {
  const [fils, setFils] = useState<Fil[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/messagerie-apprenant/fils");
    if (!res.ok) return;
    const body = await res.json();
    const recus: Fil[] = body.fils ?? [];
    setFils(recus);
    // Ouvrir d'office la première formation : avec une seule inscription — le
    // cas courant — un écran qui demande de choisir dans une liste d'un
    // élément est un clic pour rien.
    setChoisi((prev) => prev ?? recus[0]?.dossierId ?? null);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.hidden) return;
      void charger();
    }, INTERVALLE_SONDAGE_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  const filChoisi = fils?.find((f) => f.dossierId === choisi) ?? null;

  if (fils !== null && fils.length === 0) {
    return (
      <div className="border border-line rounded-card bg-white px-5 py-6 text-[12.5px] text-slate leading-relaxed">
        Vous n&apos;êtes inscrit à aucune formation pour le moment. Dès qu&apos;une formation vous sera ouverte, vous
        pourrez écrire ici à votre formateur.
      </div>
    );
  }

  return (
    <div
      className="border border-line rounded-card bg-white overflow-hidden grid"
      style={{ gridTemplateColumns: "260px 1fr" }}
    >
      {/* Volet gauche : mes formations */}
      <div className="border-r border-line flex flex-col min-h-[360px] max-h-[60vh]">
        <div className="px-3 py-2.5 border-b border-line">
          <span className="text-[11px] uppercase tracking-wide text-slate font-semibold">Mes formations</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {fils === null && <div className="px-3 py-3 text-[12px] text-slate">Chargement…</div>}
          {fils?.map((f) => (
            <button
              key={f.dossierId}
              type="button"
              onClick={() => setChoisi(f.dossierId)}
              className={`w-full text-left px-3 py-2.5 border-b border-line last:border-b-0 flex flex-col gap-0.5 ${
                f.dossierId === choisi ? "bg-linen" : "hover:bg-mist"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {f.ferme && <Lock size={11} className="text-ash shrink-0" />}
                <span
                  className={`text-[12.5px] min-w-0 truncate ${f.nonLus > 0 ? "text-ink font-semibold" : "text-ink"}`}
                >
                  {f.titre}
                </span>
                <div className="flex-1" />
                {f.nonLus > 0 && (
                  <span className="shrink-0 text-[10.5px] font-semibold text-white bg-seal rounded-full px-1.5 min-w-[18px] text-center">
                    {f.nonLus > 99 ? "99+" : f.nonLus}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate truncate">
                {f.ferme ? "Échanges clos" : (f.formateur ?? "Équipe de l'organisme")}
              </span>
              {/* Rien tant que personne n'a écrit : une date de création de
                  dossier affichée ici se lirait comme un dernier message. */}
              {f.lastMessageAt && <span className="text-[10.5px] text-ash">{heure(f.lastMessageAt)}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Volet droit : le fil */}
      {filChoisi ? (
        <LearnerThreadPanel
          // La clé force un remontage au changement de formation : le fil
          // affiché ne doit jamais garder une ligne de la précédente.
          key={filChoisi.dossierId}
          dossierId={filChoisi.dossierId}
          moiId={moiId}
          titre={filChoisi.titre}
          sousTitre={sousTitreDe(filChoisi)}
          initiales={initialsOf(filChoisi.formateur ?? filChoisi.titre)}
          cote="apprenant"
        />
      ) : (
        <div className="flex items-center justify-center px-6 min-h-[360px]">
          <div className="text-[12.5px] text-slate text-center leading-relaxed max-w-sm">
            Choisissez une formation à gauche pour écrire à votre formateur.
          </div>
        </div>
      )}
    </div>
  );
}
