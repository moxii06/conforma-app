import { describe, expect, it } from "vitest";
import {
  AUTOMATION_DELAY_PHRASING,
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_TRIGGER_VALUES,
  DECLENCHEURS_EMAIL_OBLIGATOIRE,
  regleSansEffet,
} from "./automationRules";

// Le déclencheur est la clé de trois tables séparées (libellé, phrasé du
// délai, email obligatoire) : une entrée oubliée ne casse rien à la
// compilation, elle produit un écran muet ou une règle inerte.

describe("tables des déclencheurs", () => {
  it("donne un libellé et un phrasé de délai à chaque déclencheur", () => {
    for (const trigger of AUTOMATION_TRIGGER_VALUES) {
      expect(AUTOMATION_TRIGGER_LABELS[trigger]).toBeTruthy();
      expect(AUTOMATION_DELAY_PHRASING[trigger]?.avant).toBeTruthy();
      expect(AUTOMATION_DELAY_PHRASING[trigger]?.apres).toBeTruthy();
    }
  });

  it("n'exige l'email que sur des déclencheurs qui existent", () => {
    for (const trigger of DECLENCHEURS_EMAIL_OBLIGATOIRE) {
      expect(AUTOMATION_TRIGGER_VALUES as readonly string[]).toContain(trigger);
    }
  });
});

describe("regleSansEffet", () => {
  it("signale une règle sans email sur un déclencheur qui n'agit que par email", () => {
    // Le cron ne charge que sendEmail: true, et dashboardTasks.ts ne lit pas
    // ces trois déclencheurs : la règle ne produirait ni envoi ni tâche.
    expect(regleSansEffet("session_reminder", false)).toBe(true);
    expect(regleSansEffet("certificate_expiring", false)).toBe(true);
    expect(regleSansEffet("invoice_overdue", false)).toBe(true);
  });

  it("laisse tranquilles les déclencheurs qui produisent une tâche sans email", () => {
    // Ces cinq-là sont bien relus par dashboardTasks.ts : sans email, la
    // règle règle quand même la cadence de la tâche « à faire ».
    expect(regleSansEffet("needs_assessment_incomplete", false)).toBe(false);
    expect(regleSansEffet("contract_not_signed", false)).toBe(false);
    expect(regleSansEffet("convocation_missing", false)).toBe(false);
    expect(regleSansEffet("rolling_duration_expiring", false)).toBe(false);
    expect(regleSansEffet("satisfaction_not_collected", false)).toBe(false);
  });

  it("ne signale rien dès que l'email est configuré", () => {
    for (const trigger of AUTOMATION_TRIGGER_VALUES) {
      expect(regleSansEffet(trigger, true)).toBe(false);
    }
  });
});
