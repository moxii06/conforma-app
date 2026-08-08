"use client";

import { useState } from "react";
import { Check, ExternalLink, MessageSquare } from "lucide-react";
import { Button, Pill } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DialogShell } from "@/components/DialogShell";
import { useToast } from "@/components/ToastProvider";
import { FORMULES, formaterMontant, resoudrePrixMensuelCents, type Formule } from "@/lib/tarifs";

/**
 * Tout ce qu'un organisme peut FAIRE de son abonnement : comparer les
 * formules, en changer, résilier, récupérer ses factures, joindre l'éditeur.
 *
 * Deux mondes cohabitent ici, et l'écran doit dire lequel s'applique plutôt
 * que d'en simuler un :
 *
 *  - Stripe branché (`souscriptionEnLigne`) : la souscription, le changement
 *    de formule, la résiliation et les factures vivent dans les écrans hébergés
 *    par Stripe. On y renvoie au lieu de les reconstruire — quatre écrans à
 *    maintenir pour un résultat moins complet, et surtout aucune coordonnée
 *    bancaire ne transite par Jalon.
 *  - Stripe pas branché (l'état actuel) : aucun bouton ne fait semblant de
 *    facturer. Chaque action dépose une DEMANDE dans le fil d'échanges avec
 *    l'éditeur, déjà présent plus bas sur la page, et le dit explicitement
 *    avant de partir.
 *
 * La règle qui tient l'écran : ne jamais annoncer un effet que le code ne
 * produit pas. « Demander le passage à Team » quand rien ne prélève, pas
 * « Passer à Team ».
 */

export type InfoResiliation = {
  /** Date d'effet déjà formatée en français (« 31 août 2026 »), ou null. */
  dateEffet: string | null;
  /** Ce que cette date représente — l'écran ne doit pas confondre les deux. */
  nature: "periode" | "essai" | null;
  /** `dateEffet` est déjà passée : la résiliation prendrait effet tout de suite. */
  echue: boolean;
  /** Une résiliation est déjà enregistrée et court jusqu'à `dateEffet`. */
  dejaDemandee: boolean;
};

type Action =
  | { type: "changement"; formule: Formule }
  | { type: "resiliation" };

