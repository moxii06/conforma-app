import { describe, expect, it } from "vitest";
import { messageDoublonEcheancier, verifierEcheancierDejaFacture } from "./echeancierDoublon";

// Ce verdict décide si l'échéancier d'un contrat qu'on vient de signer
// devient des factures ou non. Se tromper coûte de l'argent dans les deux
// sens : trop sensible, l'organisme perd des factures qu'il attendait ; pas
// assez, son client en reçoit deux fois — et ce second cas n'est pas
// théorique, c'est ce qui arrive à tout organisme qui a pris l'habitude de
// saisir ces factures à la main pendant que « Marquer signé » ne les créait
// pas.

const echeance = (amountCents: number) => ({ amountCents });

describe("verifierEcheancierDejaFacture", () => {
  it("reconnaît l'échéancier recopié à la main, échéance par échéance", () => {
    // Le cas de la régression : trois signatures en présentiel, trois
    // factures créées à la main. Jalon ne doit pas en ajouter trois autres.
    const verdict = verifierEcheancierDejaFacture(
      [echeance(50000), echeance(50000), echeance(50000)],
      [echeance(50000), echeance(50000), echeance(50000)],
    );
    expect(verdict.dejaFacture).toBe(true);
    expect(verdict.totalEcheancierCentimes).toBe(150000);
    expect(verdict.nombreFactures).toBe(3);
  });

  it("reconnaît aussi le prix facturé en une seule fois", () => {
    // La forme la plus courante de la saisie manuelle, et très exactement
    // celle qu'un critère « montant par montant » raterait : une facture de
    // 1 500 € en face d'un échéancier de 3 × 500 €.
    const verdict = verifierEcheancierDejaFacture(
      [echeance(50000), echeance(50000), echeance(50000)],
      [echeance(150000)],
    );
    expect(verdict.dejaFacture).toBe(true);
    expect(verdict.nombreFactures).toBe(1);
  });

  it("ne se déclenche pas sur un client qui a simplement des impayés", () => {
    // Trois factures impayées, c'est l'état normal d'un client actif. Un
    // critère fondé sur le NOMBRE d'échéances aurait bloqué ici, et privé
    // l'organisme de son échéancier sans raison.
    const verdict = verifierEcheancierDejaFacture(
      [echeance(50000), echeance(50000), echeance(50000)],
      [echeance(12000), echeance(8000), echeance(30000)],
    );
    expect(verdict.dejaFacture).toBe(false);
    expect(verdict.totalFacturesCentimes).toBe(50000);
  });

  it("exige le centime près", () => {
    // Un total « à peu près » égal n'est pas le même argent. Tolérer un
    // écart rendrait le déclenchement flou, donc impossible à expliquer à
    // l'organisme quand il se demande où sont ses factures.
    const verdict = verifierEcheancierDejaFacture([echeance(150000)], [echeance(149999)]);
    expect(verdict.dejaFacture).toBe(false);
  });

  it("ne bloque rien quand il n'existe aucune facture", () => {
    const verdict = verifierEcheancierDejaFacture([echeance(50000), echeance(50000)], []);
    expect(verdict.dejaFacture).toBe(false);
    expect(verdict.totalFacturesCentimes).toBe(0);
    expect(verdict.nombreFactures).toBe(0);
  });

  it("ne prend pas deux zéros pour un doublon", () => {
    // Échéancier vide et aucune facture : deux totaux nuls égaux, mais rien
    // n'a été facturé deux fois. Sans cette garde, un « 0 === 0 » signalerait
    // un doublon là où il n'y a rien du tout.
    expect(verifierEcheancierDejaFacture([], []).dejaFacture).toBe(false);
    expect(verifierEcheancierDejaFacture([], [echeance(0)]).dejaFacture).toBe(false);
  });

  it("compte l'ensemble des factures, pas seulement la première", () => {
    // Un acompte et un solde saisis séparément couvrent bien l'échéancier.
    const verdict = verifierEcheancierDejaFacture(
      [echeance(45000), echeance(105000)],
      [echeance(45000), echeance(105000)],
    );
    expect(verdict.dejaFacture).toBe(true);
    expect(verdict.totalFacturesCentimes).toBe(150000);
  });
});

describe("messageDoublonEcheancier", () => {
  const euros = (centimes: number) => (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  it("dit ce qui n'a pas été fait, sur quoi, et où vérifier", () => {
    const verdict = verifierEcheancierDejaFacture(
      [echeance(50000), echeance(50000), echeance(50000)],
      [echeance(50000), echeance(50000), echeance(50000)],
    );
    const message = messageDoublonEcheancier(verdict);
    expect(message).toContain("n'a pas été transformé en factures");
    expect(message).toContain("3 factures impayées");
    expect(message).toContain(euros(150000));
    expect(message).toContain("Facturation");
  });

  it("accorde au singulier", () => {
    const verdict = verifierEcheancierDejaFacture([echeance(150000)], [echeance(150000)]);
    const message = messageDoublonEcheancier(verdict);
    expect(message).toContain("1 facture impayée");
    expect(message).toContain("existe déjà");
    expect(message).not.toContain("factures impayées");
  });
});
