import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import {
  Users,
  Calendar,
  Receipt,
  Inbox,
  ScrollText,
  ShieldCheck,
  FileText,
  type LucideIcon,
} from "lucide-react";

type Guide = { question: string; steps: string[] };
type Section = { key: string; label: string; icon: LucideIcon; guides: Guide[] };

const SECTIONS: Section[] = [
  {
    key: "crm",
    label: "CRM commercial",
    icon: Users,
    guides: [
      {
        question: "Comment créer un prospect ?",
        steps: [
          "Sur /crm, cliquez « + Nouveau prospect ».",
          "Choisissez un contact existant ou créez-en un nouveau (prénom, nom, email).",
          "Renseignez l'intitulé de l'opportunité et, si vous la connaissez déjà, la formation d'intérêt — ce champ sert plus tard à l'auto-suggestion dans le Planning.",
        ],
      },
      {
        question: "Comment voir l'historique complet d'un client (emails, paiements, documents) ?",
        steps: [
          "Cliquez sur le nom du contact, dans le Kanban ou la vue Tableau.",
          "La fiche unifiée regroupe ses opportunités, son statut de paiement, ses dossiers de formation, tous ses échanges par email et l'historique des envois.",
          "Depuis cette fiche, « Envoyer un email » propose une rédaction assistée par IA selon l'intention choisie (relance, relance de paiement, relance sur devis).",
        ],
      },
      {
        question: "Pourquoi une opportunité passe-t-elle automatiquement à l'étape suivante ?",
        steps: [
          "Marquer un devis comme « Envoyé » fait avancer automatiquement l'opportunité correspondante à l'étape « Devis envoyé ».",
          "Inscrire un prospect à une session de formation (voir Planning) la fait passer à « Session planifiée ».",
          "Ces automatismes évitent d'oublier de mettre à jour le pipeline après une action déjà faite ailleurs dans l'app.",
        ],
      },
    ],
  },
  {
    key: "planning",
    label: "Planning des sessions",
    icon: Calendar,
    guides: [
      {
        question: "Comment inscrire un apprenant à une session ?",
        steps: [
          "Ouvrez la session sur /planning, section « Ajouter un apprenant ».",
          "Seuls les prospects en étape « Convention signée » dont la formation d'intérêt correspond à la session apparaissent — renseignez ce champ sur l'opportunité CRM si la liste est vide.",
          "Cliquez « Inscrire » : le dossier apprenant est créé et l'opportunité passe automatiquement à « Session planifiée ».",
        ],
      },
      {
        question: "Comment envoyer les convocations ?",
        steps: [
          "Une session doit d'abord être validée (« Valider la session ») — impossible d'envoyer une convocation depuis une session en brouillon.",
          "Dépliez la fiche de chaque apprenant inscrit : l'objet et le message sont pré-remplis, modifiables à la main ou régénérables via « Rédiger avec l'IA ».",
          "« Renvoyer l'invitation » reste disponible après le premier envoi si besoin de renvoyer.",
        ],
      },
    ],
  },
  {
    key: "facturation",
    label: "Facturation",
    icon: Receipt,
    guides: [
      {
        question: "Comment enregistrer un paiement reçu en plusieurs fois ?",
        steps: [
          "Sur /facturation, onglet Factures, chaque ligne affiche la progression du paiement.",
          "Cliquez « Enregistrer un paiement », indiquez le montant reçu et le moyen (virement, CB, chèque…).",
          "La facture passe automatiquement à « Payé » une fois le montant total couvert — pas besoin de changer le statut à la main.",
        ],
      },
      {
        question: "Comment activer le paiement en ligne (Stripe) ?",
        steps: [
          "Sur /integrations, section Stripe, renseignez votre clé secrète Stripe et le secret de signature du webhook.",
          "Configurez l'URL de webhook affichée dans Stripe (événement checkout.session.completed).",
          "Un bouton « Créer un lien de paiement Stripe » apparaît alors sur chaque facture non payée — le paiement reçu est rapproché automatiquement, sans action manuelle.",
        ],
      },
    ],
  },
  {
    key: "inbox",
    label: "Boîte mail",
    icon: Inbox,
    guides: [
      {
        question: "Comment connecter ma boîte mail ?",
        steps: [
          "Sur /integrations, connectez un compte Gmail (OAuth, un clic) ou une autre boîte via IMAP/SMTP (hôte, port, identifiants).",
          "Une organisation peut connecter plusieurs boîtes — utile si plusieurs personnes trient les emails.",
          "« Synchroniser maintenant » récupère les 25 derniers emails de la boîte de réception ; seuls les nouveaux sont importés à chaque synchro.",
        ],
      },
      {
        question: "Que faire d'un email qui n'est rattaché à personne ?",
        steps: [
          "Il apparaît dans « À trier » sur /inbox.",
          "« Rattacher » l'associe à un contact existant ou en crée un nouveau — « Extraire avec l'IA » peut pré-remplir téléphone et société à partir du corps de l'email.",
          "« Ignorer » le retire de la liste sans le supprimer.",
        ],
      },
    ],
  },
  {
    key: "rgpd",
    label: "Registre RGPD",
    icon: ScrollText,
    guides: [
      {
        question: "Comment savoir si un email reçu est une demande RGPD ?",
        steps: [
          "Chaque email synchronisé est automatiquement analysé par l'IA pour détecter une demande d'exercice de droit (accès, effacement, portabilité, rectification).",
          "Les suggestions apparaissent en haut de /inbox, dans « Suggestions RGPD » — visible uniquement aux rôles habilités RGPD.",
          "« Confirmer la demande » crée la demande officielle dans le registre (échéance à 1 mois) ; « Ce n'est pas une demande RGPD » l'écarte.",
        ],
      },
      {
        question: "Où suivre les échéances légales des demandes de droits ?",
        steps: [
          "Sur /rgpd, onglet « Demandes de droits », toutes les demandes ouvertes sont listées avec leur échéance.",
          "Une demande en retard apparaît aussi dans le tableau de bord (« À faire ») et dans la cloche de notifications.",
        ],
      },
    ],
  },
  {
    key: "qualiopi",
    label: "Conformité Qualiopi",
    icon: ShieldCheck,
    guides: [
      {
        question: "Comment savoir précisément ce qu'attend un indicateur pour mon organisme ?",
        steps: [
          "Sur /qualiopi, onglet « Préparation audit », cliquez « Voir mon résumé personnalisé » sur l'indicateur concerné.",
          "L'IA génère une explication concrète tenant compte de votre catalogue de formations et de vos modalités (présentiel/distanciel) — pas le texte générique du référentiel.",
          "Le résumé est mis en cache : il n'est regénéré que si vous cliquez « Régénérer ».",
        ],
      },
    ],
  },
  {
    key: "dossiers",
    label: "Dossiers apprenants",
    icon: FileText,
    guides: [
      {
        question: "Où voir le parcours complet d'un apprenant ?",
        steps: [
          "Sur /dossiers, ouvrez le dossier concerné.",
          "L'onglet Info montre la checklist du parcours (recueil des besoins, convention, convocation, évaluations) ; les autres onglets couvrent les emails, documents, données personnelles et preuves Qualiopi rattachées.",
        ],
      },
    ],
  },
];

export default async function FaqPage() {
  const { role } = await requireSessionContext();
  if (can(role, "faq") === "none") redirect("/dashboard");

  return (
    <>
      <PageHeader title="FAQ & guides" subtitle="Comment faire, module par module" />
      <div className="p-8 flex flex-col gap-4 max-w-2xl">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.key} className="bg-white border border-line rounded-card p-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <div className="w-7 h-7 rounded-md bg-[#E6E3DA] flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-ink" />
                </div>
                <div className="text-[13.5px] font-semibold text-ink">{section.label}</div>
              </div>
              <div className="flex flex-col gap-1">
                {section.guides.map((guide, i) => (
                  <details key={i} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
                    <summary className="text-[12.5px] text-ink font-medium cursor-pointer">{guide.question}</summary>
                    <ol className="mt-2 pl-4 flex flex-col gap-1.5 list-decimal">
                      {guide.steps.map((step, j) => (
                        <li key={j} className="text-[12px] text-slate">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
