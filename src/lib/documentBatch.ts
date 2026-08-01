// Décider qui reçoit quoi, quand un document part.
//
// C'est ici que se joue la promesse du lot 1 : un contrat pour huit
// apprenants produit huit documents distincts liés par un `batchId`, ce qui
// permet ensuite d'afficher « 5/8 signés » sur une seule ligne. Un
// règlement intérieur, lui, reste un seul document envoyé à huit personnes.
//
// La fonction est pure et testée parce qu'elle décide de deux choses qui se
// voient immédiatement chez le client : combien de PDF partent, et à quel
// nom chacun est établi.

import { scopeOfCategory, type DocumentScope } from "./documentScope";

export type Recipient = {
  /** L'identifiant du dossier quand le destinataire est un apprenant inscrit. */
  dossierId: string | null;
  contactId: string | null;
  name: string;
  email: string;
};

export type PlannedDocument = {
  /** Le destinataire dont les données remplissent les jetons. */
  recipient: Recipient;
  /** Les gens à qui l'email part. Toujours au moins le destinataire. */
  to: Recipient[];
  /** Le suffixe de titre : « — Karim Benali », ou rien sur un document commun. */
  titleSuffix: string;
};

export type SendPlan = {
  scope: DocumentScope;
  /** Un exemplaire par entrée. Un seul sur un document commun. */
  documents: PlannedDocument[];
  /** Renseigné seulement quand il y a plusieurs exemplaires à regrouper. */
  batchId: string | null;
};

/**
 * Établit le plan d'envoi.
 *
 * @param batchIdSeed identifiant fourni par l'appelant (jamais tiré au sort
 *   ici, pour que la fonction reste pure et testable à l'identique).
 */
export function planSend(
  category: string,
  recipients: Recipient[],
  batchIdSeed: string,
): SendPlan {
  const scope = scopeOfCategory(category);

  if (scope === "single") {
    // Un seul document, un seul envoi groupé. Le regrouper par batchId
    // n'aurait aucun sens : il n'y a rien à compter, et la ligne ne doit
    // pas se déplier pour montrer un unique membre.
    return {
      scope,
      documents: recipients.length > 0 ? [{ recipient: recipients[0], to: recipients, titleSuffix: "" }] : [],
      batchId: null,
    };
  }

  // Un document par destinataire : chacun porte son nom, chacun se signe
  // séparément, chacun sert de preuve individuelle à l'audit.
  return {
    scope,
    documents: recipients.map((r) => ({ recipient: r, to: [r], titleSuffix: ` — ${r.name}` })),
    // Un seul destinataire ne fait pas un lot : lui coller un batchId
    // afficherait une ligne dépliable pour une personne.
    batchId: recipients.length > 1 ? batchIdSeed : null,
  };
}

/** Les destinataires sans adresse utilisable, à signaler avant l'envoi. */
export function invalidRecipients(recipients: Recipient[]): Recipient[] {
  return recipients.filter((r) => !r.email || !r.email.includes("@"));
}
