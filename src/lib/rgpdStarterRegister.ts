import type { LegalBasisKey } from "./rgpdLegalBases";

// Le registre type d'un organisme de formation.
//
// L'onglet Registre s'ouvrait sur « Aucun traitement enregistré » et un
// formulaire à quatre champs vides. Or les traitements d'un OF sont, à peu
// de chose près, toujours les mêmes : on inscrit des apprenants, on les fait
// émarger, on facture, on mesure la satisfaction parce que Qualiopi
// l'exige. Demander à chacun de les redécouvrir devant une page blanche,
// c'est garantir un registre incomplet — et un registre incomplet est une
// non-conformité à l'article 30, pas un détail de confort.
//
// Ce catalogue vit en TypeScript et non en base : ce ne sont pas des
// données de l'organisme tant qu'il ne les a pas installées. Une fois
// installées, ce sont ses lignes, qu'il modifie et supprime librement.

export type StarterProcessing = {
  name: string;
  /** Article 30(1)(b) — pourquoi on traite ces données. */
  purpose: string;
  legalBasis: LegalBasisKey;
  /** Article 30(1)(c) — de qui parle-t-on. */
  dataSubjects: string;
  /** Article 30(1)(c) — quelles données. */
  dataCategories: string;
  /** Article 30(1)(d) — qui y a accès en dehors de l'organisme. */
  recipients: string;
  retentionPeriod: string;
  /** Passe la ligne en « à revoir » : elle demande une décision de l'organisme. */
  needsReview?: boolean;
  /** Pourquoi elle demande une décision. */
  reviewNote?: string;
};

export const STARTER_REGISTER_NOTICE =
  "Registre type fourni par Jalon, à adapter à votre organisme avant tout usage réel : " +
  "vos finalités, vos destinataires et vos durées peuvent différer.";

