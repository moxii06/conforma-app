import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";

/**
 * Le nom français de chaque balise, et la famille à laquelle elle appartient.
 *
 * L'éditeur affichait les 59 clés brutes, à plat, par ordre alphabétique :
 * un mur de pastilles qui remplissait l'écran, où « company.name » et
 * « organization.name » se ressemblaient assez pour qu'on se trompe — et se
 * tromper là, c'est mettre le nom de l'organisme de formation à l'endroit où
 * doit figurer celui de l'entreprise cliente, dans un contrat signé.
 *
 * La famille vient du préfixe technique, mais son libellé, lui, est écrit ici
 * en toutes lettres : « organization » et « company » désignent deux parties
 * au contrat, pas deux tables.
 */
export type FamilleBalise = {
  /** Le préfixe technique, tel qu'il apparaît dans la clé. */
  prefixe: string;
  /** Ce que la famille désigne, du point de vue de qui rédige. */
  titre: string;
  /** Une ligne pour lever l'ambiguïté quand elle existe. */
  precision?: string;
};

export const FAMILLES: FamilleBalise[] = [
  { prefixe: "contact", titre: "L'apprenant", precision: "La personne qui suit la formation." },
  { prefixe: "company", titre: "L'entreprise cliente", precision: "Celle qui paie, quand ce n'est pas l'apprenant lui-même." },
  { prefixe: "organization", titre: "Votre organisme", precision: "Vos propres mentions légales." },
  { prefixe: "course", titre: "La formation" },
  { prefixe: "session", titre: "La session" },
  { prefixe: "funding", titre: "Le financement" },
  { prefixe: "funder", titre: "Le financeur" },
  { prefixe: "contract", titre: "Le contrat" },
  { prefixe: "subcontractor", titre: "Le prestataire externe" },
  { prefixe: "dossier", titre: "Le dossier" },
  { prefixe: "", titre: "Divers" },
];

/**
 * Le libellé français de chaque clé.
 *
 * Écrit à la main plutôt que dérivé du nom technique : « rcsCity » ne se
 * traduit pas tout seul en « Ville du greffe », et c'est précisément ce genre
 * de champ que personne ne sait remplir sans son vrai nom. Un test vérifie
 * que la table couvre exactement AVAILABLE_MERGE_FIELDS — la liste des
 * balises est dérivée du résolveur, donc en ajouter une sans la nommer ici
 * casserait la suite plutôt que d'afficher une clé brute en production.
 */
export const LIBELLES: Record<string, string> = {
  "contact.firstName": "Prénom",
  "contact.lastName": "Nom",
  "contact.email": "Email",
  "contact.phone": "Téléphone",
  "contact.address": "Adresse",
  "contact.birthDate": "Date de naissance",

  "company.name": "Raison sociale",
  "company.siret": "SIRET",
  "company.address": "Adresse",
  "company.legalRepresentativeName": "Représentant légal",

  "organization.name": "Nom",
  "organization.legalForm": "Forme juridique",
  "organization.legalAddress": "Siège social",
  "organization.siret": "SIRET",
  "organization.shareCapital": "Capital social",
  "organization.rcsCity": "Ville du greffe (RCS)",
  "organization.rcsNumber": "Numéro RCS",
  "organization.legalRepresentativeName": "Représentant légal",
  "organization.activityDeclarationNumber": "Numéro de déclaration d'activité",
  "organization.regionPrefecture": "Préfecture de région",
  "organization.publicContactEmail": "Email de contact",
  "organization.publicContactPhone": "Téléphone de contact",
  "organization.referentHandicapName": "Référent handicap",
  "organization.mediatorName": "Médiateur de la consommation",
  "organization.mediatorContact": "Coordonnées du médiateur",

  "course.title": "Intitulé",
  "course.description": "Description",
  "course.objectives": "Objectifs pédagogiques",
  "course.prerequisites": "Prérequis",
  "course.duration": "Durée",
  "course.price": "Prix",
  "course.maxLearners": "Nombre de places",
  "course.accessDelay": "Délai d'accès",
  "course.accessModalities": "Modalités d'accès",
  "course.teachingMethods": "Méthodes mobilisées",
  "course.evaluationModalities": "Modalités d'évaluation",
  "course.certificationName": "Certification visée",
  "course.certificationCode": "Code RS / RNCP",
  "course.certificationRegistry": "Répertoire (RS ou RNCP)",
  "course.certifierName": "Certificateur",
  "course.retakeConditions": "Conditions de rattrapage",

  "session.courseTitle": "Formation concernée",
  "session.startsAt": "Date et heure de début",
  "session.endsAt": "Date et heure de fin",
  "session.location": "Lieu",
  "session.meetingLink": "Lien de visioconférence",

  "funding.total": "Montant total",
  "funding.cap30": "Acompte de 30 %",
  "funding.remainder": "Solde restant dû",
  "funder.name": "Nom du financeur",

  "contract.cancellationFeeAmount": "Dédit — montant",
  "contract.cancellationFeePercent": "Dédit — pourcentage",

  "subcontractor.name": "Nom",
  "subcontractor.siret": "SIRET",
  "subcontractor.address": "Adresse",
  "subcontractor.contractStartDate": "Début du contrat",
  "subcontractor.contractEndDate": "Fin du contrat",

  "dossier.retentionUntil": "Conservation des données jusqu'au",

  today: "Date du jour",
};

export type BaliseClassee = { cle: string; tag: string; libelle: string };
export type GroupeBalises = { famille: FamilleBalise; balises: BaliseClassee[] };

/** Le préfixe d'une clé, ou la chaîne vide si elle n'en a pas (« today »). */
export function prefixeDe(cle: string): string {
  const point = cle.indexOf(".");
  return point === -1 ? "" : cle.slice(0, point);
}

/** Le libellé lisible d'une clé — sa clé brute en dernier recours. */
export function libelleDe(cle: string): string {
  return LIBELLES[cle] ?? cle;
}

/**
 * Les balises regroupées par famille, dans l'ordre de FAMILLES et non dans
 * l'ordre alphabétique : on cherche « la date de la session », pas un mot
 * commençant par S. Une famille sans balise n'est pas rendue.
 *
 * `recherche` filtre sur le libellé français ET sur la clé technique : les
 * deux sont des façons légitimes de chercher, et quelqu'un qui connaît déjà
 * `{{course.price}}` ne doit pas avoir à deviner qu'on l'appelle « Prix ».
 */
export function grouperBalises(cles: string[], recherche = ""): GroupeBalises[] {
  const q = recherche.trim().toLowerCase();
  const retenues = q
    ? cles.filter((c) => libelleDe(c).toLowerCase().includes(q) || c.toLowerCase().includes(q))
    : cles;

  return FAMILLES.map((famille) => ({
    famille,
    balises: retenues
      .filter((c) => prefixeDe(c) === famille.prefixe)
      .map((cle) => ({ cle, tag: `{{${cle}}}`, libelle: libelleDe(cle) })),
  })).filter((g) => g.balises.length > 0);
}

/** Toutes les balises connues, groupées — le cas par défaut de l'éditeur. */
export function toutesLesBalisesGroupees(recherche = ""): GroupeBalises[] {
  return grouperBalises(AVAILABLE_MERGE_FIELDS, recherche);
}
