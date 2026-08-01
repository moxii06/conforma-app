"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// L'envoi d'un document finalisé.
//
// Les destinataires sont groupés par provenance — les inscrits à la
// formation d'abord, puisque c'est le cas courant, puis le reste. Une liste
// à plat de tous les contacts de l'organisme obligerait à chercher huit
// noms qu'on connaît déjà.

type Recipient = { dossierId: string | null; contactId: string | null; name: string; email: string };
type Groupe = { titre: string; membres: Recipient[] };

export function SendFinalDocumentDialog({
  documentId,
  documentTitle,
  scopeLabel,
  signatureAvailable,
}: {
  documentId: string;
  documentTitle: string;
  scopeLabel: string;
  signatureAvailable: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    void (async () => {
      const res = await fetch(`/api/documents/${documentId}/recipients`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(body.error ?? "Impossible de charger les destinataires.");
        return;
      }
      setGroupes(body.groups ?? []);
      // Les inscrits à la formation sont pré-cochés : c'est ce que
      // l'organisme veut neuf fois sur dix, et décocher est plus rapide
      // que cocher huit cases.
      setChoisis(new Set((body.groups?.[0]?.membres ?? []).map((m: Recipient) => cléDe(m))));
    })();
  }, [ouvert, documentId]);

  function basculer(r: Recipient) {
    setChoisis((p) => {
      const n = new Set(p);
      const k = cléDe(r);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const tous = groupes.flatMap((g) => g.membres);
  const sélection = tous.filter((r) => choisis.has(cléDe(r)));

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    const res = await fetch(`/api/documents/${documentId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: sélection, message: message || undefined, requestSignature: signature }),
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
    <div className="fixed inset-0 bg-ink/55 z-50 flex items-center justify-center p-5" onClick={(e) => e.target === e.currentTarget && setOuvert(false)}>
      <div className="bg-paper rounded-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="px-5 py-4 border-b border-line">
          <div className="font-display text-[17px] text-ink">Envoyer le document</div>
          <div className="text-[12.5px] text-slate mt-0.5">
            {documentTitle} · {scopeLabel}
          </div>
        </div>

        <div className="p-5 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-2.5">Destinataires</div>
            {groupes.length === 0 && <div className="text-[12.5px] text-slate">Chargement…</div>}
            {groupes.map((g) => (
              <div key={g.titre} className="mb-3.5">
                <div className="text-[11.5px] font-semibold text-ink mb-1">{g.titre}</div>
                {g.membres.length === 0 && <div className="text-[11.5px] text-slate">Aucun.</div>}
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
              </div>
            ))}
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-2.5">Message d&apos;accompagnement</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Laissez vide pour le message par défaut."
              className="w-full border border-line rounded-md px-2.5 py-2 text-[12.5px] text-ink outline-none focus:border-seal"
              style={{ minHeight: 130 }}
            />

            {signatureAvailable && (
              <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                <input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} className="w-4 h-4 mt-0.5 accent-sage" />
                <span>
                  <span className="text-[12.5px] text-ink block">Demander une signature électronique</span>
                  <span className="text-[11px] text-slate block">
                    {sélection.length} signature{sélection.length > 1 ? "s" : ""} décomptée{sélection.length > 1 ? "s" : ""} de votre forfait.
                  </span>
                </span>
              </label>
            )}

            <div className="border-t border-line mt-3 pt-2.5 text-[12px] text-slate">
              <div>
                <span className="text-ink font-medium">{sélection.length}</span> destinataire{sélection.length > 1 ? "s" : ""} sélectionné
                {sélection.length > 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center gap-2.5 flex-wrap">
          <button type="button" onClick={() => setOuvert(false)} className={`${btn} text-slate hover:text-ink px-3`}>
            Annuler
          </button>
          <div className="flex-1" />
          {erreur && <div className="text-[12px] text-rust max-w-md">{erreur}</div>}
          <button
            type="button"
            onClick={envoyer}
            disabled={envoi || sélection.length === 0}
            className={`${btn} bg-seal text-white hover:bg-seal-dark min-h-[44px] px-5`}
          >
            {envoi ? "Envoi…" : `Envoyer à ${sélection.length} destinataire${sélection.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Une clé stable même quand le destinataire n'a pas de dossier. */
function cléDe(r: Recipient): string {
  return r.dossierId ?? `c:${r.contactId}`;
}
