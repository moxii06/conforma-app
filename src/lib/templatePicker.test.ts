import { describe, it, expect } from "vitest";
import {
  grouperModeles,
  libelleEntree,
  LIBELLE_GROUPE,
  MENTION_DEJA_ADAPTE,
  type ModeleChoisissable,
} from "./templatePicker";

function modele(over: Partial<ModeleChoisissable> & { id: string }): ModeleChoisissable {
  return {
    title: "Contrat de formation professionnelle (particulier)",
    category: "contrat_formation",
    organizationId: null,
    forkedFromId: null,
    ...over,
  };
}

describe("grouperModeles", () => {
  it("range les modèles de l'organisme avant ceux de Jalon", () => {
    const groupes = grouperModeles([
      modele({ id: "jalon-1" }),
      modele({ id: "org-1", organizationId: "org" }),
    ]);
    expect(groupes.map((g) => g.cle)).toEqual(["organisation", "jalon"]);
    expect(groupes[0].label).toBe(LIBELLE_GROUPE.organisation);
  });

  it("signale l'original Jalon dont l'organisme détient une copie", () => {
    const groupes = grouperModeles([
      modele({ id: "jalon-1" }),
      modele({ id: "copie", organizationId: "org", forkedFromId: "jalon-1" }),
    ]);
    const jalon = groupes.find((g) => g.cle === "jalon")!;
    expect(jalon.entrees[0].dejaAdapte).toBe(true);
    // La copie elle-même n'est jamais marquée : elle est déjà rangée dans
    // « Mes modèles », la mention n'y apprendrait rien.
    const org = groupes.find((g) => g.cle === "organisation")!;
    expect(org.entrees[0].dejaAdapte).toBe(false);
  });

  it("ne signale pas un modèle Jalon qu'aucune copie ne vise", () => {
    const groupes = grouperModeles([
      modele({ id: "jalon-1" }),
      modele({ id: "jalon-2", title: "Convocation", category: "convocation" }),
      modele({ id: "copie", organizationId: "org", forkedFromId: "jalon-1" }),
    ]);
    const jalon = groupes.find((g) => g.cle === "jalon")!;
    expect(jalon.entrees.find((e) => e.modele.id === "jalon-2")!.dejaAdapte).toBe(false);
  });

  it("garde les deux lignes — la distinction est rendue lisible, rien n'est retiré", () => {
    const groupes = grouperModeles([
      modele({ id: "jalon-1" }),
      modele({ id: "copie", organizationId: "org", forkedFromId: "jalon-1" }),
    ]);
    expect(groupes.flatMap((g) => g.entrees).length).toBe(2);
  });

  it("écarte les doublons d'identifiant en gardant le premier vu", () => {
    // Le cas réel : la liste serveur et celle du panneau bibliothèque se
    // recouvrent quand l'utilisateur choisit un modèle déjà présent.
    const groupes = grouperModeles([
      modele({ id: "jalon-1", title: "Depuis le serveur" }),
      modele({ id: "jalon-1", title: "Depuis le panneau" }),
    ]);
    const entrees = groupes.flatMap((g) => g.entrees);
    expect(entrees).toHaveLength(1);
    expect(entrees[0].modele.title).toBe("Depuis le serveur");
  });

  it("ne retourne pas de groupe vide", () => {
    const groupes = grouperModeles([modele({ id: "jalon-1" })]);
    expect(groupes.map((g) => g.cle)).toEqual(["jalon"]);
  });

  it("rend une liste vide sur une entrée vide", () => {
    expect(grouperModeles([])).toEqual([]);
  });

  it("ignore un forkedFromId porté par un modèle Jalon", () => {
    // Ne devrait pas exister, mais un modèle global marqué comme copie ne
    // doit pas faire signaler un autre modèle global comme déjà adapté.
    const groupes = grouperModeles([
      modele({ id: "jalon-1" }),
      modele({ id: "jalon-2", forkedFromId: "jalon-1" }),
    ]);
    const jalon = groupes.find((g) => g.cle === "jalon")!;
    expect(jalon.entrees.every((e) => !e.dejaAdapte)).toBe(true);
  });

  it("préserve l'ordre reçu à l'intérieur d'un groupe", () => {
    const groupes = grouperModeles([
      modele({ id: "a", title: "Attestation", organizationId: "org" }),
      modele({ id: "b", title: "Bilan", organizationId: "org" }),
      modele({ id: "c", title: "Convocation", organizationId: "org" }),
    ]);
    expect(groupes[0].entrees.map((e) => e.modele.title)).toEqual(["Attestation", "Bilan", "Convocation"]);
  });
});

describe("libelleEntree", () => {
  it("compose catégorie et titre", () => {
    const entree = { modele: modele({ id: "x", title: "Convocation" }), dejaAdapte: false };
    expect(libelleEntree(entree, "Convocation")).toBe("Convocation — Convocation");
  });

  it("ajoute la mention quand le modèle est déjà adapté", () => {
    const entree = { modele: modele({ id: "x", title: "Contrat" }), dejaAdapte: true };
    expect(libelleEntree(entree, "Contrat de formation")).toBe(
      `Contrat de formation — Contrat (${MENTION_DEJA_ADAPTE})`,
    );
  });
});
