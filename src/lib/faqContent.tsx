import {
  Users,
  Calendar,
  GraduationCap,
  FileText,
  Receipt,
  Inbox,
  ShieldCheck,
  ScrollText,
  Zap,
  UserCog,
  FileStack,
  BookOpen,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { PERMISSIONS } from "@/lib/tenant";

export type FaqGuide = { question: string; steps: string[] };

export type FaqCategory = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  // Permission key from src/lib/tenant.ts — the category is hidden unless the
  // reader's role can actually reach the screens it describes. Help for a
  // page you'll only ever get redirected away from is noise. Typé sur les
  // clés réelles de PERMISSIONS : une catégorie visant une clé inexistante
  // serait invisible pour tout le monde, en silence.
  feature: keyof typeof PERMISSIONS;
  // Excludes LEARNER even when the permission matrix would let them through.
  // Needed for the "courses" key, which is `limited` for a learner so they
  // can reach their own course list — that must not also hand them the
  // staff-facing catalogue guides.
  staffOnly?: boolean;
  // Mirror image of staffOnly: "portal" is `full` for TRAINER too, but their
  // /mon-espace is a read-only list of their own sessions — none of the
  // learner guides (start a course, get an attestation, sign a document)
  // apply to them.
  learnerOnly?: boolean;
  guides: FaqGuide[];
};

export type FaqStarterStep = { title: string; detail: string; anchor?: string };

