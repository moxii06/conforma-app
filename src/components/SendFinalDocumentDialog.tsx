"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { DialogShell } from "@/components/DialogShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { mentionTroncature } from "@/lib/recipientSearch";

// L'envoi d'un document finalisé.
//
// Les destinataires sont groupés par provenance — la promotion du document
// d'abord, puisque c'est le cas courant, puis le reste. Une liste à plat de
// tous les contacts de l'organisme obligerait à chercher huit noms qu'on
// connaît déjà.
//
// La recherche est SERVEUR et non un filtre sur ce qui est déjà affiché :
// l'écran ne montre qu'une vingtaine de contacts hors promotion, et filtrer
// côté client ne chercherait donc que parmi ceux-là — en laissant croire que
// les autres n'existent pas.

type Recipient = { dossierId: string | null; contactId: string | null; name: string; email: string };
type Groupe = { titre: string; aide?: string | null; membres: Recipient[]; total?: number };

function défautMessage(documentTitle: string): string {
  return `<p>Bonjour,</p><p>Veuillez trouver ci-joint : ${documentTitle}.</p>`;
}

export function SendFinalDocumentDialog({
  documentId,
  documentTitle,
  scopeLabel,
  signatureAvailable,
  signatureHtml,
}: {
  documentId: string;
  documentTitle: string;
  scopeLabel: string;
  signatureAvailable: boolean;
  // La signature de l'expéditeur (réglée sur /profil), résolue côté serveur
  // et transmise telle quelle — jamais reconstruite depuis des données
  // client. Même contrainte que SignatureCheckbox : voir son commentaire.
  signatureHtml: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  // Une Map et non un Set de clés : la recherche change ce qui est AFFICHÉ,
  // et une sélection déduite de l'affichage perdrait en silence les
  // destinataires cochés avant la recherche. On garde donc la personne
  // entière, pas seulement sa clé.
  const [choisis, setChoisis] = useState<Map<string, Recipient>>(new Map());
  const [message, setMessage] = useState(() => défautMessage(documentTitle));
  const [includeSignature, setIncludeSignature] = useState(true);
  const [signature, setSignature] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [rattache, setRattache] = useState(true);
  const [chargement, setChargement] = useState(false);
  // Le premier chargement pré-coche la promotion ; les suivants (une
  // recherche) ne doivent PAS y toucher, sinon taper trois lettres
  // effacerait une sélection en cours de constitution.
  const [premierChargementFait, setPremierChargementFait] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    // Antirebond : on ne lance pas une requête par frappe.
    const minuteur = setTimeout(() => {
      void (async () => {
        setChargement(true);
        const url = `/api/documents/${documentId}/recipients${recherche.trim() ? `?q=${encodeURIComponent(recherche.trim())}` : ""}`;
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        setChargement(false);
        if (!res.ok) {
          setErreur(body.error ?? "Impossible de charger les destinataires.");
          return;
        }
        setGroupes(body.groups ?? []);
        setRattache(body.rattacheAUneFormation !== false);
        if (!premierChargementFait) {
          // Les inscrits de la session sont pré-cochés : c'est ce que
          // l'organisme veut neuf fois sur dix, et décocher est plus rapide
          // que cocher huit cases.
          setChoisis(new Map((body.groups?.[0]?.membres ?? []).map((m: Recipient) => [cléDe(m), m])));
          setPremierChargementFait(true);
        }
      })();
    }, recherche ? 250 : 0);
    return () => clearTimeout(minuteur);
  }, [ouvert, documentId, recherche, premierChargementFait]);

  function basculer(r: Recipient) {
    setChoisis((p) => {
      const n = new Map(p);
      const k = cléDe(r);
      if (n.has(k)) n.delete(k);
      else n.set(k, r);
      return n;
    });
  }

  // `visibles` = ce que la recherche en cours affiche ; `sélection` = ce à
  // quoi on enverra, y compris les personnes cochées avant une recherche et
  // désormais hors écran. Les confondre reviendrait à envoyer à moins de
  // monde qu'annoncé.
  const visibles = groupes.flatMap((g) => g.membres);
  const sélection = [...choisis.values()];
  const toutCoché = visibles.length > 0 && visibles.every((r) => choisis.has(cléDe(r)));

  function basculerTout() {
    // « Tout sélectionner » porte sur ce qui est AFFICHÉ, jamais sur ce
    // qu'on n'a pas vu : cocher 4 000 personnes derrière une recherche
    // serait un envoi de masse que personne n'a relu.
    setChoisis((p) => {
      const n = new Map(p);
      if (toutCoché) visibles.forEach((r) => n.delete(cléDe(r)));
      else visibles.forEach((r) => n.set(cléDe(r), r));
      return n;
    });
  }

  const horsÉcran = sélection.filter((r) => !visibles.some((v) => cléDe(v) === cléDe(r))).length;

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    const corpsMessage = includeSignature ? message + signatureHtml : message;
    const res = await fetch(`/api/documents/${documentId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: sélection, message: corpsMessage || undefined, requestSignature: signature }),
    });
    const body = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setErreur(body.error ?? "Échec de l'envoi.");
      return;
    }
    if (body.failures?.length > 0) {
      setErreur(
        `${body.created} document${body.created > 1 ? "s" : ""} produit${body.created > 1 ? "s" : ""}, mais ${
          body.failures.length
        } envoi${body.failures.length > 1 ? "s ont" : " a"} échoué : ${body.failures.map((f: { name: string }) => f.name).join(", ")}.`,
      );
      return;
    }
    setOuvert(false);
    router.push("/documents?tab=sent");
    router.refresh();
  }

  const btn = "text-[13px] font-medium rounded-md inline-flex items-center justify-center min-h-[40px] px-4 disabled:opacity-50";

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={`${btn} bg-seal text-white hover:bg-seal-dark min-h-[44px] px-5`}>
        Envoyer
      </button>
    );
  }

  return (
    <DialogShell
      title="Envoyer le document"
      subtitle={`${documentTitle} · ${scopeLabel}`}
      onClose={() => setOuvert(false)}
      maxWidth="max-w-3xl"
      // Plan de travail en deux colonnes : le corps pose sa propre grille.
      dense
    >

        <div className="p-5 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold">Destinataires</div>
              {visibles.length > 0 && (
                <button
                  type="button"
                  onClick={basculerTout}
                  title="Porte sur les personnes affichées ci-dessous"
                  className="text-[11px] text-ink underline decoration-line hover:decoration-ink shrink-0"
                >
                  {toutCoché ? "Tout désélectionner" : "Tout sélectionner"}
                </button>
              )}
            </div>

            {/* La recherche. Elle interroge le serveur : l'écran ne montre
                qu'une vingtaine de contacts hors promotion, filtrer sur
                l'affiché ne chercherait donc que parmi ceux-là. */}
            <div className="relative mb-2.5">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un nom ou un email…"
                aria-label="Chercher un destinataire"
                className="w-full bg-white border border-line rounded-md pl-7 pr-7 py-1.5 text-[12px] text-ink outline-none focus:border-seal placeholder:text-ash"
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche("")}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Ce qui est coché mais sorti de l'écran doit se dire : sans
                cela, « Envoyer à 12 destinataires » alors que 3 noms sont
                visibles ressemble à un bug. */}
            {horsÉcran > 0 && (
              <div className="text-[11px] text-slate bg-linen border border-line rounded-md px-2.5 py-1.5 mb-2.5">
                {horsÉcran} destinataire{horsÉcran > 1 ? "s" : ""} déjà sélectionné{horsÉcran > 1 ? "s" : ""} hors de cette recherche
                {" — "}
                {horsÉcran > 1 ? "ils restent" : "il reste"}{" "}dans l&apos;envoi.
              </div>
            )}

            {groupes.length === 0 && <div className="text-[12.5px] text-slate">Chargement…</div>}
            {groupes.map((g) => (
              <div key={g.titre} className="mb-3.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-[11.5px] font-semibold text-ink">{g.titre}</div>
                  {g.aide && <div className="text-[10.5px] text-slate">{g.aide}</div>}
                </div>
                {g.membres.length === 0 && (
                  <div className="text-[11.5px] text-slate mt-0.5">{messageGroupeVide(g.titre, recherche, rattache)}</div>
                )}
                {g.membres.map((m) => (
                  <label key={cléDe(m)} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={choisis.has(cléDe(m))}
                      onChange={() => basculer(m)}
                      className="w-4 h-4 accent-ink"
                    />
                    <span className="min-w-0">
                      <span className="text-[12.5px] text-ink block truncate">{m.name}</span>
                      <span className="text-[11px] text-slate block truncate">{m.email || "adresse manquante"}</span>
                    </span>
                  </label>
                ))}
                {/* Le plafond s'annonce, avec le vrai total. Un « 20 »
                    silencieux sur 4 025 laisse croire que les autres
                    n'existent pas. */}
                {(() => {
                  const mention = mentionTroncature(g.membres.length, g.total ?? g.membres.length, recherche);
                  return mention ? <div className="text-[11px] text-slate mt-1">{mention}</div> : null;
                })()}
              </div>
            ))}
            {chargement && groupes.length > 0 && <div className="text-[11px] text-slate">Recherche…</div>}
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-2.5">Message d&apos;accompagnement</div>
            <RichTextEditor html={message} onChange={setMessage} placeholder="Votre message…" mergeTags={MERGE_TAGS} />
            <div className="mt-2">
              <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
            </div>

            {/* La case reste TOUJOURS à l'écran, grisée quand la signature
                n'est pas configurée — comme dans les deux autres dialogues
                d'envoi (prospect, sous-traitant). La masquer laissait croire
                que Jalon ne sait pas faire signer, alors qu'il manque une
                clé : une possibilité absente ne se remarque pas, une
                possibilité grisée dit ce qu'il faut faire. */}
            <label
              className={`flex items-start gap-2.5 mt-3 ${signatureAvailable ? "cursor-pointer" : "opacity-50"}`}
            >
              <input
                type="checkbox"
                checked={signature}
                disabled={!signatureAvailable}
                onChange={(e) => setSignature(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-sage"
              />
              <span>
                <span className="text-[12.5px] text-ink block">Demander une signature électronique</span>
                <span className="text-[11px] text-slate block">
                  {signatureAvailable
                    ? `${sélection.length} signature${sélection.length > 1 ? "s" : ""} décomptée${sélection.length > 1 ? "s" : ""} de votre forfait.`
                    : "Nécessite une clé API Yousign — à configurer sur la page Intégrations."}
                </span>
              </span>
            </label>

            <div className="border-t border-line mt-3 pt-2.5 text-[12px] text-slate">
              <div>
                <span className="text-ink font-medium">{sélection.length}</span> destinataire{sélection.length > 1 ? "s" : ""} sélectionné
                {sélection.length > 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Erreur sous la rangée de boutons, jamais dedans : un message long
            (des noms de destinataires, souvent) ne doit jamais décaler
            "Envoyer" — client feedback après qu'un prénom/nom trop long a
            fait sauter le bouton d'un envoi à l'autre. */}
        <div className="px-5 py-3 border-t border-line flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setOuvert(false)} className={`${btn} text-slate hover:text-ink px-3`}>
              Annuler
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={envoyer}
              disabled={envoi || sélection.length === 0}
              className={`${btn} bg-seal text-white hover:bg-seal-dark min-h-[44px] px-5`}
            >
              {envoi ? "Envoi…" : `Envoyer à ${sélection.length} destinataire${sélection.length > 1 ? "s" : ""}`}
            </button>
          </div>
          {erreur && <div className="text-[12px] text-rust text-right">{erreur}</div>}
        </div>
    </DialogShell>
  );
}

/** Une clé stable même quand le destinataire n'a pas de dossier. */
function cléDe(r: Recipient): string {
  return r.dossierId ?? `c:${r.contactId}`;
}

/**
 * Pourquoi ce groupe est vide.
 *
 * « Aucun. » sous « Apprenants de cette session » laissait croire à un
 * défaut sur un contrat de formateur, qui n'a par nature aucune promotion.
 * Dire la raison coûte une phrase et évite une question au support.
 */
function messageGroupeVide(titre: string, recherche: string, rattacheAUneFormation: boolean): string {
  if (recherche.trim().length >= 2) return "Aucun résultat pour cette recherche.";
  if (titre.startsWith("Apprenants") && !rattacheAUneFormation) {
    return "Ce document n'est rattaché à aucune formation — il n'a donc pas de promotion.";
  }
  if (titre.startsWith("Autres sessions") && !rattacheAUneFormation) return "";
  return "Aucun.";
}
