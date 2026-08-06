/**
 * L'ossature d'un document Jalon : en-tête, titre encadré, pied de page.
 *
 * Ce qui est ici n'est PAS saisi par l'organisme — c'est reconstitué à
 * chaque génération depuis sa fiche. Deux raisons de ne pas le laisser dans
 * le corps du modèle :
 *
 *   — le numéro de déclaration d'activité est obligatoire sur les documents
 *     de l'organisme (art. L.6352-12 du code du travail) ; le laisser à la
 *     charge de qui rédige, c'est le voir manquer un jour ;
 *   — un organisme qui déménage corrige sa fiche, pas ses trente modèles.
 *
 * Module pur : aucun accès à Prisma, testable sans base. L'appelant charge
 * l'identité et la passe.
 */

export type IdentiteOrganisme = {
  nom: string;
  logoUrl: string | null;
  formeJuridique: string | null;
  adresseLegale: string | null;
  siret: string | null;
  numeroDeclarationActivite: string | null;
  prefectureRegion: string | null;
  telephone: string | null;
  email: string | null;
};

/** Le libellé d'une donnée absente : rien, jamais « null » ni un blanc. */
function nonVide(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Les lignes d'identité de l'en-tête, à côté du logo.
 *
 * Trois lignes au plus : un en-tête qui déborde repousse le contrat d'une
 * page. Le nom est toujours là ; le reste n'apparaît que s'il est renseigné.
 */
export function lignesEnTete(o: IdentiteOrganisme): string[] {
  const lignes: string[] = [];
  const identite = [nonVide(o.nom), nonVide(o.formeJuridique)].filter(Boolean).join(" — ");
  if (identite) lignes.push(identite);
  const adresse = nonVide(o.adresseLegale);
  if (adresse) lignes.push(adresse.replace(/\s*\n\s*/g, ", "));
  const contact = [nonVide(o.telephone), nonVide(o.email)].filter(Boolean).join(" · ");
  if (contact) lignes.push(contact);
  return lignes;
}

/**
 * La ligne de mentions légales du pied de page, répétée sur chaque page.
 *
 * L'article L.6352-12 impose que le numéro de déclaration d'activité figure
 * sur les documents de l'organisme, ET que sa mention soit accompagnée de la
 * précision qu'il ne vaut pas agrément de l'État — sans quoi la mention
 * elle-même devient trompeuse. Les deux vont donc ensemble, ici, dans la
 * même chaîne : on ne peut pas en afficher une sans l'autre.
 */
export function mentionPiedDePage(o: IdentiteOrganisme): string {
  const morceaux: string[] = [];
  const nom = nonVide(o.nom);
  if (nom) morceaux.push(nom);
  const siret = nonVide(o.siret);
  if (siret) morceaux.push(`SIRET ${siret}`);
  const nda = nonVide(o.numeroDeclarationActivite);
  if (nda) {
    const prefecture = nonVide(o.prefectureRegion);
    morceaux.push(
      `Déclaration d'activité n° ${nda}${prefecture ? ` auprès du préfet de la région ${prefecture}` : ""} — cet enregistrement ne vaut pas agrément de l'État`,
    );
  }
  return morceaux.join(" · ");
}

/** « Page 2 sur 7 ». Séparé pour que la formulation existe en un seul endroit. */
export function numeroDePage(page: number, total: number): string {
  return `Page ${page} sur ${total}`;
}

/**
 * Y a-t-il de quoi dessiner un en-tête ?
 *
 * Un organisme qui n'a rempli ni logo ni adresse ne doit pas recevoir un
 * cadre vide en haut de son contrat : mieux vaut pas d'en-tête du tout.
 */
export function aUnEnTete(o: IdentiteOrganisme): boolean {
  return Boolean(nonVide(o.logoUrl)) || lignesEnTete(o).length > 0;
}
