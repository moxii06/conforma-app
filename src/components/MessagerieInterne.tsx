"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui";
import { DialogShell, Field } from "@/components/DialogShell";
import { INTERVALLE_SONDAGE_MS, LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";

type Conversation = {
  id: string;
  titre: string;
  estGroupe: boolean;
  membres: { userId: string; name: string }[];
  nonLus: number;
  lastMessageAt: string;
  apercu: string | null;
  apercuDeMoi: boolean;
};

type Message = {
  id: string;
  corps: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

type Membre = { id: string; name: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  ADMIN_OF: "Administrateur",
  ADMIN_MANAGER: "Gestionnaire",
  SALES: "Commercial",
  TRAINER: "Formateur",
};

function heure(iso: string): string {
  const d = new Date(iso);
  const aujourdhui = new Date();
  const memeJour = d.toDateString() === aujourdhui.toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// La messagerie interne de l'équipe.
//
// Deux volets, comme la boîte mail juste à côté : la liste à gauche, le fil à
// droite. Ce n'est pas un hasard — c'est le même geste (choisir une
// conversation, la lire, y répondre) et il n'y avait aucune raison de le
// dessiner autrement.
//
// Le rafraîchissement se fait par interrogation régulière, pas par websocket :
// Vercel n'héberge pas de connexion persistante. Il s'arrête quand l'onglet
// passe en arrière-plan — sans ça, dix onglets oubliés interrogeraient le
// serveur toute la nuit pour personne.
export function MessagerieInterne({ moi }: { moi: { id: string; name: string } }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [brouillon, setBrouillon] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelleOuverte, setNouvelleOuverte] = useState(false);

  const filRef = useRef<HTMLDivElement>(null);
  // La date du dernier message reçu : le sondage ne redemande que la suite.
  const derniereDate = useRef<string | null>(null);

  const chargerConversations = useCallback(async () => {
    const res = await fetch("/api/messagerie/conversations");
    if (!res.ok) return;
    const body = await res.json();
    setConversations(body.conversations ?? []);
  }, []);

  const chargerMessages = useCallback(async (conversationId: string, incremental: boolean) => {
    const depuis = incremental && derniereDate.current ? `?depuis=${encodeURIComponent(derniereDate.current)}` : "";
    const res = await fetch(`/api/messagerie/conversations/${conversationId}/messages${depuis}`);
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
  }, []);

  // Ouvrir une conversation : on repart de zéro, sans borne de date.
  useEffect(() => {
    if (!choisie) return;
    derniereDate.current = null;
    setMessages([]);
    void chargerMessages(choisie, false).then(() => void chargerConversations());
  }, [choisie, chargerMessages, chargerConversations]);

  useEffect(() => {
    void chargerConversations();
  }, [chargerConversations]);

  // Le sondage. `document.hidden` le suspend quand l'onglet n'est pas regardé.
  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.hidden) return;
      void chargerConversations();
      if (choisie) void chargerMessages(choisie, true);
    }, INTERVALLE_SONDAGE_MS);
    return () => clearInterval(minuteur);
  }, [choisie, chargerConversations, chargerMessages]);

  // Le fil se colle au dernier message, comme n'importe quelle messagerie.
  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight });
  }, [messages]);

  async function envoyer() {
    const corps = brouillon.trim();
    if (!corps || !choisie) return;
    setEnvoi(true);
    setErreur(null);
    const res = await fetch(`/api/messagerie/conversations/${choisie}/messages`, {
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
    void chargerConversations();
  }

  const conversationChoisie = conversations?.find((c) => c.id === choisie) ?? null;

  return (
    <div className="border border-line rounded-card bg-white overflow-hidden grid" style={{ gridTemplateColumns: "260px 1fr" }}>
      {/* Volet gauche : mes conversations */}
      <div className="border-r border-line flex flex-col min-h-[520px] max-h-[70vh]">
        <div className="px-3 py-2.5 border-b border-line flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate font-semibold">Conversations</span>
          <button
            type="button"
            onClick={() => setNouvelleOuverte(true)}
            className="text-slate hover:text-ink"
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations === null && <div className="px-3 py-3 text-[12px] text-slate">Chargement…</div>}
          {conversations?.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-slate leading-relaxed">
              Aucune conversation. Le <span className="text-ink">+</span> ci-dessus en ouvre une avec un membre de
              l&apos;équipe.
            </div>
          )}
          {conversations?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChoisie(c.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-line last:border-b-0 flex flex-col gap-0.5 ${
                c.id === choisie ? "bg-linen" : "hover:bg-mist"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {c.estGroupe && <Users size={12} className="text-slate shrink-0" />}
                <span className={`text-[12.5px] min-w-0 truncate ${c.nonLus > 0 ? "text-ink font-semibold" : "text-ink"}`}>
                  {c.titre}
                </span>
                <div className="flex-1" />
                {c.nonLus > 0 && (
                  <span className="shrink-0 text-[10.5px] font-semibold text-white bg-seal rounded-full px-1.5 min-w-[18px] text-center">
                    {c.nonLus > 99 ? "99+" : c.nonLus}
                  </span>
                )}
              </div>
              {c.apercu && (
                <span className="text-[11.5px] text-slate truncate">
                  {c.apercuDeMoi && "Vous : "}
                  {c.apercu}
                </span>
              )}
              <span className="text-[10.5px] text-ash">{heure(c.lastMessageAt)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Volet droit : le fil */}
      <div className="flex flex-col min-h-[520px] max-h-[70vh]">
        {!conversationChoisie ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-[12.5px] text-slate text-center leading-relaxed max-w-sm">
              Choisissez une conversation à gauche.
              <br />
              Ces échanges restent dans l&apos;organisme : aucun e-mail n&apos;est envoyé, et rien n&apos;apparaît dans
              la boîte mail des clients.
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-line">
              <div className="text-[13px] font-semibold text-ink">{conversationChoisie.titre}</div>
              {conversationChoisie.estGroupe && (
                <div className="text-[11.5px] text-slate">
                  {conversationChoisie.membres.map((m) => m.name).join(", ")}
                </div>
              )}
            </div>

            <div ref={filRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
              {messages.length === 0 && (
                <div className="text-[12px] text-slate">Aucun message — écrivez le premier ci-dessous.</div>
              )}
              {messages.map((m) => {
                const deMoi = m.authorId === moi.id;
                return (
                  <div key={m.id} className={`flex flex-col max-w-[80%] ${deMoi ? "self-end items-end" : "self-start"}`}>
                    {/* Le nom de l'auteur seulement quand ce n'est pas moi :
                        dans mon propre fil, « Moi » à chaque ligne est du bruit. */}
                    {!deMoi && <span className="text-[10.5px] text-slate px-1">{m.authorName}</span>}
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
                  // Entrée envoie, Maj+Entrée passe à la ligne — la convention
                  // de toutes les messageries, et ce que les doigts font déjà.
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void envoyer();
                    }
                  }}
                  rows={2}
                  placeholder="Votre message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
                  className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
                />
                <Button type="button" size="sm" onClick={envoyer} disabled={envoi || !brouillon.trim()}>
                  <Send size={13} />
                </Button>
              </div>
              {erreur && <div className="text-[11.5px] text-rust">{erreur}</div>}
            </div>
          </>
        )}
      </div>

      {nouvelleOuverte && (
        <NouvelleConversation
          onFerme={() => setNouvelleOuverte(false)}
          onCreee={(id) => {
            setNouvelleOuverte(false);
            void chargerConversations();
            setChoisie(id);
          }}
        />
      )}
    </div>
  );
}

function NouvelleConversation({ onFerme, onCreee }: { onFerme: () => void; onCreee: (id: string) => void }) {
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [titre, setTitre] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/messagerie/membres");
      const body = await res.json().catch(() => ({ membres: [] }));
      setMembres(body.membres ?? []);
    })();
  }, []);

  async function creer() {
    if (choisis.length === 0) {
      setErreur("Choisissez au moins une personne.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    const res = await fetch("/api/messagerie/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membreIds: choisis, titre: titre.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setEnCours(false);
    if (!res.ok) {
      setErreur(body.error ?? "La conversation n'a pas pu être ouverte.");
      return;
    }
    onCreee(body.id);
  }

  const groupe = choisis.length > 1;

  return (
    <DialogShell title="Nouvelle conversation" onClose={onFerme}>
      {membres === null && <div className="text-[12px] text-slate">Chargement de l&apos;équipe…</div>}
      {membres?.length === 0 && (
        <div className="text-[12.5px] text-slate leading-relaxed">
          Vous êtes seul dans cet organisme pour le moment. Invitez un membre depuis Équipe &amp; rôles, il apparaîtra
          ici.
        </div>
      )}

      {membres && membres.length > 0 && (
        <>
          <div className="border border-line rounded-md max-h-56 overflow-y-auto">
            {membres.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line last:border-b-0 hover:bg-mist cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={choisis.includes(m.id)}
                  onChange={(e) =>
                    setChoisis((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)))
                  }
                />
                <span className="text-[12.5px] text-ink flex-1 min-w-0 truncate">{m.name}</span>
                <span className="text-[11px] text-slate shrink-0">{ROLE_LABELS[m.role] ?? m.role}</span>
              </label>
            ))}
          </div>

          {/* Le titre n'a de sens qu'à plusieurs : un tête-à-tête porte le nom
              de l'autre, qui dépend de qui regarde. */}
          {groupe && (
            <Field label="Nom du groupe" hint="facultatif">
              <input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Rentrée de septembre"
                className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
              />
            </Field>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={creer} disabled={enCours}>
              {enCours ? "…" : groupe ? "Créer le groupe" : "Ouvrir la conversation"}
            </Button>
            <span className="text-[11.5px] text-slate">
              {choisis.length === 0
                ? "Personne sélectionnée"
                : `${choisis.length} personne${choisis.length > 1 ? "s" : ""}`}
            </span>
          </div>
          {erreur && <div className="text-[11.5px] text-rust">{erreur}</div>}
        </>
      )}
    </DialogShell>
  );
}
