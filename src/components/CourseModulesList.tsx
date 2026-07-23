"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Lock, Video, FileText, HelpCircle } from "lucide-react";

export type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  type: "video" | "document" | "quiz";
  state: "locked" | "unlocked_not_started" | "in_progress" | "completed";
  lockedAfterTitle: string | null;
  node: ReactNode;
};

const TYPE_ICON: Record<ModuleRow["type"], typeof Video> = { video: Video, document: FileText, quiz: HelpCircle };
const TYPE_LABEL: Record<ModuleRow["type"], string> = { video: "Vidéo", document: "Document", quiz: "Quiz" };

// The list itself is server-rendered (order, lock state, and the module's
// actual content — LmsModulePlayer/QuizTaker — are all computed server-side
// in mon-espace/page.tsx); this wrapper only owns which row is expanded.
// Locked rows never receive a `node` worth expanding — there's nothing to
// show and no way to interact with content the learner hasn't unlocked yet,
// matching the "propose, don't fake access" posture used everywhere else in
// the LMS (see the video-scrub confirmation, the server-side quiz grading).
export function CourseModulesList({ rows, defaultExpandedId }: { rows: ModuleRow[]; defaultExpandedId: string | null }) {
  const [expandedId, setExpandedId] = useState(defaultExpandedId);

  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const isExpanded = expandedId === r.id;
        const isLocked = r.state === "locked";
        const Icon = TYPE_ICON[r.type];
        return (
          <div key={r.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => !isLocked && setExpandedId(isExpanded ? null : r.id)}
              disabled={isLocked}
              className={`w-full flex items-center gap-2.5 py-2.5 text-left ${isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-[#FAF8F2]"}`}
            >
              {r.state === "completed" ? (
                <CheckCircle2 size={15} className="text-sage shrink-0" />
              ) : isLocked ? (
                <Lock size={13} className="text-slate shrink-0" />
              ) : (
                <Circle size={14} className={r.state === "in_progress" ? "text-seal-dark shrink-0" : "text-[#C9C4B5] shrink-0"} />
              )}
              <Icon size={14} className="text-slate shrink-0" />
              <span className="flex-1 text-[12.5px] text-ink font-medium">{i + 1}. {r.title}</span>
              {r.state === "in_progress" && !isExpanded && (
                <span className="text-[10.5px] font-semibold text-seal-dark uppercase tracking-wide">À reprendre</span>
              )}
              <span className="text-[10.5px] text-slate uppercase tracking-wide shrink-0">{TYPE_LABEL[r.type]}</span>
            </button>
            {isLocked ? (
              <div className="pb-2.5 pl-8 text-[11px] text-slate">
                {r.lockedAfterTitle ? `Se débloque après « ${r.lockedAfterTitle} »` : "Pas encore accessible"}
              </div>
            ) : (
              isExpanded && (
                <div className="pb-3 pl-8 flex flex-col gap-2">
                  {r.description && <div className="text-[11.5px] text-slate">{r.description}</div>}
                  {r.node}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
