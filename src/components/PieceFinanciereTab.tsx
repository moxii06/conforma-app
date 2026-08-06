"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { InvoiceLinesEditor, toDraftLines, LIGNE_VIDE, type EditableLine } from "@/components/InvoiceLinesEditor";
import { linesTotalCents, formatEuros } from "@/lib/invoiceLines";
import {
  PIECES,
  echeanceParDefaut,
  titrePiece,
  type PieceFinanciere,
  type PieceKind,
} from "@/lib/pieceFinanciere";

// L'onglet « Devis » et l'onglet « Facture » du composeur — un seul écran.
//
// Retour client, mot pour mot : « quand je clique sur Devis, cela doit
// m'ouvrir l'éditeur ; je remplis, je valide, cela referme avec
// modifier/supprimer à côté, et je continue mon message. » L'éditeur est donc
// l'état d'arrivée, pas une liste suivie d'un lien : émettre la pièce est le
// geste attendu ici, en réutiliser une est le cas particulier.
//
// Ce qui distingue les deux pièces est dans lib/pieceFinanciere.ts et nulle
// part ailleurs. Écrire l'écran deux fois aurait été plus court aujourd'hui et
// aurait divergé demain — c'est déjà arrivé assez de fois dans ce code.
export function PieceFinanciereTab({
  kind,
  contactId,
  peutCreer,
  pieceAttachee,
  onAttacher,
  onDetacher,
  onErreur,
}: {
  kind: PieceKind;
  contactId: string;
  /**
   * Émettre une pièce engage un prix au nom de l'organisme : c'est réservé aux
   * rôles qui ont la Facturation. Le Commercial ne l'a pas aujourd'hui — il
   * peut joindre une pièce existante, pas en créer une.
   */
  peutCreer: boolean;
  pieceAttachee: PieceFinanciere | null;
  onAttacher: (piece: PieceFinanciere, titre: string, categorie: string) => void;
  onDetacher: () => void;
  onErreur: (message: string | null) => void;
}) {
  const mots = PIECES[kind];
  const [liste, setListe] = useState<PieceFinanciere[] | null>(null);
  const [editeur, setEditeur] = useState(false);
  const [listeVisible, setListeVisible] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [reference, setReference] = useState("");
  const [montant, setMontant] = useState("");
  const [designation, setDesignation] = useState("");
  const [echeance, setEcheance] = useState(() => echeanceParDefaut(new Date()));
  // Le détail ligne à ligne, replié tant qu'on n'en demande pas.
  const [lignes, setLignes] = useState<EditableLine[]>([]);

  // Dès qu'il y a un détail, le montant EST sa somme — le champ passe en
  // lecture seule au lieu de rester une seconde saisie à faire concorder.
  // La Facturation laisse les deux libres et affiche l'écart ; ici, dans un
  // coin de composeur, la seule bonne valeur est celle qu'on peut calculer.
  const lignesRemplies = toDraftLines(lignes);
  const montantPilotéParLesLignes = lignesRemplies.length > 0;
  const centsSaisis = Math.round(Number(montant.replace(",", ".")) * 100);
  const centsFinal = montantPilotéParLesLignes ? linesTotalCents(lignesRemplies) : centsSaisis;

  // À l'ouverture : l'éditeur si on a le droit d'émettre, la liste sinon. Le
  // chargement est ici et pas côté serveur parce que la liste du CRM affiche
  // des dizaines de prospects — précharger les pièces de chacun ferait payer à
  // tous ce dont un seul a besoin.
  useEffect(() => {
    if (!pieceAttachee) {
      setEditeur(peutCreer);
      setListeVisible(!peutCreer);
    }
    let annule = false;
    void (async () => {
      const res = await fetch(mots.listeUrl(contactId));
      if (annule) return;
      const body = await res.json().catch(() => null);
      const rows: PieceFinanciere[] = body?.quotes ?? body?.invoices ?? [];
      setListe(rows);
    })();
    return () => {
      annule = true;
    };
    // Une seule fois par montage : le composant est démonté au changement
    // d'onglet, donc « au montage » est bien « à l'ouverture de l'onglet ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choisir(p: PieceFinanciere) {
    setEditeur(false);
    setListeVisible(false);
    onErreur(null);
    // Le titre du document envoyé porte la référence : c'est sous ce nom que
    // le client le recevra et qu'on le retrouvera.
    onAttacher(p, titrePiece(kind, p.reference), mots.categorie);
  }

  function ouvrirEnModification() {
    if (!pieceAttachee) return;
    setReference(pieceAttachee.reference);
    setMontant(String(pieceAttachee.amountCents / 100));
    setDesignation(pieceAttachee.description ?? "");
    if (pieceAttachee.dueDate) setEcheance(pieceAttachee.dueDate.slice(0, 10));
    // Le détail existant est rechargé dans l'éditeur avant toute réécriture —
    // sans ça, enregistrer une simple correction de libellé effacerait la
    // grille de prestations sans que personne le voie.
    setLignes(
      (pieceAttachee.lines ?? []).map((l) => ({
        designation: l.designation,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPriceCents / 100),
        unit: l.unit ?? "",
      })),
    );
    setEditeur(true);
  }

  function detacher() {
    onDetacher();
    setEditeur(true);
  }

  async function supprimerOuRetirer() {
    if (!pieceAttachee) return;
    // Une pièce déjà partie ne se supprime pas — la route le refuse aussi,
    // mais l'écran ne doit pas proposer un geste voué à échouer. Une facture
    // ne se supprime jamais, brouillon compris : voir `supprimable`.
    if (!mots.supprimable || pieceAttachee.status !== "DRAFT") {
      detacher();
      return;
    }
    setEnCours(true);
    const res = await fetch(mots.detailUrl(pieceAttachee.id), { method: "DELETE" });
    setEnCours(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      onErreur(b.error ?? `Impossible de supprimer ${mots.ceCette}.`);
      return;
    }
    setListe((prev) => (prev ?? []).filter((p) => p.id !== pieceAttachee.id));
    detacher();
  }

  // Création sur place : trois champs (quatre pour une facture), la même route
  // que la Facturation.
  //
  // Délibérément court. L'éditeur de lignes détaillées reste en Facturation :
  // ici on est en train d'écrire un e-mail à un client, et demander une grille
  // de prestations au milieu d'un message ferait perdre le fil.
  async function enregistrer() {
    const cents = centsFinal;
    if (!reference.trim() || !Number.isFinite(cents) || cents <= 0) {
      onErreur(
        montantPilotéParLesLignes
          ? "Complétez le détail : chaque ligne a besoin d'une désignation et d'un prix."
          : "Référence et montant sont requis.",
      );
      return;
    }
    setEnCours(true);
    onErreur(null);
    // Le même bouton crée ou corrige, selon qu'une pièce est déjà posée.
    // « Modifier » rouvre cet éditeur pré-rempli : d'ici, les deux gestes sont
    // le même — poser la pièce qu'on va envoyer.
    const enModification = Boolean(pieceAttachee);
    const commun = {
      reference: reference.trim(),
      amountCents: cents,
      ...(mots.champEcheance ? { dueDate: echeance } : {}),
      // Envoyé même vide en modification : c'est ainsi qu'on retire un détail
      // devenu faux. À la création, un tableau vide n'a rien à dire.
      ...(montantPilotéParLesLignes || enModification ? { lines: lignesRemplies } : {}),
    };
    const res = enModification
      ? await fetch(mots.detailUrl(pieceAttachee!.id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...commun, description: designation.trim() || null }),
        })
      : await fetch(mots.creationUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...commun, contactId, description: designation.trim() || undefined }),
        });
    const body = await res.json().catch(() => ({}));
    setEnCours(false);
    if (!res.ok) {
      onErreur(
        body.error ??
          (enModification ? `Impossible de modifier ${mots.ceCette}.` : `Impossible de créer ${mots.ceCette}.`),
      );
      return;
    }
    const piece: PieceFinanciere = {
      id: body.id,
      reference: body.reference,
      amountCents: body.amountCents,
      status: body.status,
      createdAt: body.createdAt,
      description: body.description ?? null,
      dueDate: body.dueDate ?? null,
      // Les routes de création/correction ne renvoient pas le détail ; on tient
      // celui qu'on vient d'écrire, et c'est lui qui fait foi.
      lines: lignesRemplies,
    };
    setListe((prev) =>
      enModification ? (prev ?? []).map((p) => (p.id === piece.id ? piece : p)) : [piece, ...(prev ?? [])],
    );
    choisir(piece);
    setReference("");
    setMontant("");
    setDesignation("");
    setLignes([]);
  }

  const enEuros = (cents: number) =>
    (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const autres = (liste ?? []).filter((p) => p.id !== pieceAttachee?.id);

  return (
    <div className="flex flex-col gap-2">
      {/* Une pièce posée : l'éditeur s'efface au profit d'une ligne de résumé,
          pour rendre la place au message. C'est le cheminement demandé —
          remplir, valider, continuer à écrire — et non une liste qu'il
          faudrait re-parcourir. */}
      {pieceAttachee && !editeur && (
        <div className="border border-line rounded-md px-2.5 py-2 bg-white flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] text-ink font-medium min-w-0 truncate">
            {titrePiece(kind, pieceAttachee.reference)}
          </span>
          <span className="text-[12.5px] text-slate tabular-nums">{enEuros(pieceAttachee.amountCents)}</span>
          <div className="flex-1" />
          {/* Relire avant d'envoyer : c'est la pièce telle que le client la
              recevra, pas un aperçu approché. */}
          <a
            href={mots.apercuUrl(pieceAttachee.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-ink"
          >
            Voir {mots.leLa}
          </a>
          {peutCreer && pieceAttachee.status === "DRAFT" && (
            <button
              type="button"
              onClick={ouvrirEnModification}
              className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-ink"
            >
              Modifier
            </button>
          )}
          {/* « Supprimer » n'apparaît que là où il est vrai : un devis
              brouillon. Une facture, ou une pièce déjà partie, se retire du
              message — elle continue d'exister, et c'est voulu. */}
          <button
            type="button"
            onClick={supprimerOuRetirer}
            disabled={enCours}
            className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-rust"
          >
            {mots.supprimable && pieceAttachee.status === "DRAFT" ? "Supprimer" : "Retirer"}
          </button>
        </div>
      )}

      {!peutCreer && !pieceAttachee && (
        <p className="text-[11.5px] text-slate leading-relaxed">
          Vous pouvez joindre {mots.leLa} déjà émis{kind === "invoice" ? "e" : ""}. {mots.Singulier === "Devis" ? "En établir un" : "En établir une"}{" "}
          relève de la Facturation, à laquelle votre rôle n&apos;a pas accès — demandez-le à un administrateur de
          l&apos;organisme.
        </p>
      )}

      {editeur && peutCreer && (
        <div className="border border-line rounded-md p-2.5 bg-mist flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">Référence</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={kind === "quote" ? "DEV-2026-001" : "FAC-2026-001"}
                className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">
                {montantPilotéParLesLignes ? "Montant € (somme du détail)" : "Montant €"}
              </span>
              <input
                value={montantPilotéParLesLignes ? formatEuros(centsFinal) : montant}
                onChange={(e) => setMontant(e.target.value)}
                readOnly={montantPilotéParLesLignes}
                inputMode="decimal"
                placeholder="1500"
                className={`border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal ${
                  montantPilotéParLesLignes ? "bg-pebble text-slate tabular-nums" : "bg-white"
                }`}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Désignation</span>
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="Intitulé de la prestation, tel qu'il figurera sur le document"
              className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
            />
          </label>
          {/* L'échéance n'existe que sur une facture — c'est une mention
              obligatoire (art. L441-9 du code de commerce), pas un confort. */}
          {mots.champEcheance && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">Échéance de paiement</span>
              <input
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
                className="self-start border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
              />
            </label>
          )}
          {/* Plusieurs prestations sur une même pièce : le détail s'ouvre ici,
              plutôt que d'obliger à repasser par la Facturation au milieu d'un
              message. Il reste replié tant qu'on ne le demande pas — la
              plupart des pièces tiennent en une désignation et un montant. */}
          {lignes.length === 0 ? (
            <button
              type="button"
              onClick={() => setLignes([{ ...LIGNE_VIDE }])}
              className="self-start text-[11.5px] text-slate underline decoration-line hover:text-ink"
            >
              + Détailler en plusieurs lignes
            </button>
          ) : (
            <InvoiceLinesEditor lignes={lignes} onChange={setLignes} amountCents={centsFinal} />
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" onClick={enregistrer} disabled={enCours}>
              {enCours ? "…" : pieceAttachee ? "Enregistrer" : `Valider ${mots.leLa}`}
            </Button>
            {pieceAttachee && (
              <button
                type="button"
                onClick={() => setEditeur(false)}
                className="text-[11.5px] text-slate underline decoration-line hover:text-ink"
              >
                Annuler
              </button>
            )}
            {!pieceAttachee && autres.length > 0 && (
              <button
                type="button"
                onClick={() => setListeVisible((v) => !v)}
                className="text-[11.5px] text-slate underline decoration-line hover:text-ink"
              >
                {listeVisible
                  ? `Masquer ${kind === "quote" ? "les devis existants" : "les factures existantes"}`
                  : `Joindre ${kind === "quote" ? "un devis existant" : "une facture existante"} (${autres.length})`}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate leading-relaxed">
            Le détail ligne par ligne se complète ensuite depuis Facturation — ici on ne demande que ce qu&apos;il faut
            pour émettre {mots.leLa} et l&apos;envoyer.
          </p>
        </div>
      )}

      {listeVisible && autres.length > 0 && (
        <div className="border border-line rounded-md max-h-40 overflow-y-auto">
          {autres.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choisir(p)}
              className="w-full text-left px-2.5 py-1.5 text-[12.5px] border-b border-line last:border-b-0 flex items-center gap-2 text-ink hover:bg-mist"
            >
              <span className="flex-1 min-w-0 truncate">{p.reference}</span>
              <span className="shrink-0 tabular-nums">{enEuros(p.amountCents)}</span>
              <span className="shrink-0 text-[11px] text-slate">
                {new Date(p.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </button>
          ))}
        </div>
      )}

      {liste === null && <div className="text-[11.5px] text-slate">Chargement…</div>}

      {pieceAttachee && !editeur && (
        <div className="text-[11.5px] text-slate leading-relaxed">{mots.effetEnvoi}</div>
      )}
    </div>
  );
}
