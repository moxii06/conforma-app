import { describe, expect, it } from "vitest";
import { groupTasksByKind, SEUIL_REGROUPEMENT } from "./dashboardTaskGroups";
import type { DashboardTask } from "./dashboardTasks";

function tache(kind: DashboardTask["kind"], i: number, overdue = false): DashboardTask {
  return {
    id: `${kind}-${i}`,
    kind,
    label: `Tâche ${i}`,
    contactName: `Apprenant ${i}`,
    since: new Date(2026, 0, 1 + i),
    href: `/dossiers/${i}`,
    overdue,
  };
}

function lot(kind: DashboardTask["kind"], n: number, overdue = false): DashboardTask[] {
  return Array.from({ length: n }, (_, i) => tache(kind, i, overdue));
}

describe("groupTasksByKind", () => {
  it("résume une famille nombreuse et garde le détail d'une petite", () => {
    const groupes = groupTasksByKind([
      ...lot("dossier_prep_contract", 47),
      ...lot("qualiopi_audit_upcoming", 1),
    ]);

    const conventions = groupes.find((g) => g.kind === "dossier_prep_contract")!;
    expect(conventions.resume).toBe(true);
    expect(conventions.items).toHaveLength(47);

    // Une tâche unique n'a rien à résumer : la ligne nominative reste plus
    // informative que « 1 audit Qualiopi à préparer ».
    expect(groupes.find((g) => g.kind === "qualiopi_audit_upcoming")!.resume).toBe(false);
  });

  it("bascule exactement au seuil, pas un de moins", () => {
    expect(groupTasksByKind(lot("learner_inactive", SEUIL_REGROUPEMENT - 1))[0].resume).toBe(false);
    expect(groupTasksByKind(lot("learner_inactive", SEUIL_REGROUPEMENT))[0].resume).toBe(true);
  });

  it("donne une destination collective aux familles qui en ont une", () => {
    const [g] = groupTasksByKind(lot("dossier_prep_contract", 10));
    expect(g.href).toBe("/dossiers?status=contract_missing");
  });

  it("ne fabrique pas de destination quand aucun écran filtré n'existe", () => {
    // Renvoyer vers /dossiers non filtré serait pire que déplier sur place :
    // on dirait à l'utilisateur « c'est quelque part dans ces 8 000 lignes ».
    const [g] = groupTasksByKind(lot("learner_inactive", 10));
    expect(g.href).toBeNull();
  });

  it("conserve l'ordre d'arrivée, donc l'urgence, entre et dans les groupes", () => {
    // getDashboardTasks trie déjà : en retard d'abord. Le regroupement ne
    // doit pas remonter une famille tranquille devant une famille en retard.
    const groupes = groupTasksByKind([
      ...lot("invoice_overdue", 6, true),
      ...lot("learner_inactive", 6, false),
    ]);
    expect(groupes.map((g) => g.kind)).toEqual(["invoice_overdue", "learner_inactive"]);
    expect(groupes[0].items[0].id).toBe("invoice_overdue-0");
  });

  it("compte les retards par famille", () => {
    const groupes = groupTasksByKind([...lot("invoice_overdue", 3, true), ...lot("invoice_overdue", 2, false)]);
    expect(groupes[0].overdue).toBe(3);
    expect(groupes[0].items).toHaveLength(5);
  });

  it("donne un libellé collectif à chaque famille rencontrée", () => {
    // Un kind ajouté sans libellé produirait « 47 undefined » à l'écran.
    // Le type Record l'empêche à la compilation ; ce test protège du cas où
    // quelqu'un élargirait le type sans compléter la table.
    for (const g of groupTasksByKind([...lot("session_uninvoiced", 1), ...lot("email_assigned", 1)])) {
      expect(g.libelle).toBeTruthy();
      expect(g.libelle).not.toContain("undefined");
    }
  });

  // Le plafond par famille (MAX_TACHES_PAR_FAMILLE) coupe la requête : sans
  // ce drapeau, « 100 factures en retard » se lirait comme un total alors
  // qu'il en reste au-delà.
  describe("troncature", () => {
    it("marque la famille dont la requête a été coupée, et elle seule", () => {
      const groupes = groupTasksByKind(
        [...lot("invoice_overdue", 100), ...lot("learner_inactive", 6)],
        ["invoice_overdue"],
      );
      expect(groupes.find((g) => g.kind === "invoice_overdue")!.tronquee).toBe(true);
      expect(groupes.find((g) => g.kind === "learner_inactive")!.tronquee).toBe(false);
    });

    it("ne marque rien quand l'appelant ne dit rien — le défaut est « complet »", () => {
      expect(groupTasksByKind(lot("invoice_overdue", 100)).every((g) => !g.tronquee)).toBe(true);
    });

    it("marque une famille plafonnée même si le filtrage en mémoire l'a ramenée sous le plafond", () => {
      // Plusieurs familles filtrent après la requête (un dossier sans module
      // e-learning, par exemple) : le nombre affiché peut être petit tout en
      // étant incomplet. C'est la REQUÊTE qui a été coupée, pas la liste.
      const [g] = groupTasksByKind(lot("rolling_deadline_warning", 3), ["rolling_deadline_warning"]);
      expect(g.items).toHaveLength(3);
      expect(g.tronquee).toBe(true);
    });
  });
});
