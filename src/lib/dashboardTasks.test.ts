import { describe, expect, it } from "vitest";
import { compareDashboardTasks, type DashboardTask } from "./dashboardTasks";

// Ce tri décide de ce qu'un organisme voit en haut de sa liste « à faire »,
// et — via le slice(0, 4) par thème du tableau de bord — de ce qu'il voit
// tout court. Se tromper enterre une échéance sous des relances qui traînent.

const JOUR = 86_400_000;
const MAINTENANT = Date.now();

function tache(over: Partial<DashboardTask> & { id: string }): DashboardTask {
  return {
    kind: "convocation",
    label: "",
    contactName: "",
    since: new Date(MAINTENANT),
    href: "",
    overdue: false,
    ...over,
  };
}

function ordre(taches: DashboardTask[]): string[] {
  return [...taches].sort(compareDashboardTasks).map((t) => t.id);
}

describe("compareDashboardTasks", () => {
  it("fait remonter une échéance proche au-dessus d'une relance qui traîne", () => {
    // Le cas signalé : l'audit Qualiopi dans trois semaines finissait en bas,
    // derrière un recueil des besoins relancé il y a trois mois — parce que
    // sa date étant dans le futur, elle était « plus récente ».
    const audit = tache({ id: "audit", dueAt: new Date(MAINTENANT + 21 * JOUR), since: new Date(MAINTENANT + 21 * JOUR) });
    const relance = tache({ id: "relance", since: new Date(MAINTENANT - 90 * JOUR) });
    expect(ordre([relance, audit])).toEqual(["audit", "relance"]);
  });

  it("garde le retard avant tout le reste", () => {
    const retard = tache({ id: "retard", overdue: true, since: new Date(MAINTENANT - 2 * JOUR) });
    const demain = tache({ id: "demain", dueAt: new Date(MAINTENANT + JOUR) });
    expect(ordre([demain, retard])).toEqual(["retard", "demain"]);
  });

  it("classe les retards du plus ancien au plus récent", () => {
    const vieux = tache({ id: "vieux", overdue: true, since: new Date(MAINTENANT - 30 * JOUR) });
    const recent = tache({ id: "recent", overdue: true, since: new Date(MAINTENANT - 2 * JOUR) });
    expect(ordre([recent, vieux])).toEqual(["vieux", "recent"]);
  });

  it("classe les échéances de la plus proche à la plus lointaine", () => {
    const proche = tache({ id: "proche", dueAt: new Date(MAINTENANT + 2 * JOUR) });
    const lointaine = tache({ id: "lointaine", dueAt: new Date(MAINTENANT + 60 * JOUR) });
    expect(ordre([lointaine, proche])).toEqual(["proche", "lointaine"]);
  });

  it("classe les tâches sans échéance de la plus ancienne à la plus récente", () => {
    const ancienne = tache({ id: "ancienne", since: new Date(MAINTENANT - 40 * JOUR) });
    const fraiche = tache({ id: "fraiche", since: new Date(MAINTENANT - 3 * JOUR) });
    expect(ordre([fraiche, ancienne])).toEqual(["ancienne", "fraiche"]);
  });

  it("ordonne les trois familles bout à bout", () => {
    const liste = [
      tache({ id: "sansEcheance", since: new Date(MAINTENANT - 100 * JOUR) }),
      tache({ id: "echeanceLointaine", dueAt: new Date(MAINTENANT + 80 * JOUR) }),
      tache({ id: "retardRecent", overdue: true, since: new Date(MAINTENANT - JOUR) }),
      tache({ id: "echeanceProche", dueAt: new Date(MAINTENANT + JOUR) }),
      tache({ id: "retardAncien", overdue: true, since: new Date(MAINTENANT - 20 * JOUR) }),
    ];
    expect(ordre(liste)).toEqual([
      "retardAncien",
      "retardRecent",
      "echeanceProche",
      "echeanceLointaine",
      "sansEcheance",
    ]);
  });
});
