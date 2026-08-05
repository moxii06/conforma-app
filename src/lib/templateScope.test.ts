import { describe, it, expect } from "vitest";
import {
  templateCourseFilter,
  sortTemplatesForCourse,
  templateAppliesToCourse,
} from "./templateScope";

const M = (id: string, title: string, courseId: string | null = null) => ({
  id,
  title,
  category: "convention",
  courseId,
});

describe("templateCourseFilter", () => {
  it("sans formation en jeu, ne propose que les modèles généraux", () => {
    expect(templateCourseFilter(null)).toEqual({ courseId: null });
    expect(templateCourseFilter(undefined)).toEqual({ courseId: null });
  });

  it("avec une formation, propose les généraux ET ceux de cette formation", () => {
    expect(templateCourseFilter("c1")).toEqual({ OR: [{ courseId: null }, { courseId: "c1" }] });
  });

  it("ne propose jamais ceux d'une autre formation : la condition ne peut pas les atteindre", () => {
    const f = templateCourseFilter("c1");
    // La forme du filtre EST la garantie — aucune branche ne laisse passer
    // un courseId différent de c1.
    expect(JSON.stringify(f)).not.toContain("c2");
  });
});

describe("sortTemplatesForCourse", () => {
  it("place les modèles de la formation en tête, le reste par ordre alphabétique", () => {
    const liste = [
      M("1", "Convention générale"),
      M("2", "Attestation Anglais", "c1"),
      M("3", "Bordereau"),
      M("4", "Convention Anglais", "c1"),
    ];
    expect(sortTemplatesForCourse(liste, "c1").map((t) => t.title)).toEqual([
      "Attestation Anglais",
      "Convention Anglais",
      "Bordereau",
      "Convention générale",
    ]);
  });

  it("sans formation en jeu, s'en tient à l'ordre alphabétique", () => {
    const liste = [M("1", "Zèbre"), M("2", "Alpha", "c1")];
    expect(sortTemplatesForCourse(liste, null).map((t) => t.title)).toEqual(["Alpha", "Zèbre"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const liste = [M("1", "B"), M("2", "A", "c1")];
    const copie = [...liste];
    sortTemplatesForCourse(liste, "c1");
    expect(liste).toEqual(copie);
  });

  it("trie en français : les accents ne partent pas en fin de liste", () => {
    const liste = [M("1", "Zèbre"), M("2", "Évaluation"), M("3", "Attestation")];
    expect(sortTemplatesForCourse(liste, null).map((t) => t.title)).toEqual([
      "Attestation",
      "Évaluation",
      "Zèbre",
    ]);
  });
});

describe("templateAppliesToCourse", () => {
  it("un modèle général sert partout, y compris sans formation", () => {
    expect(templateAppliesToCourse({ courseId: null }, "c1")).toBe(true);
    expect(templateAppliesToCourse({ courseId: null }, null)).toBe(true);
  });

  it("un modèle de formation sert pour sa formation", () => {
    expect(templateAppliesToCourse({ courseId: "c1" }, "c1")).toBe(true);
  });

  it("et refuse pour une autre formation — c'est le garde-fou serveur", () => {
    expect(templateAppliesToCourse({ courseId: "c1" }, "c2")).toBe(false);
  });

  it("refuse aussi quand il n'y a aucune formation : on ne devine pas", () => {
    expect(templateAppliesToCourse({ courseId: "c1" }, null)).toBe(false);
    expect(templateAppliesToCourse({ courseId: "c1" }, undefined)).toBe(false);
  });
});
