"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { SegmentedControl } from "@/components/Controls";
import { Button, Pill } from "@/components/ui";
import { CRITERE_RETRACTATION_PHRASE, SIGNING_MODE_HINTS } from "@/lib/withdrawalGate";

/**
 * Les mêmes règles de parcours que sur la fiche formation, mais réglées
 * pour CETTE session — avec l'héritage rendu visible.
 *
 * Trois choses que l'écran doit dire, et que le composant de la formation
 * n'avait pas à dire :
 *
 *   1. la valeur EFFECTIVE, celle qui s'applique réellement à l'apprenant ;
 *   2. D'OÙ elle vient — session, formation, ou organisme — parce qu'un
 *      réglage dont on ignore la provenance se re-règle au hasard ;
 *   3. comment revenir à l'héritage, en un clic et sans deviner quelle
 *      valeur remettre.
 *
 * D'où le choix d'un contrôle segmenté plutôt qu'un interrupteur : un
 * interrupteur n'a que deux positions et ne sait pas exprimer « je n'ai pas
 * d'avis ». La troisième position existe bien ici, mais elle est portée par
 * un bouton distinct (« Revenir à l'héritage »), qui n'apparaît que lorsqu'il
 * y a quelque chose à annuler — la proposer en permanence comme une option
 * parmi trois la ferait passer pour une valeur.
 */

type Origine = "session" | "formation" | "organisme" | "non_renseigne";

const ORIGINE_LABELS: Record<Origine, string> = {
  session: "Réglé pour cette session",
  formation: "Hérité de la formation",
  organisme: "Hérité de votre organisme",
  // Le mode de conclusion du contrat n'a pas d'échelon supérieur dont
  // hériter : il est propre à la vente, donc à la session. Vide, il n'est
  // pas « hérité », il manque — et c'est ce mot-là qu'il faut afficher.
  non_renseigne: "Non renseigné",
};

function Reglage({
  titre,
  sous,
  consequence,
  origine,
  valeurEffective,
  control,
  onReset,
  disabled,
  children,
}: {
  titre: string;
  sous: string;
  consequence?: string;
  origine: Origine;
  /** La valeur qui s'applique réellement, en toutes lettres. */
  valeurEffective: string;
  control: ReactNode;
  onReset: () => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="py-3.5 border-b border-line last:border-b-0 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{titre}</div>
          <div className="text-[12px] text-slate mt-0.5">{sous}</div>
        </div>
        <Pill tone={origine === "session" ? "warn" : origine === "non_renseigne" ? "danger" : "neutral"}>
          {ORIGINE_LABELS[origine]}
        </Pill>
      </div>

      <div className="text-[12.5px] text-ink">
        <span className="text-slate">Ce qui s&apos;applique : </span>
        <span className="font-medium">{valeurEffective}</span>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {control}
        {origine === "session" && (
          <Button variant="tertiary" size="sm" onClick={onReset} disabled={disabled}>
            <RotateCcw size={12} /> Revenir à l&apos;héritage
          </Button>
        )}
      </div>

      {consequence && (
        <div className="text-[11.5px] text-slate border-l-2 border-seal pl-2.5 py-0.5">{consequence}</div>
      )}
      {children}
    </div>
  );
}

