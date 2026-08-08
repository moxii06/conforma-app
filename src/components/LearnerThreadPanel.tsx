"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Lock } from "lucide-react";
import { Avatar, Button } from "@/components/ui";
import { INTERVALLE_SONDAGE_MS, LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";

type Message = {
  id: string;
  corps: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  deLApprenant: boolean;
};

function heure(iso: string): string {
  const d = new Date(iso);
  const memeJour = d.toDateString() === new Date().toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Le fil d'un dossier — mêmes bulles que la messagerie interne de l'équipe,
 * et c'est délibéré : c'est le même geste (lire, répondre), et un apprenant
 * qui a déjà vu l'un ne doit pas réapprendre l'autre.
 *
 * Le même composant sert les deux camps. Ce qui change d'un côté à l'autre
 * n'est jamais le comportement, seulement l'en-tête et les libellés d'attente
 * — la route, elle, sait déjà qui parle et ne se fie à aucun de ces props.
 *
 * Pas de temps réel : Vercel n'héberge pas de connexion persistante. On
 * interroge, et l'interrogation s'arrête dès que l'onglet passe en
 * arrière-plan — sans ça, un espace apprenant laissé ouvert toute la nuit
 * sonderait le serveur pour personne.
 */
export function LearnerThreadPanel({
  dossierId,
  moiId,
  titre,
  sousTitre,
  initiales,
  cote,
}: {
  dossierId: string;
  moiId: string;
  titre: string;
  sousTitre?: string | null;
  initiales: string;
  cote: "apprenant" | "organisme";
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [ferme, setFerme] = useState(false);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const filRef = useRef<HTMLDivElement>(null);
  // La date du dernier message reçu : le sondage ne redemande que la suite.
  const derniereDate = useRef<string | null>(null);

  const charger = useCallback(
    async (incremental: boolean) => {
      const depuis =
        incremental && derniereDate.current ? `?depuis=${encodeURIComponent(derniereDate.current)}` : "";
      const res = await fetch(`/api/messagerie-apprenant/${dossierId}/messages${depuis}`);
      if (!res.ok) return;
      const body = await res.json();
      setFerme(Boolean(body.ferme));
      setClosesAt(body.closesAt ?? null);
      const recus: Message[] = body.messages ?? [];
      if (recus.length > 0) derniereDate.current = recus[recus.length - 1].createdAt;
      setMessages((prev) => {
        if (!incremental) return recus;
        // Dédoublonnage : le message qu'on vient d'envoyer est déjà affiché,
        // et le sondage suivant le rapporterait une seconde fois.
        const connus = new Set(prev.map((m) => m.id));
        return [...prev, ...recus.filter((m) => !connus.has(m.id))];
      });
      setCharge(true);
    },
    [dossierId],
  );

  // Changer de fil : on repart de zéro, sans borne de date.
  useEffect(() => {
    derniereDate.current = null;
    setMessages([]);
    setCharge(false);
    void charger(false);
  }, [charger]);

  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.hidden) return;
      void charger(true);
    }, INTERVALLE_SONDAGE_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  // Le fil se colle au dernier message, comme n'importe quelle messagerie.
  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight });
  }, [messages]);

  async function envoyer() {
    const corps = brouillon.trim();
    if (!corps) return;
    setEnvoi(true);
    setErreur(null);
    const res = await fetch(`/api/messagerie-apprenant/${dossierId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corps }),
    });
    setEnvoi(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErreur(b.error ?? "Le message n'est pas parti.");
      return;
    }
    // La réponse rapporte l'échéance telle que le serveur vient de la recaler
    // (créer le fil, ou l'envoi suivant, peut la déplacer). L'afficher d'ici
    // évite d'attendre le prochain sondage pour dire la vérité.
    const message: Message & { closesAt: string | null } = await res.json();
    derniereDate.current = message.createdAt;
    setClosesAt(message.closesAt);
    setMessages((prev) => [...prev, message]);
    setBrouillon("");
  }

  return (
    <div className="flex flex-col min-h-[360px] max-h-[60vh]">
      <div className="px-4 py-2.5 border-b border-line flex items-center gap-2.5">
        <Avatar initials={initiales} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">{titre}</div>
          {sousTitre && <div className="text-[11.5px] text-slate truncate">{sousTitre}</div>}
        </div>
      </div>

      <div ref={filRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {!charge && <div className="text-[12px] text-slate">Chargement…</div>}

        {charge && ferme && (
          <div className="text-[12.5px] text-slate leading-relaxed">
            {cote === "apprenant" ? (
              <>
                Les échanges de cette formation sont clos. Ils restaient ouverts un mois après la fin de la
                formation. Pour toute question, écrivez à votre organisme par e-mail.
              </>
            ) : (
              <>
                Fil clos — plus personne n&apos;y écrit. L&apos;historique ci-dessous reste consultable par
                l&apos;organisme ; l&apos;apprenant, lui, n&apos;y a plus accès.
              </>
            )}
          </div>
        )}

        {charge && !ferme && messages.length === 0 && (
          <div className="text-[12.5px] text-slate leading-relaxed">
            {cote === "apprenant" ? (
              <>
                Aucun message pour le moment. Écrivez ci-dessous : votre formateur et l&apos;équipe de
                l&apos;organisme vous répondront ici. Rien n&apos;est envoyé par e-mail, tout reste dans votre
                espace.
              </>
            ) : (
              <>
                Aucun message. Le premier message envoyé ici ouvre le fil ; il apparaîtra dans l&apos;espace de
                l&apos;apprenant, sans e-mail.
              </>
            )}
          </div>
        )}

        {messages.map((m) => {
          const deMoi = m.authorId === moiId;
          return (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${deMoi ? "self-end items-end" : "self-start"}`}>
              {/* Le nom de l'auteur seulement quand ce n'est pas moi : dans mon
                  propre fil, « Moi » à chaque ligne est du bruit.
                  Côté organisme, deux personnes différentes écrivent à gauche —
                  l'apprenant et un collègue — et un nom seul ne dit pas
                  laquelle. La mention lève l'ambiguïté avant de répondre. */}
              {!deMoi && (
                <span className="text-[10.5px] text-slate px-1">
                  {m.authorName}
                  {cote === "organisme" && m.deLApprenant && " · apprenant"}
                </span>
              )}
              <div
                className={`rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
                  deMoi ? "bg-ink text-white" : "bg-mist text-ink border border-line"
                }`}
              >
                {m.corps}
              </div>
              <span className="text-[10px] text-ash px-1 mt-0.5">{heure(m.createdAt)}</span>
            </div>
          );
        })}
      </div>

      {ferme ? (
        <div className="border-t border-line px-3 py-2.5 flex items-center gap-2 text-[11.5px] text-slate">
          <Lock size={13} className="shrink-0" />
          Fil clos — lecture seule.
        </div>
      ) : (
        <div className="border-t border-line p-2.5 flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <textarea
              value={brouillon}
              onChange={(e) => setBrouillon(e.target.value.slice(0, LONGUEUR_MAX_MESSAGE))}
              // Entrée envoie, Maj+Entrée passe à la ligne — la convention de
              // toutes les messageries, et ce que les doigts font déjà.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void envoyer();
                }
              }}
              rows={2}
              placeholder={
                cote === "apprenant"
                  ? "Votre question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
                  : "Votre réponse à l'apprenant… (Entrée pour envoyer)"
              }
              className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
            />
            <Button type="button" size="sm" onClick={envoyer} disabled={envoi || !brouillon.trim()}>
              <Send size={13} />
            </Button>
          </div>
          {erreur && <div className="text-[11.5px] text-rust">{erreur}</div>}
          {/* L'échéance annoncée avant d'écrire, pas découverte le jour où le
              champ disparaît. Absente quand le fil n'a pas de terme (formation
              en continu sans durée d'accès fixée). */}
          {closesAt && (
            <div className="text-[11px] text-ash">
              Ouvert jusqu&apos;au {jour(closesAt)} — un mois après la fin de la formation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
