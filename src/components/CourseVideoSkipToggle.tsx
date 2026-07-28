"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Off by default (Course.allowVideoSkip) — a skip path on a video module
// only exists where the OF has explicitly opted in, per course. See
// LmsModulePlayer for what the learner sees once this is on.
export function CourseVideoSkipToggle({ courseId, allowVideoSkip }: { courseId: string; allowVideoSkip: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowVideoSkip: !allowVideoSkip }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
    >
      {loading ? "…" : allowVideoSkip ? "Désactiver «Passer cette vidéo»" : "Autoriser «Passer cette vidéo»"}
    </button>
  );
}
