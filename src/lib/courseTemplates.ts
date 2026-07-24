// Client feedback: not every course an OFP runs is bespoke — a lot of them
// are the same handful of standard topics (SST, RGPD, management de base…)
// every training org ends up offering sooner or later. Rather than typing
// title/description/duration from scratch each time, CreateCourseForm lets
// staff pick a starting point from this curated list, grouped by secteur,
// the same three fields the "importer un document" flow also pre-fills —
// just a static pick instead of an AI extraction, so it's instant and free.
export type CourseTemplate = {
  id: string;
  sector: string;
  title: string;
  description: string;
  durationHours: number;
};

export const COURSE_TEMPLATES: CourseTemplate[] = [
  {
    id: "sst-incendie",
    sector: "Sécurité & prévention",
    title: "Sécurité incendie et évacuation",
    description:
      "Reconnaître les classes de feu, utiliser un extincteur et appliquer les consignes d'évacuation. Formation obligatoire pour les équipiers de première intervention.",
    durationHours: 7,
  },
  {
    id: "sst-secourisme",
    sector: "Sécurité & prévention",
    title: "Sauveteur secouriste du travail (SST)",
    description:
      "Protéger, alerter et secourir une victime en milieu professionnel jusqu'à l'arrivée des secours. Prépare à la certification SST de l'INRS.",
    durationHours: 14,
  },
  {
    id: "sst-tms",
    sector: "Sécurité & prévention",
    title: "Gestes et postures — prévention des TMS",
    description:
      "Identifier les situations à risque de troubles musculo-squelettiques et adopter les bons gestes de manutention au poste de travail.",
    durationHours: 7,
  },
  {
    id: "bureau-excel-init",
    sector: "Bureautique & numérique",
    title: "Excel — niveau initiation",
    description:
      "Prendre en main les fonctions de base d'Excel : mise en forme, formules simples, tris et filtres, création de graphiques.",
    durationHours: 14,
  },
  {
    id: "bureau-excel-avance",
    sector: "Bureautique & numérique",
    title: "Excel — niveau avancé",
    description:
      "Tableaux croisés dynamiques, fonctions de recherche (RECHERCHEV/INDEX-EQUIV), macros simples et mise en forme conditionnelle.",
    durationHours: 14,
  },
  {
    id: "bureau-cyber",
    sector: "Bureautique & numérique",
    title: "Sensibilisation à la cybersécurité en entreprise",
    description:
      "Reconnaître les tentatives de phishing, appliquer les bonnes pratiques de mot de passe et adopter les réflexes de sécurité au quotidien.",
    durationHours: 7,
  },
  {
    id: "management-fondamentaux",
    sector: "Management & RH",
    title: "Management d'équipe — les fondamentaux",
    description:
      "Poser un cadre, déléguer, motiver et donner un feedback constructif. Destinée aux managers nouvellement en poste.",
    durationHours: 14,
  },
  {
    id: "management-entretien",
    sector: "Management & RH",
    title: "Conduite de l'entretien annuel",
    description:
      "Préparer, mener et formaliser un entretien annuel d'évaluation : fixer des objectifs, donner un retour constructif, gérer les situations délicates.",
    durationHours: 7,
  },
  {
    id: "management-conflits",
    sector: "Management & RH",
    title: "Gestion des conflits en entreprise",
    description:
      "Identifier les sources de tension, désamorcer un conflit et instaurer une communication constructive au sein d'une équipe.",
    durationHours: 7,
  },
  {
    id: "conformite-rgpd",
    sector: "Réglementaire & conformité",
    title: "Sensibilisation RGPD en entreprise",
    description:
      "Comprendre les obligations du RGPD au quotidien : traitement des données personnelles, droits des personnes, réflexes en cas d'incident.",
    durationHours: 7,
  },
  {
    id: "conformite-harcelement",
    sector: "Réglementaire & conformité",
    title: "Non-discrimination et lutte contre le harcèlement",
    description:
      "Identifier les situations de discrimination et de harcèlement au travail, connaître le cadre légal et les procédures de signalement.",
    durationHours: 7,
  },
  {
    id: "conformite-handicap",
    sector: "Réglementaire & conformité",
    title: "Accessibilité et handicap au travail",
    description:
      "Sensibiliser aux différentes formes de handicap et aux bonnes pratiques d'accueil et d'aménagement en entreprise.",
    durationHours: 3,
  },
  {
    id: "commercial-vente",
    sector: "Commercial & relation client",
    title: "Techniques de vente",
    description:
      "Structurer un entretien de vente, traiter les objections et conclure efficacement. Mises en situation pratiques incluses.",
    durationHours: 14,
  },
  {
    id: "commercial-reclamations",
    sector: "Commercial & relation client",
    title: "Relation client et gestion des réclamations",
    description:
      "Adopter la posture adaptée face à un client mécontent, désamorcer une réclamation et transformer une insatisfaction en fidélisation.",
    durationHours: 7,
  },
  {
    id: "langues-anglais-pro",
    sector: "Langues",
    title: "Anglais professionnel — niveau intermédiaire",
    description:
      "Renforcer l'aisance à l'oral et à l'écrit en contexte professionnel : réunions, emails, présentations. Niveau visé B1-B2.",
    durationHours: 30,
  },
];

export const COURSE_TEMPLATE_SECTORS: string[] = Array.from(new Set(COURSE_TEMPLATES.map((t) => t.sector)));
