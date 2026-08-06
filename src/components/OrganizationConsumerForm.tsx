"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import { HelpTip } from "@/components/HelpTip";

// Ce qui s'applique quand l'organisme vend à un PARTICULIER.
//
// Ces champs vivaient dans un onglet « Réglages des contrats » de la
// bibliothèque de modèles, à côté de choses qui n'ont rien à voir. Ce sont
// des mentions d'identité — le médiateur dont l'organisme relève, la
// préfecture qui a reçu sa déclaration d'activité — pas des réglages de
// document : leur place est ici, avec le SIRET et le RCS.
//
// L'indemnité de résiliation, elle, est partie ailleurs : c'est une clause
// négociée, elle se demande à la génération du contrat.

type ConsumerSettings = {
  regionPrefecture: string;
  mediatorName: string;
  mediatorContact: string;
  withdrawalAccessPolicy: string;
  cancellationFeePercent: number | null;
};

export function OrganizationConsumerForm({
  initial,
  messageMediation,
  rappelReporte,
}: {
  initial: ConsumerSettings;
  /** Ce que la situation réelle de l'organisme impose de dire. */
  messageMediation: string;
  /** Vrai quand un « À faire plus tard » court encore. */
  rappelReporte: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [reportEnCours, setReportEnCours] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function reporter() {
    setReportEnCours(true);
    const res = await fetch("/api/organization/mediation-snooze", { method: "POST" });
    setReportEnCours(false);
    if (!res.ok) {
      setError("Impossible de reporter le rappel.");
      return;
    }
    toast.success("Rappel reporté d'un mois. L'obligation, elle, court toujours.");
    router.refresh();
  }

  function set<K extends keyof ConsumerSettings>(key: K, value: ConsumerSettings[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/organization/contract-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    toast.success("Réglages enregistrés.");
  }

  const champ =
    "border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal bg-white";

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="text-[12px] text-ink font-medium">Mentions obligatoires</div>
        <p className="text-[11.5px] text-slate leading-relaxed mt-0.5">
          Des faits sur votre organisme, repris tels quels dans chaque contrat conclu avec un particulier.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-ink font-medium">Médiation de la consommation</span>
          <HelpTip label="Qu'est-ce que la médiation de la consommation ?">
            <p>
              Un médiateur de la consommation est un tiers indépendant que votre client particulier peut saisir
              gratuitement en cas de litige, avant d&apos;aller devant un tribunal.
            </p>
            <p className="mt-2">
              <strong>Y adhérer est obligatoire</strong> dès lors que vous contractez avec des particuliers
              (art. L.612-1 du Code de la consommation), et ses coordonnées doivent figurer sur vos contrats,
              vos CGV et votre site. Un organisme qui ne vend qu&apos;à des entreprises n&apos;y est pas tenu.
            </p>
            <p className="mt-2">
              L&apos;adhésion se fait auprès d&apos;un médiateur référencé par la Commission d&apos;évaluation et
              de contrôle de la médiation de la consommation (CECMC) — la liste officielle est publiée sur
              economie.gouv.fr. Comptez quelques dizaines d&apos;euros par an pour un petit organisme.
            </p>
          </HelpTip>
        </div>
        <p className="text-[11.5px] text-slate leading-relaxed">{messageMediation}</p>
        {rappelReporte ? (
          <p className="text-[11px] text-seal-dark">
            Rappel reporté d&apos;un mois. L&apos;obligation, elle, court toujours.
          </p>
        ) : (
          !values.mediatorName.trim() && (
            // Reporter, jamais renoncer : le bouton fait taire le rappel du
            // tableau de bord pendant un mois et ne coche rien dans la
            // check-list de démarrage. C'est exactement ce qu'il promet.
            <button
              type="button"
              disabled={reportEnCours}
              onClick={reporter}
              className="self-start text-[11.5px] text-slate underline decoration-line hover:text-ink"
            >
              {reportEnCours ? "…" : "Je m'en occupe plus tard"}
            </button>
          )
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Médiateur</span>
            <input
              value={values.mediatorName}
              onChange={(e) => set("mediatorName", e.target.value)}
              placeholder="Médiateur de la formation professionnelle…"
              className={champ}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Coordonnées du médiateur</span>
            <input
              value={values.mediatorContact}
              onChange={(e) => set("mediatorContact", e.target.value)}
              placeholder="Adresse postale, e-mail ou site web"
              className={champ}
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1 border-t border-line pt-3.5">
        <span className="text-[11px] text-slate uppercase tracking-wide">Préfecture de région compétente</span>
        <input
          value={values.regionPrefecture}
          onChange={(e) => set("regionPrefecture", e.target.value)}
          placeholder="Préfecture de la région Île-de-France"
          className={champ}
        />
        <span className="text-[11px] text-slate leading-relaxed">
          Celle auprès de laquelle votre numéro de déclaration d&apos;activité est enregistré. Elle se mentionne
          dans les contrats conclus avec un particulier.
        </span>
      </label>

      {/* Deux natures, deux blocs. Au-dessus, des MENTIONS : des faits sur
          l'organisme, obligatoires, qui partent tels quels dans chaque contrat
          conclu avec un particulier. Ci-dessous, des VALEURS PAR DÉFAUT :
          elles ne décident rien à elles seules, chaque formation ou chaque
          contrat pouvant en disposer autrement. Les présenter côte à côte
          sans le dire faisait lire les secondes comme les premières — c'est
          exactement le reproche fait à l'ancien onglet « Réglages des
          contrats », qui semblait s'appliquer à tous les contrats. */}
      <div className="border-t border-line pt-3.5">
        <div className="text-[12px] text-ink font-medium">Valeurs par défaut</div>
        <p className="text-[11.5px] text-slate leading-relaxed mt-0.5">
          Le point de départ, pas la décision : ces deux valeurs s&apos;appliquent seulement à ce qui n&apos;en
          dispose pas autrement. Elles se redéfinissent formation par formation et contrat par contrat.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate uppercase tracking-wide">
            Accès à la formation en ligne pendant le délai de rétractation
          </span>
          <HelpTip label="À quoi sert ce réglage ?">
            <p>
              Ouvrir un module pendant le délai de rétractation, c&apos;est commencer à exécuter le contrat alors
              que l&apos;apprenant peut encore être remboursé intégralement.
            </p>
            <p className="mt-2">
              Ce réglage n&apos;est que la <strong>valeur par défaut</strong> : chaque formation peut trancher
              elle-même dans ses « Règles du parcours ». Une formation de trois jours et un parcours de six mois
              n&apos;appellent pas la même réponse.
            </p>
          </HelpTip>
        </div>
        <select
          value={values.withdrawalAccessPolicy}
          onChange={(e) => set("withdrawalAccessPolicy", e.target.value)}
          className={champ}
        >
          <option value="closed">Fermé — tout ouvre à la fin des 14 jours, sauf renonciation de l&apos;apprenant</option>
          <option value="partial">Partiel — les modules cochés « Ouvert pendant rétractation » restent accessibles</option>
        </select>
        <span className="text-[11px] text-slate leading-relaxed">
          S&apos;applique aux formations qui n&apos;ont pas leur propre réglage. En mode partiel, choisissez les
          modules concernés depuis l&apos;onglet Contenu de chaque formation — réservez-le à ce qui précède
          vraiment la formation (livret d&apos;accueil, programme, règlement intérieur, test de positionnement).
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate uppercase tracking-wide">
            Indemnité de résiliation anticipée
          </span>
          <HelpTip label="Indemnité de résiliation">
            <p>
              Le pourcentage du prix que vous retenez si le client rompt le contrat en cours de route. Il doit être
              <strong> réciproque</strong> : un contrat qui ne pénalise que le client comporte une clause présumée
              abusive (art. R.212-2, 3° du Code de la consommation).
            </p>
            <p className="mt-2">
              Ce n&apos;est qu&apos;une <strong>proposition</strong> reprise dans vos contrats — une clause se
              négocie client par client. Laissez vide pour ne stipuler aucune indemnité par défaut.
            </p>
          </HelpTip>
        </div>
        <div className="flex items-center gap-1.5 w-32">
          <input
            type="number"
            min={0}
            max={100}
            value={values.cancellationFeePercent ?? ""}
            onChange={(e) => set("cancellationFeePercent", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="—"
            className={`${champ} w-full`}
          />
          <span className="text-[12.5px] text-slate">%</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mt-1">
        <Button type="button" size="sm" className="self-start" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Button>
        {error && <span className="text-[12px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