// Deliberately an ordered path, not a feature list: the order is what stops
// people hitting the "why is this greyed out" walls further down.
export const FAQ_STARTER_STEPS: FaqStarterStep[] = [
  {
    title: "Renseignez votre organisme",
    detail:
      "Sur Profil : logo, couleur, forme juridique, RCS, représentant légal. Ces informations alimentent automatiquement vos conventions et attestations — les remplir maintenant évite de reprendre chaque document plus tard.",
  },
  {
    title: "Invitez votre équipe et désignez le référent handicap",
    detail:
      "Sur Équipe & rôles. Le référent handicap n'apparaît dans l'espace des apprenants qu'une fois désigné — c'est un attendu Qualiopi.",
    anchor: "equipe",
  },
  {
    title: "Créez votre première formation",
    detail:
      "Sur Catalogue de formations. Vous pouvez partir d'un modèle sectoriel, importer un programme PDF existant, ou tout saisir à la main.",
    anchor: "formations",
  },
  {
    title: "Ajoutez son contenu e-learning",
    detail:
      "Onglet Contenu de la formation : chapitres, vidéos, documents, pages et quiz. Les apprenants les débloquent dans l'ordre.",
    anchor: "formations",
  },
  {
    title: "Programmez une session et inscrivez des apprenants",
    detail:
      "Sur Planning des sessions. Validez la session avant d'envoyer les convocations — c'est le blocage le plus fréquent.",
    anchor: "sessions",
  },
  {
    title: "Connectez votre boîte mail et vos outils",
    detail:
      "Sur Intégrations : messagerie, encaissement Stripe, signature électronique. Tant qu'aucune boîte n'est connectée, les emails affichés sont des données de démonstration.",
    anchor: "boite-mail",
  },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: "crm",
    label: "CRM & prospects",
    description: "Suivre un prospect de la première prise de contact jusqu'au paiement.",
    icon: Users,
    feature: "crm",
    staffOnly: true,
    guides: [
      {
        question: "Comment créer un prospect ?",
        steps: [
          "Sur CRM commercial, onglet Tableau, cliquez « + Nouveau prospect ».",
          "Renseignez prénom, nom, email, l'intitulé de l'opportunité et son montant.",
          "Le champ « formation d'intérêt » est facultatif mais utile : c'est lui qui fait remonter le prospect en suggestion quand vous inscrivez des apprenants à une session de cette formation.",
        ],
      },
      {
        question: "Pourquoi une opportunité change-t-elle d'étape toute seule ?",
        steps: [
          "Marquer un devis comme « Envoyé » fait passer l'opportunité à « Devis envoyé ».",
          "Inscrire le prospect à une session la fait passer à « Session planifiée ».",
          "Une facture entièrement payée la fait passer à « Payé », et le client est archivé automatiquement.",
          "Ces bascules évitent de tenir le pipeline à jour à la main après une action déjà faite ailleurs. Vous pouvez toujours corriger l'étape manuellement avec le sélecteur de la ligne.",
        ],
      },
      {
        question: "Où voir tout l'historique d'un client ?",
        steps: [
          "Cliquez sur le nom du prospect dans le tableau.",
          "Tant qu'il n'a pas de dossier de formation, vous arrivez sur sa fiche client : coordonnées, opportunités, paiements, emails échangés, documents envoyés.",
          "Dès qu'un dossier existe, le même clic ouvre directement le dossier apprenant — la fiche client n'est plus le bon point d'entrée.",
        ],
      },
      {
        question: "Comment importer une liste de contacts existante ?",
        steps: [
          "Sur CRM commercial, cliquez « Importer » (réservé à l'Admin OF).",
          "Déposez un fichier .csv ou .xlsx : les colonnes sont détectées automatiquement, vous corrigez le mappage si besoin.",
          "Option utile : « Inscrire tous les contacts à » une formation et une session, pour créer les dossiers dans la foulée plutôt qu'un par un.",
        ],
      },
      {
        question: "Comment envoyer un document à un prospect, avec signature ?",
        steps: [
          "Sur la ligne du prospect, cliquez « Envoyer ».",
          "Choisissez « Depuis la bibliothèque » (un de vos modèles) ou « Depuis mon ordinateur ».",
          "Cochez « Demander une signature électronique » si nécessaire — cette case n'apparaît que si la signature électronique est disponible sur votre compte.",
          "Si l'envoi d'email est momentanément indisponible, le document est quand même créé et un lien vous est affiché pour le transmettre vous-même.",
        ],
      },
    ],
  },
  {
    key: "sessions",
    label: "Sessions & convocations",
    description: "Programmer, valider, convoquer, émarger, clôturer.",
    icon: Calendar,
    feature: "planning",
    staffOnly: true,
    guides: [
      {
        question: "Pourquoi je ne peux pas envoyer les convocations ?",
        steps: [
          "Une session doit être validée avant tout envoi. En brouillon, le message « Session en brouillon — validez-la pour activer l'envoi des convocations » s'affiche à la place des boutons.",
          "Ouvrez la session et cliquez « Valider la session ».",
          "Autres causes possibles : la session est annulée (aucun envoi possible), ou vous n'êtes ni administrateur ni le formateur assigné — seuls ceux-là peuvent convoquer.",
        ],
      },
      {
        question: "Comment inscrire un apprenant à une session ?",
        steps: [
          "Ouvrez la session, section « Ajouter un apprenant ».",
          "Les prospects dont l'opportunité est en « Convention signée » et dont la formation d'intérêt correspond sont proposés en suggestion. Si la liste est vide, renseignez ce champ sur l'opportunité côté CRM.",
          "Cliquez « Inscrire » : le dossier apprenant est créé et l'opportunité passe à « Session planifiée ». Si l'opportunité était déjà en « Convention signée », l'étape Convention du dossier est cochée d'emblée.",
        ],
      },
      {
        question: "Je ne trouve pas ma formation en continu dans le Planning",
        steps: [
          "C'est normal : le Planning ne liste que les sessions à date fixe.",
          "Une formation « en continu » n'a pas de date de début imposée — elle se gère depuis sa fiche, dans le Catalogue de formations.",
          "Sa contrainte de temps est la durée d'accès accordée à chaque apprenant à l'inscription, pas une date de session.",
        ],
      },
      {
        question: "Comment fonctionne l'émargement en distanciel ?",
        steps: [
          "La classe virtuelle n'est accessible à l'apprenant que dans une fenêtre : à partir de 15 minutes avant le début, et jusqu'à 30 minutes après la fin.",
          "Sa connexion et son temps de présence sont enregistrés automatiquement, sans action de sa part.",
          "Sur la fiche session, chaque apprenant affiche alors « Connecté le … · X h Y min de présence », et le bouton « Générer l'attestation de présence » devient disponible.",
          "Le lien de visioconférence est généré automatiquement au premier envoi d'invitation.",
        ],
      },
      {
        question: "Comment clôturer proprement une session ?",
        steps: [
          "Une fois la date passée, un bloc « Clôture de la session » apparaît sur la fiche.",
          "Il récapitule, apprenant par apprenant, ce qui manque : recueil, contrat, convocation, évaluation à chaud, à froid, attestation.",
          "Traitez les manques depuis les dossiers concernés, puis archivez la session.",
          "L'évaluation à chaud part automatiquement dès la fin d'une session à date fixe — vous n'avez pas de règle à configurer pour celle-là.",
        ],
      },
    ],
  },
  {
    key: "formations",
    label: "Formations & e-learning",
    description: "Catalogue, contenu des modules, quiz, attestations.",
    icon: GraduationCap,
    feature: "courses",
    staffOnly: true,
    guides: [
      {
        question: "Comment créer une formation rapidement ?",
        steps: [
          "Sur Catalogue de formations, cliquez « + Créer une formation ».",
          "Le bloc « Démarrage rapide » propose trois raccourcis : partir d'un modèle sectoriel prérempli, importer un programme PDF existant pour en extraire titre, description et durée, ou générer une ébauche avec l'IA.",
          "Tout ce qui est proposé automatiquement est un brouillon à relire — rien n'est enregistré sans votre validation.",
          "Laissez le champ Places vide pour un nombre de places illimité.",
        ],
      },
      {
        question: "Comment organiser le contenu e-learning ?",
        steps: [
          "Ouvrez la formation, onglet Contenu.",
          "Créez des chapitres avec « + Ajouter un chapitre », puis des modules avec « + Ajouter un module » : vidéo, document, page de contenu ou quiz.",
          "À partir de deux modules, réorganisez-les par glisser-déposer.",
          "Chaque module accepte des « Documents complémentaires » téléchargeables par l'apprenant.",
        ],
      },
      {
        question: "Dans quel ordre les apprenants accèdent-ils aux modules ?",
        steps: [
          "Les modules se débloquent séquentiellement : terminer l'un donne accès au suivant.",
          "Un module vidéo, document ou page est terminé à 100 % de progression. Un quiz est terminé par une tentative réussie — pas par un pourcentage de lecture.",
          "Si vous réordonnez les modules après qu'un apprenant a commencé, sa position est réparée automatiquement au chargement suivant : son parcours reste terminable.",
        ],
      },
      {
        question: "Un apprenant peut-il sauter une vidéo ?",
        steps: [
          "Seulement si vous l'autorisez, formation par formation : onglet Résumé, bloc « Modules vidéo », « Autoriser «Passer cette vidéo» ».",
          "L'apprenant voit alors un avertissement avant de confirmer, et le module passe en terminé.",
          "La vidéo passée reste marquée « Passé sans visionnage complet » — pour vous comme pour lui. La preuve de suivi reste donc honnête.",
          "S'il revient la visionner en entier plus tard, cette mention disparaît d'elle-même.",
        ],
      },
      {
        question: "Comment fonctionne la validité des attestations ?",
        steps: [
          "Définissez une durée de validité sur la fiche formation (« Modifier »).",
          "L'attestation est proposée à l'apprenant dès que sa progression atteint 100 %.",
          "La date d'expiration est figée au moment de l'émission : modifier la durée de validité plus tard ne change pas les attestations déjà délivrées.",
          "Une règle d'automatisation peut relancer l'apprenant avant expiration pour un renouvellement.",
        ],
      },
      {
        question: "À quoi sert la fiche formation publique ?",
        steps: [
          "Onglet Résumé, bloc « Fiche formation publique », cliquez « Publier la fiche publique ».",
          "Vous obtenez une page consultable sans compte, à diffuser à vos prospects, puis « Copier le lien ».",
          "Elle reprend les mentions attendues par l'indicateur 1 de Qualiopi : prérequis, objectifs, durée, tarif, modalités et délais d'accès, méthodes pédagogiques et modalités d'évaluation. Remplissez ces champs via « Modifier » pour qu'elle soit complète.",
        ],
      },
    ],
  },
  {
    key: "dossiers",
    label: "Dossiers apprenants",
    description: "Le parcours administratif d'un apprenant, de bout en bout.",
    icon: FileText,
    feature: "dossiers",
    staffOnly: true,
    guides: [
      {
        question: "Que contient la checklist « Parcours de formation » ?",
        steps: [
          "Cinq étapes : recueil des besoins, convention signée, convocation envoyée, évaluation à chaud, évaluation à froid.",
          "La plupart se cochent seules : l'envoi d'une convocation coche la convocation, une convention signée coche la convention, la soumission d'un formulaire par l'apprenant coche l'étape correspondante.",
          "Vous pouvez toujours cocher ou décocher une étape à la main — utile quand la pièce existe hors de Jalon.",
        ],
      },
      {
        question: "Comment envoyer un contrat, une convocation ou les accès plateforme ?",
        steps: [
          "Ouvrez le dossier, onglet Formations, bloc « Communications ».",
          "Chaque envoi a son bouton : « Envoyer le contrat », « Envoyer la convocation », « Envoyer l'accès plateforme », « Envoyer le test de positionnement », « Envoyer l'évaluation à chaud », « Envoyer l'évaluation à froid ».",
          "« Envoyer la convocation » n'apparaît que si vous êtes administrateur ou le formateur assigné à la session.",
          "L'historique des envois figure juste en dessous, avec un bouton « Marquer signé » sur un contrat en attente.",
        ],
      },
      {
        question: "Un apprenant suit plusieurs formations — comment m'y retrouver ?",
        steps: [
          "Un sélecteur en haut du dossier permet de basculer d'une formation à l'autre.",
          "L'onglet Formations affiche une section repliable par formation ; seule la formation courante propose les actions d'envoi.",
          "Pour agir sur une autre, utilisez « Voir le dossier complet → ».",
        ],
      },
      {
        question: "Où gérer une demande d'aménagement (situation de handicap) ?",
        steps: [
          "Onglet Accessibilité du dossier — visible uniquement par les administrateurs et le référent handicap désigné.",
          "« + Nouvelle demande d'aménagement » pour enregistrer la demande, puis renseignez les aménagements accordés et le statut (En attente / Accordé / Refusé).",
          "L'apprenant peut lui-même signaler un besoin depuis Aide & demandes ; le référent doit être désigné sur Équipe & rôles pour que ses coordonnées lui soient visibles.",
        ],
      },
    ],
  },
  {
    key: "facturation",
    label: "Facturation",
    description: "Devis, factures, encaissement, rapprochement bancaire.",
    icon: Receipt,
    feature: "invoicing",
    guides: [
      {
        question: "Comment enregistrer un paiement en plusieurs fois ?",
        steps: [
          "Onglet Factures, cliquez « Enregistrer un paiement » sur la ligne concernée.",
          "Indiquez le montant reçu et validez ; la progression du paiement s'affiche sur la ligne.",
          "La facture bascule automatiquement en « Payé » dès que la somme des versements couvre le total — inutile de changer le statut à la main.",
        ],
      },
      {
        question: "Comment encaisser en ligne avec Stripe ?",
        steps: [
          "Sur Intégrations, renseignez votre clé secrète Stripe et le secret de signature du webhook, puis déclarez l'URL de webhook affichée dans votre compte Stripe.",
          "Un bouton « Créer un lien de paiement Stripe » apparaît alors sur chaque facture non payée.",
          "Copiez ce lien et transmettez-le à votre client : il n'est pas envoyé automatiquement.",
          "L'argent arrive sur votre propre compte Stripe, pas sur celui de Jalon.",
        ],
      },
      {
        question: "Comment fonctionne le rapprochement bancaire ?",
        steps: [
          "Onglet « À valider ». Alimentez-le en important un relevé au format CSV, ou en connectant votre banque si ce connecteur est actif sur votre compte.",
          "Jalon classe les transactions et propose un rapprochement avec vos factures, en s'appuyant sur le montant restant dû et le nom du payeur.",
          "Rien n'est jamais associé automatiquement : vous cliquez « Confirmer la suggestion » ou « Ignorer ». Un libellé bancaire ne porte pas de référence de facture — une association automatique se tromperait tôt ou tard.",
        ],
      },
      {
        question: "Pourquoi une facture est-elle « En retard » sans que je l'aie changée ?",
        steps: [
          "Le retard est calculé en direct à partir de la date d'échéance, sans bascule manuelle.",
          "Une facture échue non soldée remonte aussi dans « À faire » du tableau de bord et dans la carte « Factures en retard ».",
        ],
      },
    ],
  },
  {
    key: "bpf",
    label: "Bilan (BPF)",
    description: "Le bilan pédagogique et financier, calculé depuis vos données.",
    icon: BarChart3,
    feature: "bpf",
    guides: [
      {
        question: "Comment produire mon BPF ?",
        steps: [
          "Sur Bilan pédagogique et financier, choisissez l'année avec les flèches de navigation.",
          "Tout est calculé à partir de vos sessions, dossiers et factures — il n'y a rien à ressaisir.",
          "Cliquez « Exporter » pour récupérer le document.",
        ],
      },
      {
        question: "Pourquoi ai-je des lignes « Non renseigné » ?",
        steps: [
          "Un apprenant sans catégorie légale tombe en « Non renseigné » : corrigez-le sur son dossier, onglet Info, champ « Catégorie légale de l'apprenant ».",
          "Une facture sans origine de financement fait de même : renseignez-la sur la facture.",
          "Reprenez ces champs avant l'échéance de dépôt plutôt qu'au moment de l'export.",
        ],
      },
    ],
  },
  {
    key: "boite-mail",
    label: "Boîte mail",
    description: "Connecter sa messagerie, trier, rattacher aux contacts.",
    icon: Inbox,
    feature: "inbox",
    guides: [
      {
        question: "Les emails affichés ne sont pas les miens",
        steps: [
          "Tant qu'aucune boîte n'est connectée, Jalon affiche des données de démonstration pour que la page soit lisible — un bandeau le signale.",
          "Connectez votre messagerie sur Intégrations : Google en un clic, ou n'importe quelle autre messagerie via IMAP/SMTP.",
          "Une organisation peut connecter plusieurs boîtes, utile quand plusieurs personnes trient.",
        ],
      },
      {
        question: "Que faire d'un email rattaché à personne ?",
        steps: [
          "Il apparaît dans « À trier ».",
          "« Rattacher » l'associe à un contact existant ; « Nouveau prospect » en crée un, avec la possibilité de pré-remplir téléphone et société à partir du corps du message.",
          "« Ignorer » le retire de la liste sans le supprimer.",
        ],
      },
      {
        question: "Comment répondre depuis Jalon ?",
        steps: [
          "Depuis l'onglet Emails d'un dossier ou d'une fiche client, rédigez votre réponse.",
          "Une aide à la rédaction est disponible selon l'intention (relance commerciale, relance de paiement, relance sur devis, message libre) — le texte proposé est toujours un brouillon à relire.",
          "Votre signature, définie sur Profil, est ajoutée automatiquement en fin de message.",
        ],
      },
    ],
  },
  {
    key: "qualiopi",
    label: "Qualiopi",
    description: "Preuves, indicateurs, audits, non-conformités, veille.",
    icon: ShieldCheck,
    feature: "qualiopi",
    guides: [
      {
        question: "Que veut dire « activité tracée automatiquement » sur un indicateur ?",
        steps: [
          "Jalon rassemble ce que votre activité réelle dans l'outil produit déjà comme matière : recueils reçus, conventions signées, évaluations collectées, délais de traitement des réclamations.",
          "Ces éléments s'affichent sous l'indicateur concerné, dans l'onglet Préparation audit, et sont cliquables.",
          "C'est de la matière première, pas une garantie de conformité : Jalon facilite la preuve, il ne la fabrique jamais. C'est à vous de cocher ce que vous jugez réellement couvert.",
        ],
      },
      {
        question: "Comment préparer concrètement mon audit ?",
        steps: [
          "Onglet Préparation audit : parcourez les indicateurs, cochez ceux dont la preuve est constituée.",
          "« Voir mon résumé personnalisé » explique ce qu'attend un indicateur au regard de votre catalogue et de vos modalités, plutôt que de reprendre le texte générique du référentiel.",
          "Téléchargez le dossier de préparation en PDF quand vous êtes prêt.",
        ],
      },
      {
        question: "Comment suivre un audit et ses non-conformités ?",
        steps: [
          "Onglet Audits : « + Enregistrer un audit » (initial, surveillance, renouvellement, complémentaire).",
          "Ajoutez-y les non-conformités relevées, mineures ou majeures.",
          "Sur chacune : « Marquer l'écart levé », « Solder l'écart (audit suivant) », ou « + Créer une action d'amélioration » — cette dernière crée un risque dans le registre, ce qui relie l'écart à un suivi daté.",
          "Renseignez votre certificat : une alerte se déclenche automatiquement 6 mois avant son expiration.",
        ],
      },
      {
        question: "D'où viennent les suggestions d'amélioration continue ?",
        steps: [
          "Onglet Amélioration continue, bloc « Suggestions ».",
          "Deux sources : les réclamations non encore rattachées à un risque, et la détection de décrochage — au moins deux apprenants bloqués depuis 21 jours ou plus sur la même formation.",
          "« Créer un risque → » ouvre le formulaire prérempli. Ce sont des propositions, jamais des créations automatiques.",
        ],
      },
      {
        question: "Comment tracer ma veille réglementaire ?",
        steps: [
          "Onglet Veille réglementaire, « + Nouvel élément de veille », en choisissant son type : légale et réglementaire, métiers et compétences, innovations pédagogiques, réseaux et partenariats.",
          "Faites-le vivre en renseignant la décision prise, l'action menée et la preuve associée, puis le statut : Identifié, Décision prise, Exploité.",
          "Un élément identifié mais jamais exploité est précisément ce qu'un auditeur relève.",
        ],
      },
    ],
  },
  {
    key: "rgpd",
    label: "RGPD",
    description: "Registre, DPIA, demandes de droits, violations.",
    icon: ScrollText,
    feature: "rgpd",
    guides: [
      {
        question: "Par où commencer sur le registre ?",
        steps: [
          "Onglet Registre des traitements : ajoutez vos traitements un à un.",
          "C'est un préalable technique aux DPIA : tant que le registre est vide, l'onglet DPIA n'offre aucun formulaire, une analyse d'impact devant se rattacher à un traitement existant.",
        ],
      },
      {
        question: "Comment ne pas rater le délai d'une demande de droit ?",
        steps: [
          "Toute demande enregistrée porte une échéance à un mois.",
          "Une demande dont l'échéance est passée reçoit automatiquement la pastille « En retard », et remonte dans « À faire » du tableau de bord ainsi que dans la cloche de notifications.",
          "Assignez-la à quelqu'un et faites évoluer son statut : Ouverte, En cours, Clôturée.",
        ],
      },
      {
        question: "Qu'est-ce qui se passe en cas de violation de données ?",
        steps: [
          "Onglet Violations de données, « + Signaler un incident ».",
          "Une pastille « Notification CNIL en retard » apparaît automatiquement 72 heures après la découverte si l'incident n'est ni notifié ni clôturé — c'est le délai réglementaire.",
          "Marquez ensuite « CNIL notifiée » et « personnes notifiées » au fur et à mesure.",
        ],
      },
    ],
  },
  {
    key: "automatisations",
    label: "Automatisations",
    description: "Relances programmées, formation par formation.",
    icon: Zap,
    feature: "automations",
    guides: [
      {
        question: "Comment créer une relance automatique ?",
        steps: [
          "Depuis la fiche d'une formation (onglet Résumé) ou depuis Automatisations, cliquez « + Ajouter une règle ».",
          "Choisissez le déclencheur : recueil non complété, convention non signée, convocation non envoyée, durée d'accès bientôt expirée, avis de satisfaction non recueilli, rappel de session, attestation bientôt expirée.",
          "Réglez le nombre de jours, puis validez.",
        ],
      },
      {
        question: "Quelle différence entre une règle avec et sans email ?",
        steps: [
          "Sans la case « Envoyer aussi un email automatique à l'apprenant », la règle ne fait que créer une tâche dans « À faire » de votre tableau de bord : c'est vous qui agissez.",
          "Avec la case cochée, l'email part tout seul, avec l'objet et le corps que vous avez rédigés — les balises de fusion comme [Prénom] y sont remplacées.",
          "Les envois automatiques partent une fois par jour et laissent une trace dans l'historique du contact, consultable dans « Activité récente ».",
        ],
      },
      {
        question: "Quelles relances existent sans que je configure quoi que ce soit ?",
        steps: [
          "L'évaluation à chaud part automatiquement dès la fin d'une session à date fixe.",
          "Le tableau de bord signale de lui-même les recueils et conventions manquants, les convocations à envoyer, les apprenants sans activité depuis 14 jours, les factures échues et les échéances RGPD.",
          "Les règles servent à aller au-delà de ce socle, formation par formation.",
        ],
      },
    ],
  },
  {
    key: "documents",
    label: "Modèles de documents",
    description: "Conventions, contrats, attestations et champs de fusion.",
    icon: FileStack,
    feature: "toolkit",
    staffOnly: true,
    guides: [
      {
        question: "Comment partir des modèles fournis ?",
        steps: [
          "Sur Documents, cliquez « Accéder à ma bibliothèque », dépliez un modèle Jalon et cliquez « Adapter ce modèle » : il devient le vôtre, éditable.",
          "Les modèles fournis sont des points de départ génériques — faites-les relire par un juriste avant tout usage réel.",
          "« Générer pour un dossier » produit le document rempli pour un apprenant donné.",
        ],
      },
      {
        question: "Comment marchent les champs de fusion ?",
        steps: [
          "Les champs disponibles sont listés en haut de la page : identité de l'apprenant, données de l'organisme, informations de la formation.",
          "Les données de l'organisme viennent de Profil (forme juridique, capital, adresse, RCS, représentant légal) : sans elles, vos conventions sortiront incomplètes.",
        ],
      },
      {
        question: "Quelle différence entre un modèle général et un modèle de formation ?",
        steps: [
          "Un modèle général s'applique à toutes les formations.",
          "Un modèle rattaché à une formation n'apparaît que pour elle, et se modifie depuis sa fiche, onglet Documents.",
          "Choisissez le rattachement au moment du « + Ajouter votre propre modèle ».",
        ],
      },
    ],
  },
  {
    key: "equipe",
    label: "Équipe & rôles",
    description: "Membres, permissions, sous-traitants, évaluations.",
    icon: UserCog,
    feature: "team",
    guides: [
      {
        question: "Comment inviter un membre et que voit-il ?",
        steps: [
          "Onglet Membres, bloc « Inviter un membre » : nom, email, rôle. L'invitation part par email avec un lien d'activation.",
          "Les rôles disponibles sont Responsable administratif, Commercial, Formateur, Apprenant et DPO externe.",
          "L'onglet Permissions affiche la matrice complète de ce que chaque rôle peut voir. À noter : un commercial ne voit que ses propres opportunités, un formateur que ses propres sessions et dossiers.",
        ],
      },
      {
        question: "À quoi sert la colonne « Pièces manquantes » des sous-traitants ?",
        steps: [
          "Elle se calcule seule selon le type d'intervenant : un formateur externe doit avoir contrat, CV, diplôme, NDA et engagement RNQ ; un sous-traitant pédagogique, contrat et engagement RNQ ; les autres, un contrat.",
          "Un contrat expirant sous 30 jours s'affiche en rouge et remonte dans « À faire ».",
          "C'est ce qu'un auditeur demande à voir sur la sous-traitance — d'où le suivi automatique plutôt qu'un tableur à part.",
        ],
      },
      {
        question: "Comment donner un accès plateforme à un sous-traitant ?",
        steps: [
          "Ouvrez sa fiche depuis l'onglet Sous-traitants & intervenants.",
          "Cliquez « Inviter sur la plateforme » — le bouton exige un email de contact renseigné sur la fiche.",
          "Le compte créé est un compte normal, cloisonné à ses propres sessions : il ne verra rien du reste de votre activité.",
        ],
      },
      {
        question: "Pourquoi dois-je évaluer mes intervenants ?",
        steps: [
          "L'onglet Évaluations liste chaque formateur interne et sous-traitant actif, avec la date de sa dernière évaluation.",
          "Une évaluation datant de plus de 12 mois est signalée « Évaluation à refaire » et remonte dans « À faire ».",
          "C'est un attendu Qualiopi sur la qualification des intervenants ; l'historique est conservé.",
        ],
      },
    ],
  },
  {
    key: "mon-espace",
    label: "Mon espace",
    description: "Suivre sa formation, ses documents, ses attestations.",
    icon: BookOpen,
    feature: "portal",
    learnerOnly: true,
    guides: [
      {
        question: "Comment démarrer ou reprendre ma formation ?",
        steps: [
          "Depuis Mon espace, onglet Parcours, cliquez « Commencer ma formation » ou « Continuer ma formation ».",
          "Vous arrivez sur la liste des modules ; le module en cours est déplié automatiquement.",
          "Une vidéo reprend là où vous l'aviez laissée.",
        ],
      },
      {
        question: "Pourquoi un module est-il verrouillé ?",
        steps: [
          "Les modules se suivent : le suivant se débloque quand le précédent est terminé. Le module verrouillé indique après quoi il s'ouvrira.",
          "Une vidéo, un document ou une page comptent comme terminés une fois lus en entier ; un quiz, une fois réussi.",
          "« Pas encore accessible » signifie que votre organisme ne vous l'a pas encore ouvert — contactez-le si cela bloque.",
        ],
      },
      {
        question: "Dans le Parcours, que veut dire « Administratif » ?",
        steps: [
          "Les étapes Recueil des besoins, Convention signée et Convocation reçue sont gérées par votre organisme : rien ne vous est demandé, elles sont là pour votre information.",
          "Seules les évaluations à chaud et à froid attendent une action de votre part, et uniquement lorsque le lien « Répondre » apparaît.",
        ],
      },
      {
        question: "Comment obtenir mon attestation ?",
        steps: [
          "Terminez tous les modules : le bouton « Obtenir mon attestation de réussite » apparaît alors sur la page de la formation.",
          "Elle reste disponible ensuite dans l'onglet Mes documents.",
        ],
      },
      {
        question: "Comment signer un document ?",
        steps: [
          "Onglet Mes documents : un document en attente affiche un bouton « Signer ».",
          "Si votre organisme utilise un prestataire de signature électronique, la signature se fait plutôt depuis le lien reçu par email — le message vous le précisera.",
        ],
      },
      {
        question: "J'ai besoin d'un aménagement pour suivre la formation",
        steps: [
          "Depuis Aide & demandes, choisissez « Signaler un besoin d'aménagement (situation de handicap) ».",
          "Si votre organisme a désigné un référent handicap, ses coordonnées sont affichées dans Mon espace, sous votre parcours.",
          "Vous pouvez aussi y faire une réclamation, poser une question, ou faire une demande sur vos données personnelles.",
        ],
      },
    ],
  },
];
