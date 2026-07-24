import { describe, expect, it } from "vitest";
import { buildCourseProgress, getCourseCompletion } from "./lms";

// buildCourseProgress is the single place that turns a course's modules +
// one dossier's progress into learner-facing state — it feeds the learner
// portal, the certificate route's completion gate, the décrochage
// (inactivity) detection, and the rolling-access-deadline reminders. A
// wrong answer here doesn't just mis-render a progress bar, it can issue a
// certificate too early or silently skip a real relance.

const videoModule = (id: string) => ({ id, type: "video", quiz: null });
const quizModule = (id: string, quizId: string) => ({ id, type: "quiz", quiz: { id: quizId } });

describe("buildCourseProgress", () => {
  it("treats a module with no progress row as locked, not just not-started", () => {
    const { states, completedCount, currentModuleId } = buildCourseProgress([videoModule("m1")], [], []);
    expect(states.get("m1")).toBe("locked");
    expect(completedCount).toBe(0);
    // A locked module is never picked as "the one to resume" — there's
    // nothing to resume yet.
    expect(currentModuleId).toBeNull();
  });

  it("marks a video/document module completed at percentComplete >= 100, not before", () => {
    const modules = [videoModule("m1")];
    const almostDone = buildCourseProgress(modules, [{ moduleId: "m1", percentComplete: 99 }], []);
    expect(almostDone.states.get("m1")).toBe("in_progress");
    expect(almostDone.allCompleted).toBe(false);

    const done = buildCourseProgress(modules, [{ moduleId: "m1", percentComplete: 100 }], []);
    expect(done.states.get("m1")).toBe("completed");
    expect(done.allCompleted).toBe(true);
  });

  it("completes a quiz module only via a passed attempt, regardless of percentComplete", () => {
    const modules = [quizModule("m1", "q1")];
    // A progress row exists (unlocked) but no attempt yet.
    const unlockedNoAttempt = buildCourseProgress(modules, [{ moduleId: "m1", percentComplete: 0 }], []);
    expect(unlockedNoAttempt.states.get("m1")).toBe("unlocked_not_started");

    const failedAttempt = buildCourseProgress(
      modules,
      [{ moduleId: "m1", percentComplete: 0 }],
      [{ quizId: "q1", passed: false }]
    );
    expect(failedAttempt.states.get("m1")).toBe("in_progress");
    expect(failedAttempt.allCompleted).toBe(false);

    const passedAttempt = buildCourseProgress(
      modules,
      [{ moduleId: "m1", percentComplete: 0 }],
      [{ quizId: "q1", passed: true }]
    );
    expect(passedAttempt.states.get("m1")).toBe("completed");
    expect(passedAttempt.allCompleted).toBe(true);
  });

  it("picks the first non-completed, non-locked module as the one to resume", () => {
    const modules = [videoModule("m1"), videoModule("m2"), videoModule("m3")];
    const progress = [
      { moduleId: "m1", percentComplete: 100 },
      { moduleId: "m2", percentComplete: 40 },
      // m3 has no row — locked, correctly skipped as a resume candidate.
    ];
    const { currentModuleId, completedCount, totalPercent } = buildCourseProgress(modules, progress, []);
    expect(currentModuleId).toBe("m2");
    expect(completedCount).toBe(1);
    expect(totalPercent).toBe(33); // 1/3 rounded
  });

  it("treats a course with zero modules as not completed, not vacuously completed", () => {
    // Matters because several callers (certificate route, décrochage
    // detection) explicitly skip courses with no elearning content — if
    // this ever flipped to true, an empty course could wrongly look
    // "finished."
    const { allCompleted, total } = buildCourseProgress([], [], []);
    expect(total).toBe(0);
    expect(allCompleted).toBe(false);
  });
});

describe("getCourseCompletion", () => {
  it("mirrors buildCourseProgress's aggregate fields without the per-module state map", () => {
    const modules = [videoModule("m1"), videoModule("m2")];
    const progress = [
      { moduleId: "m1", percentComplete: 100 },
      { moduleId: "m2", percentComplete: 100 },
    ];
    const completion = getCourseCompletion(modules, progress, []);
    expect(completion).toEqual({ completedCount: 2, total: 2, allCompleted: true });
  });
});