export const STARTER_REGISTER: StarterProcessing[] = [
  {
    name: "Gestion des inscriptions et des dossiers de formation",
    purpose:
      "Inscrire les stagiaires, exécuter la formation, produire les documents contractuels et pédagogiques.",
    legalBasis: "contract",
    dataSubjects: "Stagiaires, et le cas échéant leur employeur",
    dataCategories: "Identité, coordonnées, situation professionnelle, parcours de formation",
    recipients: "Formateurs affectés, financeur en cas de prise en charge",
    retentionPeriod: "5 ans après la fin de la formation",
  },
  {
    name: "Émargement et suivi de l'assiduité",
    purpose:
      "Prouver la réalité de l'exécution de la formation auprès des financeurs et de l'auditeur Qualiopi.",
    legalBasis: "legal_obligation",
    dataSubjects: "Stagiaires, formateurs",
    dataCategories: "Identité, présence par demi-journée, signature manuscrite ou électronique",
    recipients: "Financeurs, organisme certificateur en cas d'audit",
    retentionPeriod: "5 ans, porté à 10 ans en cas de financement public",
  },
  {
    name: "Facturation et comptabilité",
    purpose: "Établir les devis et factures, encaisser, tenir la comptabilité.",
    legalBasis: "legal_obligation",
    dataSubjects: "Clients, stagiaires payeurs, financeurs",
    dataCategories: "Identité, coordonnées, coordonnées de facturation, montants et règlements",
    recipients: "Expert-comptable, administration fiscale, prestataire de paiement",
    retentionPeriod: "10 ans (article L. 123-22 du code de commerce)",
  },
  {
    name: "Prospection commerciale et suivi des prospects",
    purpose: "Répondre aux demandes d'information et proposer des formations aux prospects.",
    legalBasis: "legitimate_interest",
    dataSubjects: "Prospects, contacts en entreprise",
    dataCategories: "Identité professionnelle, coordonnées, échanges, besoins exprimés",
    recipients: "Équipe commerciale, outil d'emailing",
    retentionPeriod: "3 ans à compter du dernier contact",
    needsReview: true,
    reviewNote:
      "L'intérêt légitime doit être documenté par une mise en balance écrite, et la prospection par email vers des particuliers suppose leur consentement.",
  },
  {
    name: "Évaluation de la satisfaction et de la qualité",
    purpose:
      "Recueillir les avis à chaud et à froid, mesurer les résultats, alimenter l'amélioration continue exigée par le référentiel qualité.",
    legalBasis: "legal_obligation",
    dataSubjects: "Stagiaires, entreprises clientes, formateurs",
    dataCategories: "Identité, réponses aux questionnaires, appréciations libres",
    recipients: "Organisme certificateur en cas d'audit",
    retentionPeriod: "3 ans, ou la durée du cycle de certification",
  },
  {
    name: "Accès à la plateforme et suivi de progression e-learning",
    purpose:
      "Donner accès aux contenus en ligne, suivre l'avancement et délivrer les attestations de réussite.",
    legalBasis: "contract",
    dataSubjects: "Stagiaires",
    dataCategories:
      "Identifiants de connexion, dates et durées de consultation, progression, résultats aux quiz",
    recipients: "Hébergeur de la plateforme",
    retentionPeriod: "Durée de la formation, puis 5 ans pour les preuves de réussite",
  },
  {
    name: "Prise en compte des situations de handicap",
    purpose:
      "Adapter les modalités de formation aux besoins exprimés et permettre au référent handicap de proposer des aménagements.",
    legalBasis: "consent",
    dataSubjects: "Stagiaires en ayant fait la demande",
    dataCategories:
      "Besoins d'aménagement déclarés — données de santé au sens de l'article 9, transmises librement par la personne",
    recipients: "Référent handicap uniquement",
    retentionPeriod: "Durée de la formation, puis suppression",
    needsReview: true,
    reviewNote:
      "Données sensibles (article 9) : accès à restreindre au seul référent handicap, consentement explicite à conserver, et aucune conservation au-delà de la formation.",
  },
  {
    name: "Gestion des formateurs, intervenants et sous-traitants",
    purpose:
      "Contractualiser avec les intervenants, vérifier leurs qualifications et les évaluer périodiquement.",
    legalBasis: "contract",
    dataSubjects: "Formateurs salariés, intervenants indépendants, sous-traitants",
    dataCategories: "Identité, coordonnées, SIRET, diplômes et certifications, évaluations",
    recipients: "Organisme certificateur en cas d'audit",
    retentionPeriod: "Durée de la relation, puis 5 ans",
  },
  {
    name: "Gestion des réclamations et des signalements",
    purpose: "Recevoir, instruire et tracer les réclamations, y compris les signalements confidentiels.",
    legalBasis: "legal_obligation",
    dataSubjects: "Stagiaires, entreprises clientes, formateurs, tiers",
    dataCategories: "Identité (sauf signalement anonyme), objet de la réclamation, suites données",
    recipients: "Direction, organisme certificateur en cas d'audit",
    retentionPeriod: "5 ans après la clôture",
  },
  {
    name: "Réponse aux demandes d'exercice des droits",
    purpose:
      "Instruire les demandes d'accès, de rectification, d'effacement et de portabilité, et en conserver la trace.",
    legalBasis: "legal_obligation",
    dataSubjects: "Toute personne exerçant ses droits",
    dataCategories: "Identité, nature de la demande, réponse apportée et sa date",
    recipients: "CNIL en cas de contrôle",
    retentionPeriod: "5 ans après la réponse",
  },
];

/** Les sous-traitants qu'un organisme utilisant Jalon a nécessairement. */
export const STARTER_SUB_PROCESSORS: { name: string; role: string; location: string }[] = [
  { name: "Jalon", role: "Éditeur de la plateforme de gestion", location: "France" },
  { name: "Hébergeur de la plateforme", role: "Hébergement des données", location: "France" },
  { name: "Prestataire d'emailing", role: "Envoi des emails transactionnels", location: "Union européenne" },
];
