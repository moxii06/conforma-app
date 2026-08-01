import { describe, expect, it } from "vitest";
import {
  documentBucket,
  groupDocuments,
  isSigned,
  batchProgressLabel,
  pendingMembers,
  type BatchMember,
} from "./documentLifecycle";

// Cette logique décide où l'organisme retrouve — ou ne retrouve pas — un
// contrat. Un document rangé dans le mauvais onglet est un document perdu :
// personne ne va le chercher dans « signés » alors qu'il attend une
// signature.

function doc(over: Partial<BatchMember> = {}): BatchMember {
  return {
    id: "d1",
    title: "Contrat de formation",
    recipientName: "Karim Benali",
    status: "final",
    sentByUserId: null,
    signatureStatus: "none",
    signedAt: null,
    ...over,
  };
}

describe("documentBucket", () => {
  it("range un brouillon dans les brouillons", () => {
    expect(documentBucket(doc({ status: "draft" }))).toBe("draft");
  });

  it("range un document finalisé non envoyé dans les finalisés", () => {
    expect(documentBucket(doc())).toBe("final");
  });

  it("range un document envoyé dans les envoyés", () => {
    expect(documentBucket(doc({ sentByUserId: "u1" }))).toBe("sent");
  });

  it("range un document signé dans les signés, même envoyé", () => {
    expect(documentBucket(doc({ sentByUserId: "u1", signatureStatus: "signed" }))).toBe("signed");
  });

  it("reconnaît une signature papier déclarée à la main", () => {
    // Sans ce chemin, l'onglet « signés » resterait vide chez tout
    // organisme qui fait signer en présentiel — c'est-à-dire la plupart.
    expect(documentBucket(doc({ sentByUserId: "u1", signedAt: new Date("2026-07-30") }))).toBe("signed");
    expect(isSigned(doc({ signedAt: new Date("2026-07-30") }))).toBe(true);
  });

  it("un envoi l'emporte sur un statut resté à brouillon", () => {
    // Cas de données incohérentes : si le document est parti chez le
    // client, le dire « brouillon » serait un mensonge plus grave que
    // l'incohérence elle-même.
    expect(documentBucket(doc({ status: "draft", sentByUserId: "u1" }))).toBe("sent");
  });

  it("chaque document n'appartient qu'à un seul onglet", () => {
    const cas = [
      doc({ status: "draft" }),
      doc(),
      doc({ sentByUserId: "u1" }),
      doc({ sentByUserId: "u1", signatureStatus: "signed" }),
    ];
    expect(new Set(cas.map(documentBucket)).size).toBe(4);
  });
});

describe("groupDocuments", () => {
  const lot = (i: number, over: Partial<BatchMember> = {}) =>
    doc({ id: `d${i}`, batchId: "lot-1", recipientName: `Apprenant ${i}`, sentByUserId: "u1", ...over } as Partial<BatchMember>);

  it("regroupe huit contrats d'un même envoi en une seule ligne", () => {
    const docs = Array.from({ length: 8 }, (_, i) => lot(i));
    const groupes = groupDocuments(docs);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].isBatch).toBe(true);
    expect(groupes[0].members).toHaveLength(8);
  });

  it("laisse un document isolé sur sa propre ligne, sans le déplier", () => {
    const groupes = groupDocuments([doc({ id: "seul" })]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].isBatch).toBe(false);
    expect(batchProgressLabel(groupes[0])).toBeNull();
  });

  it("garde un lot partiellement signé dans « envoyés », pas dans « signés »", () => {
    // LE cas qui motive tout ce fichier. Cinq signés sur huit : ce sont les
    // trois manquants qui demandent une action. Basculer le lot en
    // « signés » dès la première signature cacherait exactement ce qu'on
    // cherche.
    const docs = [
      ...Array.from({ length: 5 }, (_, i) => lot(i, { signatureStatus: "signed" })),
      ...Array.from({ length: 3 }, (_, i) => lot(i + 5)),
    ];
    const [g] = groupDocuments(docs);
    expect(g.bucket).toBe("sent");
    expect(batchProgressLabel(g)).toBe("5/8 signés");
    expect(pendingMembers(g)).toHaveLength(3);
  });

  it("ne bascule le lot en « signés » que lorsque tout le monde a signé", () => {
    const docs = Array.from({ length: 8 }, (_, i) => lot(i, { signatureStatus: "signed" }));
    const [g] = groupDocuments(docs);
    expect(g.bucket).toBe("signed");
    expect(batchProgressLabel(g)).toBe("8/8 signés");
    expect(pendingMembers(g)).toHaveLength(0);
  });

  it("situe un lot sur son membre le moins avancé", () => {
    // Un lot dont un membre est resté brouillon n'est pas « envoyé ».
    const docs = [lot(1, { signatureStatus: "signed" }), lot(2), lot(3, { status: "draft", sentByUserId: null })];
    expect(groupDocuments(docs)[0].bucket).toBe("draft");
  });

  it("sépare deux lots distincts", () => {
    const groupes = groupDocuments([
      doc({ id: "a", batchId: "lot-1" } as Partial<BatchMember>),
      doc({ id: "b", batchId: "lot-2" } as Partial<BatchMember>),
      doc({ id: "c" }),
    ]);
    expect(groupes).toHaveLength(3);
  });

  it("ne perd aucun document au regroupement", () => {
    const docs = [
      ...Array.from({ length: 8 }, (_, i) => lot(i)),
      doc({ id: "seul-1" }),
      doc({ id: "seul-2", status: "draft" }),
    ];
    const total = groupDocuments(docs).reduce((n, g) => n + g.members.length, 0);
    expect(total).toBe(docs.length);
  });
});
