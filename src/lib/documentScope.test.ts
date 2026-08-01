import { describe, expect, it } from "vitest";
import { scopeOfCategory, scopeHint, unresolvedTags } from "./documentScope";

// Se tromper de portée coûte dans les deux sens : un contrat unique pour
// huit stagiaires est inopposable et insignable individuellement ; huit
// règlements intérieurs identiques noient la bibliothèque et font payer
// huit signatures au lieu de zéro.

describe("scopeOfCategory", () => {
  it("produit un document par apprenant pour ce qui engage une personne", () => {
    expect(scopeOfCategory("contrat_formation")).toBe("per_learner");
    expect(scopeOfCategory("convocation")).toBe("per_learner");
    expect(scopeOfCategory("lms_certificate")).toBe("per_learner");
  });

  it("produit un document unique pour ce qui est commun", () => {
    expect(scopeOfCategory("internal_rules")).toBe("single");
    expect(scopeOfCategory("welcome_booklet")).toBe("single");
    expect(scopeOfCategory("cgv")).toBe("single");
  });

  it("traite la convention comme un document unique", () => {
    // Une convention lie l'organisme à l'ENTREPRISE qui inscrit ses
    // salariés, pas à chaque salarié — contrairement au contrat, qui lie
    // l'organisme au particulier qui finance lui-même.
    expect(scopeOfCategory("convention")).toBe("single");
    expect(scopeOfCategory("contrat_formation")).toBe("per_learner");
  });

  it("retombe sur le document unique pour une catégorie inconnue", () => {
    // Le sens le moins coûteux quand on hésite : un document commun de
    // trop se renvoie, un contrat manquant se plaide.
    expect(scopeOfCategory("categorie_inventee")).toBe("single");
    expect(scopeOfCategory("other")).toBe("single");
  });
});

describe("scopeHint", () => {
  it("annonce le nombre de documents avant de les produire", () => {
    expect(scopeHint("per_learner", 8)).toContain("8 documents");
    expect(scopeHint("per_learner", 1)).toContain("1 document");
    expect(scopeHint("per_learner", 1)).not.toContain("documents");
  });

  it("invite à choisir une formation quand le compte est inconnu", () => {
    expect(scopeHint("per_learner", 0)).toContain("Choisissez une formation");
  });

  it("reste bref pour un document commun", () => {
    expect(scopeHint("single", 8)).toContain("commun");
  });
});

describe("unresolvedTags", () => {
  // La syntaxe de fusion de Jalon est {{clé}} — voir mergeTemplate.ts. Une
  // première version cherchait des [Balises] entre crochets : elle ne
  // trouvait jamais rien et annonçait « aucune balise manquante » sur un
  // document qui en était plein. C'est le genre d'erreur qu'un test qui
  // se contente de vérifier « ça renvoie une liste » laisse passer.
  it("signale un jeton oublié sur un document commun", () => {
    expect(unresolvedTags("Le prix est de {{course.price}} euros.", "single")).toEqual(["course.price"]);
  });

  it("ne compte pas les champs apprenant sur un document par apprenant", () => {
    // Ils sont censés rester dans le brouillon : ils se résolvent à la
    // génération, une fois par destinataire.
    expect(unresolvedTags("Entre {{contact.firstName}} {{contact.lastName}}…", "per_learner")).toEqual([]);
  });

  it("les compte en revanche sur un document commun", () => {
    expect(unresolvedTags("Entre {{contact.lastName}}…", "single")).toEqual(["contact.lastName"]);
  });

  it("signale un jeton non-apprenant même sur un document par apprenant", () => {
    expect(unresolvedTags("{{contact.firstName}} suivra {{course.title}}.", "per_learner")).toEqual(["course.title"]);
  });

  it("ne signale rien quand tout est résolu", () => {
    expect(unresolvedTags("Karim Benali suivra Sécurité incendie.", "single")).toEqual([]);
  });

  it("dédoublonne un jeton répété", () => {
    expect(unresolvedTags("{{course.price}} puis {{course.price}}", "single")).toEqual(["course.price"]);
  });

  it("tolère les espaces dans les accolades", () => {
    expect(unresolvedTags("{{ course.price }}", "single")).toEqual(["course.price"]);
  });

  it("ne prend pas un texte entre crochets pour un jeton", () => {
    // Les crochets sont de la ponctuation ordinaire dans un contrat.
    expect(unresolvedTags("Voir l'annexe [1] et le point [b].", "single")).toEqual([]);
  });
});
