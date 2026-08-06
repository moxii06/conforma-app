// Où vit un document dans l'espace Documents, et comment les documents
// nés d'une même action se regroupent.
//
// Quatre onglets — brouillons, finalisés, envoyés, signés — mais un seul
// champ nouveau en base (`status`, qui vaut "draft" ou "final"). Les deux
// derniers états se déduisent de ce qui existait déjà : `sentByUserId` dit
// qu'un envoi a eu lieu, `signatureStatus`/`signedAt` disent qu'une
// signature est acquise. Les recopier dans `status` créerait deux vérités
// sur un même fait, et c'est toujours la copie qui finit par mentir.
//
// Un document appartient à exactement UN onglet. La somme des quatre
// compteurs fait donc le total, ce qui est la moindre des choses pour
// quelqu'un qui cherche un document et ne sait plus où il l'a laissé.

export type DocumentBucket = "draft" | "final" | "sent" | "signed";

export const DOCUMENT_BUCKETS: { key: DocumentBucket; label: string; hint: string }[] = [
  { key: "draft", label: "Mes brouillons", hint: "En cours de rédaction. Modifiables, jamais envoyés." },
  { key: "final", label: "Mes documents finalisés", hint: "Prêts à partir. Un document finalisé n'est plus modifiable." },
  { key: "sent", label: "Mes documents envoyés", hint: "Partis chez le destinataire. En attente de signature s'il y a lieu." },
  { key: "signed", label: "Mes documents signés", hint: "Signés électroniquement, ou marqués comme signés après retour papier." },
];

/** Ce dont on a besoin pour situer un document. Volontairement minimal. */
export type LifecycleInput = {
  status: string;
  sentByUserId: string | null;
  signatureStatus: string;
  signedAt: Date | null;
};

/**
 * Un document est signé dès que la preuve existe, quel que soit le chemin.
 *
 * Deux chemins mènent ici et un seul est automatique : le webhook Yousign
 * pose `signatureStatus = "signed"` tout seul, tandis qu'un contrat signé
 * en présentiel n'émet aucun événement numérique — quelqu'un doit le
 * déclarer, ce qui pose `signedAt`. Tester les deux, c'est ce qui évite que
 * l'onglet reste désespérément vide chez un organisme qui signe sur papier.
 */
export function isSigned(doc: LifecycleInput): boolean {
  return doc.signatureStatus === "signed" || doc.signedAt !== null;
}

export function documentBucket(doc: LifecycleInput): DocumentBucket {
  if (isSigned(doc)) return "signed";
  if (doc.sentByUserId !== null) return "sent";
  if (doc.status === "draft") return "draft";
  return "final";
}

/** L'ordre d'avancement. Sert à situer un lot sur son membre le moins avancé. */
const RANG: Record<DocumentBucket, number> = { draft: 0, final: 1, sent: 2, signed: 3 };

export type BatchMember = LifecycleInput & { id: string; title: string; recipientName: string | null };

// Générique sur le membre : l'appelant y attache ce dont il a besoin (la
// ligne Prisma complète, la formation, la catégorie) et le récupère tel quel
// à la sortie. Sans ça, chaque appelant devait recaster ses membres après
// coup — un `as` par écran, dont aucun n'était vérifié par le compilateur.
export type DocumentGroup<T extends BatchMember = BatchMember> = {
  /** L'identifiant du lot, ou celui du document quand il est isolé. */
  key: string;
  title: string;
  bucket: DocumentBucket;
  members: T[];
  /** Nombre de membres signés — le « 5 » de « 5/8 signés ». */
  signedCount: number;
  /** Vrai dès qu'il y a plus d'un membre : la ligne se déplie. */
  isBatch: boolean;
};

/**
 * Regroupe les documents par lot, et situe chaque lot.
 *
 * **Un lot se range sur son membre le moins avancé.** Huit contrats dont
 * cinq sont signés restent dans « envoyés », affichés « 5/8 signés » : ce
 * sont les trois manquants qui demandent une action, et les faire
 * disparaître dans l'onglet « signés » dès la première signature reviendrait
 * à cacher précisément ce qu'on cherche. Le lot ne bascule en « signés »
 * que lorsque tout le monde a signé — et à ce moment-là, il n'y a plus rien
 * à faire, ce qui est bien le sens de cet onglet.
 */
export function groupDocuments<T extends BatchMember>(docs: T[]): DocumentGroup<T>[] {
  const parLot = new Map<string, T[]>();
  for (const d of docs) {
    // Un document sans batchId est son propre lot d'un seul membre : le
    // reste du code n'a alors pas à distinguer les deux cas.
    const cle = batchKeyOf(d);
    const liste = parLot.get(cle) ?? [];
    liste.push(d);
    parLot.set(cle, liste);
  }

  const groupes: DocumentGroup<T>[] = [];
  for (const [key, members] of parLot) {
    const bucket = members.reduce<DocumentBucket>((moinsAvance, m) => {
      const b = documentBucket(m);
      return RANG[b] < RANG[moinsAvance] ? b : moinsAvance;
    }, "signed");
    groupes.push({
      key,
      title: members[0].title,
      bucket,
      members,
      signedCount: members.filter(isSigned).length,
      isBatch: members.length > 1,
    });
  }
  return groupes;
}

/** Exposé pour que l'appelant puisse regrouper sans dupliquer la règle. */
export function batchKeyOf(doc: { id: string; batchId?: string | null }): string {
  return doc.batchId ?? `solo:${doc.id}`;
}

/** « 5/8 signés », ou null quand il n'y a rien à compter. */
export function batchProgressLabel(groupe: DocumentGroup): string | null {
  if (!groupe.isBatch) return null;
  return `${groupe.signedCount}/${groupe.members.length} signés`;
}

/** Les membres qu'il reste à relancer, dans l'ordre d'affichage. */
export function pendingMembers<T extends BatchMember>(groupe: DocumentGroup<T>): T[] {
  return groupe.members.filter((m) => !isSigned(m));
}
