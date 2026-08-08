import { z } from "zod";

/**
 * Ce que POST /ateliers et PATCH /ateliers/[atelierId] partagent.
 *
 * Fichier à part et non exports du route.ts voisin : un fichier `route.ts`
 * de l'App Router n'a le droit d'exporter que ses gestionnaires HTTP et sa
 * poignée d'options de configuration — y ajouter un schéma casse la
 * vérification de types du build. La colocalisation d'un module ordinaire
 * dans le dossier de la route, elle, est prévue.
 *
 * Point de vigilance multi-tenant, valable pour les trois routes du dossier :
 * SessionAtelier ne porte PAS d'organizationId. Le cloisonnement passe donc
 * toujours par sa session parente (`session: { organizationId }`), jamais par
 * l'identifiant d'atelier seul — un id emprunté à un autre organisme ne doit
 * rien ouvrir ici.
 */
export const atelierSchema = z.object({
  titre: z.string().trim().min(1, "Le titre est obligatoire.").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  format: z.enum(["IN_PERSON", "REMOTE", "HYBRID"]),
  location: z.string().trim().max(300).nullable().optional(),
  meetingLink: z.string().trim().max(500).nullable().optional(),
  // Facultative : beaucoup d'ateliers n'ont pas de plafond propre, et un
  // nombre inventé fermerait les inscriptions sans raison.
  capacity: z.number().int().positive().max(10_000).nullable().optional(),
});

/** Une chaîne vide venue d'un champ de formulaire vaut « non renseigné ». */
export function videEnNull(valeur: string | null | undefined): string | null {
  if (valeur == null) return null;
  const nettoye = valeur.trim();
  return nettoye === "" ? null : nettoye;
}

/**
 * « meet.google.com/abc » collé depuis un agenda n'est pas une URL absolue :
 * rendu tel quel dans un href, le navigateur le prend pour un chemin relatif
 * et l'apprenant atterrit sur une page introuvable de Jalon. On préfixe
 * plutôt que de refuser la saisie — refuser aurait fait perdre le lien collé.
 */
export function normaliserLien(valeur: string | null): string | null {
  if (!valeur) return null;
  return /^https?:\/\//i.test(valeur) ? valeur : `https://${valeur}`;
}

/**
 * Le lieu et le lien de visio ne coexistent que sur un atelier mixte.
 * Sans cette normalisation, passer un atelier du présentiel au distanciel
 * laisserait derrière lui une adresse de salle que l'écran apprenant
 * afficherait encore — deux informations contradictoires pour un même
 * rendez-vous, et personne pour savoir laquelle croire.
 */
export function lieuSelonFormat(
  format: string,
  location: string | null,
  meetingLink: string | null,
): { location: string | null; meetingLink: string | null } {
  if (format === "IN_PERSON") return { location, meetingLink: null };
  if (format === "REMOTE") return { location: null, meetingLink: normaliserLien(meetingLink) };
  return { location, meetingLink: normaliserLien(meetingLink) };
}