export function SubscriptionActions({
  formuleActuelle,
  statut,
  abonnementPayant,
  souscriptionEnLigne,
  prixStripe,
  resiliation,
  ancreMessagerie,
}: {
  /** La clé de la formule en cours, relue en base par la page. */
  formuleActuelle: string | null;
  statut: string | null;
  /** Vrai dès qu'un client Stripe existe — donc que quelque chose a été payé. */
  abonnementPayant: boolean;
  souscriptionEnLigne: boolean;
  prixStripe: Record<string, { amountCents: number; currency: string } | null>;
  resiliation: InfoResiliation;
  /** L'ancre du fil éditeur, plus bas sur la même page. */
  ancreMessagerie: string;
}) {
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const gereParStripe = souscriptionEnLigne && abonnementPayant;

  /** Redirige vers un écran hébergé par Stripe (checkout ou portail). */
  async function versStripe(url: string, corps: unknown, cle: string) {
    setEnCours(cle);
    setErreur(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      setEnCours(null);
      setErreur(data?.error ?? "L'opération a échoué.");
      return;
    }
    // On quitte la page : inutile de rendre la main, l'état de chargement
    // reste affiché jusqu'à la navigation.
    window.location.href = data.url;
  }

  /** Dépose une demande dans le fil avec l'éditeur. Rien n'est facturé. */
  async function deposerDemande(corps: unknown, cle: string, confirmation: string) {
    setEnCours(cle);
    setErreur(null);
    const res = await fetch("/api/billing/demande", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    setEnCours(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErreur(data?.error ?? "La demande n'est pas partie.");
      return;
    }
    setAction(null);
    toast.success(confirmation);
    // Le fil est plus bas sur la même page : l'y emmener lui fait VOIR le
    // message qui vient d'être déposé, au lieu de le croire sur parole.
    document.getElementById(ancreMessagerie)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function demanderChangement(formule: Formule) {
    // Avec Stripe branché, on ne dépose pas de demande : le changement est
    // immédiat et proraté côté Stripe. Le portail pour un abonné existant
    // (il gère la bascule et l'avoir), le checkout pour une première
    // souscription (il n'y a pas encore de client à faire basculer).
    if (gereParStripe) {
      void versStripe("/api/billing/portal", undefined, `plan-${formule.cle}`);
      return;
    }
    if (souscriptionEnLigne) {
      void versStripe("/api/billing/checkout", { plan: formule.cle }, `plan-${formule.cle}`);
      return;
    }
    setErreur(null);
    setAction({ type: "changement", formule });
  }

  return (
    <div className="flex flex-col gap-5">
      {erreur && !action && (
        <div className="bg-[#E9D8D3] text-rust text-[12.5px] rounded-md px-3 py-2.5">{erreur}</div>
      )}

      {/* ---- Comparatif des formules ---- */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink">Les formules</h2>
          <p className="text-[11.5px] text-slate mt-0.5">
            Tarifs hors taxes, par mois. La TVA et votre numéro intracommunautaire sont demandés au moment du
            paiement.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 items-stretch">
          {FORMULES.map((formule) => {
            const estActuelle = formule.cle === formuleActuelle;
            // Pendant l'essai, la formule en cours reste MISE EN ÉVIDENCE mais
            // son bouton reste ACTIF : c'est précisément celle que l'organisme
            // voudra confirmer à la fin de l'essai. La griser reviendrait à
            // n'offrir aucun chemin pour souscrire ce qu'on est en train
            // d'essayer. Seul un abonnement déjà payé ferme le bouton.
            const estEssai = estActuelle && !abonnementPayant;
            const prix = resoudrePrixMensuelCents(formule, prixStripe[formule.cle]);
            return (
              <div
                key={formule.cle}
                className={`bg-white rounded-card p-4 flex flex-col ${
                  estActuelle ? "border-2 border-seal" : "border border-line"
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-h-6">
                  <span className="text-[15px] font-display text-ink">{formule.libelle}</span>
                  {estActuelle && <Pill tone="warn">{estEssai ? "Formule d'essai" : "Formule actuelle"}</Pill>}
                </div>

                <div className="text-[19px] text-ink tabular-nums mt-1.5">
                  {formaterMontant(prix.cents, prix.devise)}
                  <span className="text-[11.5px] text-slate"> HT / mois</span>
                </div>
                {!prix.depuisStripe && (
                  // Dire d'où sort le nombre : tant que Stripe n'est pas
                  // branché, c'est le tarif du catalogue, pas un montant qu'un
                  // système s'apprête à prélever.
                  <div className="text-[10.5px] text-ash mt-0.5">Tarif public indicatif</div>
                )}

                <p className="text-[12px] text-slate mt-2 leading-relaxed">{formule.accroche}</p>

                {/* Les mêmes trois axes pour les trois cartes : c'est ce qui
                    rend la grille comparable en colonnes. */}
                <dl className="mt-3 border border-line rounded-md divide-y divide-line">
                  <LigneLimite
                    label="Utilisateurs"
                    valeur={limite(formule.limites.utilisateurs, (n) => `${n} compte${n > 1 ? "s" : ""}`, "Illimités")}
                  />
                  <LigneLimite
                    label="Apprenants actifs"
                    valeur={limite(formule.limites.apprenantsActifsParMois, (n) => `${n} / mois`, "Illimités")}
                  />
                  <LigneLimite
                    label="Signatures électroniques"
                    valeur={limite(
                      formule.limites.signaturesIncluses,
                      (n) => `${n} incluses / mois`,
                      "Illimitées",
                    )}
                  />
                </dl>

                <ul className="flex flex-col gap-1.5 mt-3 mb-4 flex-1">
                  {formule.inclus.map((ligne) => (
                    <li key={ligne} className="flex items-start gap-1.5 text-[12px] text-ink">
                      <Check size={13} className="text-sage mt-0.5 shrink-0" />
                      <span>{ligne}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={estActuelle && !estEssai ? "secondary" : "primary"}
                  onClick={() => demanderChangement(formule)}
                  disabled={(estActuelle && !estEssai) || enCours !== null}
                  className="w-full"
                >
                  {enCours === `plan-${formule.cle}`
                    ? souscriptionEnLigne
                      ? "Ouverture…"
                      : "Envoi…"
                    : estActuelle && !estEssai
                      ? "Formule en cours"
                      : estEssai
                        ? souscriptionEnLigne
                          ? "Souscrire cette formule"
                          : "Confirmer cette formule"
                        : souscriptionEnLigne
                          ? "Passer sur cette formule"
                          : "Demander cette formule"}
                </Button>
              </div>
            );
          })}
        </div>

        {!souscriptionEnLigne && (
          <p className="text-[11.5px] text-slate">
            La souscription en ligne n&apos;est pas encore activée : demander une formule dépose une demande
            auprès de l&apos;éditeur, qui vous répond dans le fil en bas de page. Aucun prélèvement n&apos;est
            déclenché depuis cet écran.
          </p>
        )}
      </section>

      {/* ---- Factures ---- */}
      <section className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5">
        <h2 className="text-[13.5px] font-semibold text-ink">Factures d&apos;abonnement</h2>
        {gereParStripe ? (
          <>
            <p className="text-[12.5px] text-slate leading-relaxed">
              Vos factures d&apos;abonnement sont émises et conservées par Stripe. Vous les y consultez et les
              téléchargez au format PDF, avec votre numéro de TVA intracommunautaire, depuis le même espace que
              votre moyen de paiement.
            </p>
            <div>
              <Button
                variant="secondary"
                onClick={() => versStripe("/api/billing/portal", undefined, "factures")}
                disabled={enCours !== null}
              >
                <ExternalLink size={13} />
                {enCours === "factures" ? "Ouverture…" : "Voir mes factures"}
              </Button>
            </div>
          </>
        ) : souscriptionEnLigne ? (
          // Stripe est branché mais rien n'a encore été payé : la raison de la
          // liste vide n'est pas la même que ci-dessous, et les confondre
          // ferait dire à l'écran que la facturation est en panne alors
          // qu'elle attend simplement une première échéance.
          <p className="text-[12.5px] text-slate leading-relaxed">
            Aucune facture d&apos;abonnement n&apos;a encore été émise
            {statut === "trialing" ? " : votre période d'essai est en cours et n'est pas facturée" : ""}. À votre
            première échéance, Stripe émettra votre facture et un bouton apparaîtra ici pour la consulter et la
            télécharger.
          </p>
        ) : (
          // Aucune facture n'est fabriquée ici : il n'existe aucun modèle de
          // facture d'abonnement en base (Invoice, c'est la facturation de
          // l'organisme vers SES clients). Afficher une liste vide sans dire
          // pourquoi laisserait croire à une perte.
          <p className="text-[12.5px] text-slate leading-relaxed">
            Aucune facture d&apos;abonnement n&apos;est disponible
            {statut === "trialing" ? ", votre période d'essai étant toujours en cours" : ""}. La facturation en
            ligne n&apos;est pas encore activée sur cette installation : aucune facture n&apos;est donc émise
            depuis Jalon, et il n&apos;y en a aucune à récupérer. Dès qu&apos;une facturation sera en place, vos
            factures deviendront consultables depuis cet écran. En attendant, demandez un justificatif à
            l&apos;éditeur dans le fil en bas de page.
          </p>
        )}
      </section>

      {/* ---- Contacter l'équipe commerciale ---- */}
      {/* Pas de formulaire de contact ici : le fil éditeur ↔ organisme existe
          déjà en bas de cette page, l'éditeur le lit depuis la fiche de
          l'organisme, et l'historique reste au même endroit. Un second canal
          n'aurait servi qu'à créer l'endroit où une demande se perd. */}
      <section className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5">
        <h2 className="text-[13.5px] font-semibold text-ink">Une question sur votre abonnement ?</h2>
        <p className="text-[12.5px] text-slate leading-relaxed">
          Devis pour un volume particulier, facturation annuelle, formule sur mesure : écrivez directement à
          l&apos;équipe Jalon dans le fil en bas de cette page. Vos échanges restent dans Jalon et votre équipe
          n&apos;y a pas accès.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" href={`#${ancreMessagerie}`}>
            <MessageSquare size={13} />
            Écrire à l&apos;équipe Jalon
          </Button>
          <Button
            variant="tertiary"
            onClick={() =>
              deposerDemande({ type: "commercial" }, "commercial", "Votre demande de contact est arrivée chez Jalon.")
            }
            disabled={enCours !== null}
          >
            {enCours === "commercial" ? "Envoi…" : "Demander à être rappelé"}
          </Button>
        </div>
      </section>

      {/* ---- Résiliation ----
          Masquée s'il n'existe aucune ligne d'abonnement : proposer de résilier
          ce qui n'a jamais été souscrit ferait douter d'un engagement caché. */}
      {formuleActuelle !== null && (
        <section className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5">
          <h2 className="text-[13.5px] font-semibold text-ink">Résilier l&apos;abonnement</h2>

          {resiliation.dejaDemandee ? (
            <p className="text-[12.5px] text-slate leading-relaxed">
              Une résiliation est déjà enregistrée. Votre accès reste complet
              {resiliation.dateEffet
                ? ` jusqu'au ${resiliation.dateEffet}`
                : " jusqu'à la fin de la période en cours"}
              , puis l&apos;abonnement s&apos;arrête sans nouveau prélèvement. Pour revenir sur cette décision,
              écrivez-le dans le fil en bas de page.
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-slate leading-relaxed">
                {resiliation.echue ? (
                  <>
                    Votre {resiliation.nature === "essai" ? "période d'essai" : "période payée"} est arrivée à son
                    terme le {resiliation.dateEffet} : une résiliation prendrait effet immédiatement. Vos données ne
                    sont pas supprimées pour autant.
                  </>
                ) : (
                  <>
                    La résiliation n&apos;est jamais immédiate : elle prend effet {phraseDateEffet(resiliation)}.
                    D&apos;ici là, rien ne change — accès complet pour toute votre équipe et vos apprenants,
                    sessions, documents et facturation compris.
                  </>
                )}
              </p>
              <ul className="flex flex-col gap-1 text-[12px] text-slate">
                <li>• Aucun prélèvement supplémentaire après la date d&apos;effet.</li>
                <li>
                  • Vos données ne sont pas supprimées à cette date : aucune purge automatique n&apos;est
                  déclenchée par une résiliation.
                </li>
                <li>
                  • Avant la date d&apos;effet, exportez ce dont vous avez besoin — BPF, dossier d&apos;audit
                  Qualiopi, documents des dossiers apprenants — depuis les écrans concernés.
                </li>
                <li>
                  • Vos obligations de conservation d&apos;organisme de formation ne changent pas : prévoyez cet
                  export.
                </li>
              </ul>
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setErreur(null);
                    setAction({ type: "resiliation" });
                  }}
                  disabled={enCours !== null}
                >
                  Résilier l&apos;abonnement
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- Boîtes de dialogue ---- */}
      {action?.type === "changement" && (
        <DialogShell
          title={`Demander le passage à ${action.formule.libelle}`}
          subtitle="Aucun prélèvement n'est déclenché par cette demande."
          onClose={() => setAction(null)}
        >
          <p className="text-[12.5px] text-slate leading-relaxed">
            La souscription en ligne n&apos;est pas encore activée. En confirmant, une demande de passage à la
            formule <strong className="text-ink">{action.formule.libelle}</strong>{" "}est déposée dans votre fil
            d&apos;échanges avec Jalon, en bas de cette page, et l&apos;éditeur en est prévenu.
          </p>
          <p className="text-[12.5px] text-slate leading-relaxed">
            Votre formule actuelle reste en place et rien n&apos;est facturé tant que l&apos;éditeur ne vous a pas
            répondu avec la date de prise d&apos;effet et le montant.
          </p>
          {erreur && <div className="text-[12px] text-rust">{erreur}</div>}
          <div className="flex items-center justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setAction(null)} disabled={enCours !== null}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                deposerDemande(
                  { type: "changement", formule: action.formule.cle },
                  "demande-changement",
                  "Votre demande est arrivée chez Jalon.",
                )
              }
              disabled={enCours !== null}
            >
              {enCours === "demande-changement" ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </div>
        </DialogShell>
      )}

      <ConfirmDialog
        open={action?.type === "resiliation"}
        title="Résilier votre abonnement Jalon ?"
        // La date d'effet est dite AVANT la confirmation, pas après : c'est
        // l'information qui décide, et l'apprendre sur l'écran suivant serait
        // l'apprendre trop tard.
        description={descriptionResiliation(resiliation, gereParStripe, souscriptionEnLigne)}
        confirmLabel={gereParStripe ? "Continuer vers la résiliation" : "Envoyer la demande de résiliation"}
        loading={enCours === "resiliation"}
        error={erreur}
        onCancel={() => setAction(null)}
        onConfirm={() => {
          if (gereParStripe) {
            void versStripe("/api/billing/portal", undefined, "resiliation");
            return;
          }
          void deposerDemande(
            { type: "resiliation" },
            "resiliation",
            "Votre demande de résiliation est arrivée chez Jalon.",
          );
        }}
      />
    </div>
  );
}

/**
 * Rend une limite chiffrée, ou le mot « illimité » accordé par l'appelant.
 *
 * `null` veut dire illimité dans tout lib/tarifs.ts, et le genre du mot change
 * d'une ligne à l'autre (comptes illimités, signatures illimitées) : le
 * laisser choisir à l'appelant évite d'écrire « Illimité(e)s » à l'écran.
 */
function limite(valeur: number | null, rendu: (n: number) => string, illimite: string): string {
  return valeur === null ? illimite : rendu(valeur);
}

function LigneLimite({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
      <dt className="text-[11px] text-slate">{label}</dt>
      <dd className="text-[11.5px] text-ink text-right">{valeur}</dd>
    </div>
  );
}

/** « le 31 août 2026, à la fin de la période déjà réglée » — ou l'aveu qu'on ne sait pas. */
function phraseDateEffet(resiliation: InfoResiliation): string {
  if (!resiliation.dateEffet) {
    return "à la fin de la période en cours, dont la date exacte vous sera confirmée par l'éditeur";
  }
  if (resiliation.nature === "essai") {
    return `le ${resiliation.dateEffet}, au terme de votre période d'essai`;
  }
  return `le ${resiliation.dateEffet}, à la fin de la période déjà réglée`;
}

/**
 * Le texte de confirmation. Trois situations réellement distinctes, et dire
 * l'une à la place de l'autre serait mentir : un organisme en essai avec
 * Stripe branché n'a rien à résilier chez Stripe, et lui annoncer que « la
 * souscription en ligne n'est pas activée » serait faux.
 */
function descriptionResiliation(
  resiliation: InfoResiliation,
  gereParStripe: boolean,
  souscriptionEnLigne: boolean,
): string {
  const debut = `La résiliation prend effet ${phraseDateEffet(resiliation)}. Jusque-là votre accès reste complet et rien n'est interrompu.`;
  const donnees =
    " Vos données ne sont pas supprimées à cette date et aucune purge n'est déclenchée par la résiliation — pensez néanmoins à exporter votre BPF, votre dossier d'audit Qualiopi et vos documents avant l'échéance.";

  if (gereParStripe) {
    return `${debut}${donnees} Vous allez être redirigé vers l'espace sécurisé de Stripe pour confirmer la résiliation.`;
  }
  if (souscriptionEnLigne) {
    return `${debut}${donnees} Aucun abonnement payant n'est en cours : cette action prévient l'éditeur que vous ne souhaitez pas poursuivre. Rien n'a été prélevé et rien ne le sera.`;
  }
  return `${debut}${donnees} La souscription en ligne n'étant pas activée, cette action dépose une demande de résiliation dans votre fil d'échanges avec l'éditeur : rien n'est résilié automatiquement, l'éditeur vous confirme la prise en compte.`;
}
