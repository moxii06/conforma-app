import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MIN_RECHERCHE,
  MAX_AUTRES_CONTACTS_AFFICHES,
  filtreRecherche,
  mentionTroncature,
} from "./recipientSearch";

describe("filtreRecherche", () => {
  it("cherche sur le prénom, le nom et l'email", () => {
    const f = filtreRecherche("benali");
    expect(f?.OR).toHaveLength(3);
    expect(f?.OR[0]).toEqual({ firstName: { contains: "benali", mode: "insensitive" } });
    expect(f?.OR[2]).toEqual({ email: { contains: "benali", mode: "insensitive" } });
  });

  it("ignore la casse et les espaces autour", () => {
    expect(filtreRecherche("  Léa  ")?.OR[1]).toEqual({ lastName: { contains: "Léa", mode: "insensitive" } });
  });

  it("ne filtre pas sous le seuil — une lettre coûte un balayage complet pour rien", () => {
    expect(filtreRecherche("b")).toBeNull();
    expect(filtreRecherche("")).toBeNull();
    expect(filtreRecherche("   ")).toBeNull();
  });

  it("filtre dès le seuil atteint", () => {
    expect(filtreRecherche("b".repeat(LONGUEUR_MIN_RECHERCHE))).not.toBeNull();
  });

  it("se compose avec un spread quand il est nul, laissant la requête intacte", () => {
    // C'est la forme utilisée dans la route : { ...(filtre ?? {}) }.
    const requete = { organizationId: "org1", ...(filtreRecherche("x") ?? {}) };
    expect(requete).toEqual({ organizationId: "org1" });
  });
});

describe("mentionTroncature", () => {
  it("ne dit rien quand tout est affiché", () => {
    expect(mentionTroncature(8, 8, "")).toBeNull();
    expect(mentionTroncature(20, 3, "")).toBeNull();
  });

  it("annonce la troncature et nomme le vrai total, sans recherche en cours", () => {
    // Le cas qui a motivé le chantier : 20 lignes visibles sur 4 025.
    expect(mentionTroncature(MAX_AUTRES_CONTACTS_AFFICHES, 4025, "")).toBe(
      "20 affichés sur 4025 — cherchez par nom ou par email pour trouver les autres.",
    );
  });

  it("change de conseil quand une recherche est déjà en cours", () => {
    expect(mentionTroncature(20, 60, "ben")).toBe("20 résultats sur 60 — précisez votre recherche.");
  });

  it("traite une recherche trop courte comme une absence de recherche", () => {
    expect(mentionTroncature(20, 60, "b")).toContain("cherchez par nom");
  });
});