export function SessionParcoursRules({
  sessionId,
  session,
  formation,
  organisme,
}: {
  sessionId: string;
  /** Les surcharges de la session — `null` partout par défaut. */
  session: {
    sequentialUnlock: boolean | null;
    allowVideoSkip: boolean | null;
    withdrawalAccessPolicy: string | null;
    contractSigningMode: string | null;
  };
  /** Ce dont la session hérite quand elle ne dit rien. */
  formation: { sequentialUnlock: boolean; allowVideoSkip: boolean; withdrawalAccessPolicy: string | null };
  /** Le dernier recours pour la rétractation : le réglage de l'organisme. */
  organisme: { withdrawalAccessPolicy: string };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setLoading(true);
    await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
    setLoading(false);
    router.refresh();
  }

  const sequentielEffectif = session.sequentialUnlock ?? formation.sequentialUnlock;
  const sautEffectif = session.allowVideoSkip ?? formation.allowVideoSkip;
  const retractationEffective =
    session.withdrawalAccessPolicy ?? formation.withdrawalAccessPolicy ?? organisme.withdrawalAccessPolicy;
  const origineRetractation: Origine =
    session.withdrawalAccessPolicy != null
      ? "session"
      : formation.withdrawalAccessPolicy != null
        ? "formation"
        : "organisme";

  return (
    <div className="flex flex-col">
      <Reglage
        titre="Terminer un module pour ouvrir le suivant"
        sous="Décochez pour une bibliothèque de ressources consultable dans le désordre."
        consequence="En accès libre, tous les modules s'ouvrent dès que l'accès est donné. Un parcours certifiant, dont l'ordre porte la progression pédagogique, veut l'inverse."
        origine={session.sequentialUnlock != null ? "session" : "formation"}
        valeurEffective={sequentielEffectif ? "Déblocage séquentiel" : "Accès libre à tous les modules"}
        disabled={loading}
        onReset={() => patch({ sequentialUnlock: null })}
        control={
          <SegmentedControl
            label="Déblocage des modules"
            value={sequentielEffectif ? "oui" : "non"}
            disabled={loading}
            onChange={(v) => patch({ sequentialUnlock: v === "oui" })}
            options={[
              { value: "oui", label: "Séquentiel" },
              { value: "non", label: "Accès libre" },
            ]}
          />
        }
      />

      <Reglage
        titre="Autoriser « Passer cette vidéo »"
        sous="Désactivé par défaut. La suite se débloque, mais le saut reste tracé et visible."
        origine={session.allowVideoSkip != null ? "session" : "formation"}
        valeurEffective={sautEffectif ? "Le saut est autorisé" : "Le saut est interdit"}
        disabled={loading}
        onReset={() => patch({ allowVideoSkip: null })}
        control={
          <SegmentedControl
            label="Saut de vidéo"
            value={sautEffectif ? "oui" : "non"}
            disabled={loading}
            onChange={(v) => patch({ allowVideoSkip: v === "oui" })}
            options={[
              { value: "oui", label: "Autorisé" },
              { value: "non", label: "Interdit" },
            ]}
          />
        }
      />

      {/* Le mode de conclusion vient AVANT la politique d'accès, et non
          après : sans délai de rétractation, la question « que bloque-t-on
          pendant le délai ? » n'a pas d'objet. L'ordre de lecture doit
          suivre l'ordre du raisonnement juridique. */}
      <Reglage
        titre="Comment le contrat a-t-il été signé ?"
        sous="C'est ce qui décide s'il existe un délai de rétractation de 14 jours."
        consequence={CRITERE_RETRACTATION_PHRASE}
        origine={session.contractSigningMode != null ? "session" : "non_renseigne"}
        valeurEffective={
          session.contractSigningMode === "in_person"
            ? "Aucun délai de rétractation"
            : session.contractSigningMode === "remote"
              ? "Délai de 14 jours à compter de la signature"
              : "Non renseigné — le délai de 14 jours s'applique par précaution"
        }
        disabled={loading}
        onReset={() => patch({ contractSigningMode: null })}
        control={
          // Le paramètre de type inclut la chaîne vide, qui n'est PAS une
          // option proposée : c'est l'état « rien de coché » d'un champ
          // encore vierge. Sans elle, le contrôle afficherait « À distance »
          // sélectionné sur une session où personne n'a rien choisi.
          <SegmentedControl<"remote" | "in_person" | "">
            label="Mode de conclusion du contrat"
            value={session.contractSigningMode === "in_person" ? "in_person" : session.contractSigningMode === "remote" ? "remote" : ""}
            disabled={loading}
            onChange={(v) => patch({ contractSigningMode: v === "" ? null : v })}
            options={[
              { value: "remote", label: "À distance" },
              { value: "in_person", label: "En présence" },
            ]}
          />
        }
      >
        <div className="text-[11.5px] text-slate">
          {session.contractSigningMode === "in_person"
            ? SIGNING_MODE_HINTS.in_person
            : session.contractSigningMode === "remote"
              ? SIGNING_MODE_HINTS.remote
              : "Tant que ce n'est pas renseigné, Jalon applique le délai — se tromper dans ce sens coûte quelques jours d'attente, l'inverse coûte un remboursement intégral."}
        </div>
      </Reglage>

      {/* Masqué quand le contrat a été signé en présence : il n'y a alors
          aucun délai, donc rien à bloquer pendant celui-ci. Le laisser
          visible laisserait croire qu'un réglage sans effet en a un. */}
      {session.contractSigningMode !== "in_person" && (
        <Reglage
          titre="Bloquer l'accès pendant le délai de rétractation"
          sous="14 jours après la signature — article L.221-18 du code de la consommation."
          consequence="Ouvrir un module pendant ce délai, c'est commencer à exécuter le contrat alors qu'il peut encore être remboursé intégralement. En accès partiel, seuls les modules marqués « disponibles pendant la rétractation » s'ouvrent."
          origine={origineRetractation}
          valeurEffective={
            retractationEffective === "partial"
              ? "Accès partiel — seuls les modules marqués s'ouvrent"
              : "Accès fermé pendant les 14 jours"
          }
          disabled={loading}
          onReset={() => patch({ withdrawalAccessPolicy: null })}
          control={
            <SegmentedControl
              label="Accès pendant la rétractation"
              value={retractationEffective === "partial" ? "partial" : "closed"}
              disabled={loading}
              onChange={(v) => patch({ withdrawalAccessPolicy: v })}
              options={[
                { value: "closed", label: "Tout bloqué" },
                { value: "partial", label: "Accès partiel" },
              ]}
            />
          }
        />
      )}
    </div>
  );
}
