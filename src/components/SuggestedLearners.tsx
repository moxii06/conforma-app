"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

type Suggestion = { id: string; firstName: string; lastName: string; email: string; matchedLabel: string };

// Quick-add chips for contacts the CRM already links to this training (via
// Opportunity.courseOfInterestId once the course exists, or a label-text
// match on the typed title before it does) — see
// /api/courses/interested-contacts. Used by both CreateCourseForm (titleQuery)
// and EnrollLearnerPanel (courseId).
export function SuggestedLearners({
  courseId,
  titleQuery,
  excludeIds,
  onAdd,
}: {
  courseId?: string;
  titleQuery?: string;
  excludeIds?: Set<string>;
  onAdd: (contactId: string, label: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const q = titleQuery?.trim();
    if (!courseId && (!q || q.length < 2)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (q) params.set("q", q);
      const res = await fetch(`/api/courses/interested-contacts?${params.toString()}`);
      const data = await res.json().catch(() => []);
      setSuggestions(Array.isArray(data) ? data : []);
    }, 350);
    return () => clearTimeout(timer);
  }, [courseId, titleQuery]);

  const visible = suggestions.filter((s) => !excludeIds?.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] text-slate uppercase tracking-wide">Suggérés depuis le CRM</div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onAdd(s.id, `${s.firstName} ${s.lastName}`)}
            className="inline-flex items-center gap-1.5 bg-[#EFEDE7] border border-line rounded-full pl-2.5 pr-3 py-1 text-[11.5px] text-ink hover:border-ink-soft"
            title={`Intéressé·e par « ${s.matchedLabel} »`}
          >
            <UserPlus size={12} />
            {s.firstName} {s.lastName}
          </button>
        ))}
      </div>
    </div>
  );
}
