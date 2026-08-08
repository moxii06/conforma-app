"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Avatar, Button } from "@/components/ui";
import { INTERVALLE_SONDAGE_MS, LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";

type Message = {
  id: string;
  corps: string;
  emetteur: string;
  auteurNom: string;
  createdAt: string;
};

function heure(iso: string): string {
  const d = new Date(iso);
  const memeJour = d.toDateString() === new Date().toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Le fil éditeur ↔ organisme, servi tel quel aux deux bouts.
 *
 * Mêmes bulles que la messagerie interne de l'équipe : c'est le même geste, et
 * un admin d'OF qui a appris l'une ne doit pas réapprendre l'autre. Ce qui
 * change ici, c'est qu'il n'y a rien à lister à gauche — un organisme n'a
 * qu'un seul interlocuteur éditeur, et l'éditeur arrive déjà depuis la fiche
 * de l'organisme dont il veut parler. Un volet gauche à un seul élément aurait
 * été de la symétrie décorative.
 *
 * Le camp est passé en prop pour savoir de quel côté afficher les bulles ; la
 * route, elle, ne s'y fie pas — elle redécide qui parle à partir de son propre
 * contrôle d'accès.
 */
export function PlateformeMessagerie({
  endpoint,
  moiCamp,
  titre,
  sousTitre,
  initiales,
  placeholder,
  vide,
}: {
  endpoint: string;
  moiCamp: "platform" | "organization";
  titre: string;
  sousTitre?: string;
  initiales: string;
  placeholder: string;
  vide: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [charge, setCharge] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const filRef = useRef<HTMLDivElement>(null);
  const derniereDate = useRef<string | null>(null);

  const charger = useCallback(
    async (incremental: boolean) => {
      const depuis =
        incremental && derniereDate.current ? `?depuis=${encodeURIComponent(derniereDate.current)}` : "";
      const res = await fetch(`${endpoint}${depuis}`);
      if (!res.ok) return;
      const body = await res.json();
      const recus: Message[] = body.messages ?? [];
      if (recus.length > 0) derniereDate.current = recus[recus.length - 1].createdAt;
      setMessages((prev) => {
        if (!incremental) return recus;
        // Dédoublonnage : le message qu'on vient d'envoyer est déjà affiché, et
        // le sondage suivant le rapporterait une seconde fois.
        const connus = new Set(prev.map((m) => m.id));
        return [...prev, ...recus.filter((m) => !connus.has(m.id))];
      });
      setCharge(true);
    },
    [endpoint],
  );

  useEffect(() => {
    derniereDate.current = null;
    setMessages([]);
    setCharge(false);
    void charger(false);
  }, [charger]);

  // Pas de temps réel : Vercel n'héberge pas de connexion persistante. On
  // interroge, et seulement quand l'écran est réellement regardé.
  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.hidden) return;
      void charger(true);
    }, INTERVALLE_SONDAGE_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight });
  }, [messages]);

  async function envoyer() {
    const corps = brouillon.trim();
    if (!corps) return;
    setEnvoi(true);
    setErreur(null);
    const res = await fetch(endpoint, {
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
    const message: Message = await res.json();
    derniereDate.current = message.createdAt;
    setMessages((prev) => [...prev, message]);
    setBrouillon("");
  }

  return (
    <div className="border border-line rounded-card bg-white overflow-hidden flex flex-col min-h-[320px] max-h-[60vh]">
      <div className="px-4 py-2.5 border-b border-line flex items-center gap-2.5">
        <Avatar initials={initiales} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">{titre}</div>
          {sousTitre && <div className="text-[11.5px] text-slate truncate">{sousTitre}</div>}
        </div>
      </div>

      <div ref={filRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {!charge && <div className="text-[12px] text-slate">Chargement…</div>}
        {charge && messages.length === 0 && (
          <div className="text-[12.5px] text-slate leading-relaxed">{vide}</div>
        )}
        {messages.map((m) => {
          const deMoi = m.emetteur === moiCamp;
          return (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${deMoi ? "self-end items-end" : "self-start"}`}>
              {/* Le nom de l'auteur seulement quand ce n'est pas moi : dans mon
                  propre fil, se voir signer chaque ligne est du bruit. */}
              {!deMoi && <span className="text-[10.5px] text-slate px-1">{m.auteurNom}</span>}
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
            placeholder={placeholder}
            className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
          />
          <Button type="button" size="sm" onClick={envoyer} disabled={envoi || !brouillon.trim()}>
            <Send size={13} />
          </Button>
        </div>
        {erreur && <div className="text-[11.5px] text-rust">{erreur}</div>}
      </div>
    </div>
  );
}
