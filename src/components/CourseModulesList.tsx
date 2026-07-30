"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Circle, CircleAlert, Lock, Video, FileText, HelpCircle, BookOpen, Paperclip } from "lucide-react";

export type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  type: "video" | "document" | "quiz" | "page";
  state: "locked" | "unlocked_not_started" | "in_progress" | "completed";
  lockedAfterTitle: string | null;
  attachments: { id: string; title: string; fileUrl: string }[];
  node: ReactNode;
  chapterId: string | null;
  chapterTitle: string | null;
  // "Passer cette vidéo" was used and the video hasn't since been watched
  // to genuine completion — see LmsModulePlayer/ElearningProgress.skippedAt.
  skippedAt: boolean;
};

const TYPE_ICON: Record<ModuleRow["type"], typeof Video> = { video: Video, document: FileText, quiz: HelpCircle, page: BookOpen };
const TYPE_LABEL: Record<ModuleRow["type"], string> = { video: "Vidéo", document: "Document", quiz: "Quiz", page: "Page" };

// The list itself is server-rendered (order, lock state, and the module's
// actual content — LmsModulePlayer/QuizTaker — are all computed server-side
// in mon-espace/page.tsx); this wrapper only owns which row is expanded.
// Locked rows never receive a `node` worth expanding — there's nothing to
// show and no way to interact with content the learner hasn't unlocked yet,
// matching the "propose, don't fake access" posture used everywhere else in
// the LMS (see the video-scrub confirmation, the server-side quiz grading).
export function CourseModulesList({ rows, defaultExpandedId }: { rows: ModuleRow[]; defaultExpandedId: string | null }) {
  const [expandedId, setExpandedId] = useState(defaultExpandedId);

  // Read-only mirror of the admin side's chapter grouping (ContenuTab in
  // formations/[id]/page.tsx): a header renders wherever chapterId changes
  // walking the already globally-ordered rows, no separate ordering concept
  // for chapters. Per-chapter progress is computed here rather than passed
  // in — it's cheap to derive from the rows the caller already built.
  const chapterCounts = new Map<string, { total: number; completed: number }>();
  for (const r of rows) {
    if (!r.chapterId) continue;
    const c = chapterCounts.get(r.chapterId) ?? { total: 0, completed: 0 };
    c.total += 1;
    if (r.state === "completed") c.completed += 1;
    chapterCounts.set(r.chapterId, c);
  }
  let lastChapterId: string | null | undefined = undefined;

  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const isExpanded = expandedId === r.id;
        const isLocked = r.state === "locked";
        const Icon = TYPE_ICON[r.type];
        const showChapterHeader = r.chapterId !== lastChapterId && Boolean(r.chapterId);
        lastChapterId = r.chapterId;
        const chapterProgress = r.chapterId ? chapterCounts.get(r.chapterId) : undefined;
        return (
          <div key={r.id} className="border-t border-line first:border-t-0">
            {showChapterHeader && (
              <div className="flex items-center justify-between px-1 pt-2.5 pb-1">
                <span className="text-[11px] font-semibold text-seal-dark uppercase tracking-wide">{r.chapterTitle}</span>
                {chapterProgress && (
                  <span className="text-[10.5px] text-slate tabular-nums">
                    {chapterProgress.completed}/{chapterProgress.total}
                  </span>
                )}
              </div>
            )}
            <div>
            <button
              type="button"
              onClick={() => !isLocked && setExpandedId(isExpanded ? null : r.id)}
              disabled={isLocked}
              className={`w-full flex items-center gap-2.5 py-2.5 text-left ${isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-linen"}`}
            >
              {r.state === "completed" && r.skippedAt ? (
                <CircleAlert size={15} className="text-rust shrink-0" />
              ) : r.state === "completed" ? (
                <CheckCircle2 size={15} className="text-sage shrink-0" />
              ) : isLocked ? (
                <Lock size={13} className="text-slate shrink-0" />
              ) : (
                <Circle size={14} className={r.state === "in_progress" ? "text-seal-dark shrink-0" : "text-ash shrink-0"} />
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
                  {/* Video: description reads as context/instructions for
                      what was just watched, so it goes under the player.
                      Document/quiz/page: it's the orientation (or, for a
                      page, the content itself) before the action, so it
                      stays above — same reasoning, different position.
                      Rendered as HTML: sanitized at save time
                      (sanitizeRichText, src/lib/richText.ts). */}
                  {r.type === "video" ? (
                    <>
                      {r.node}
                      {r.description && (
                        <div className="text-[11.5px] text-slate" dangerouslySetInnerHTML={{ __html: r.description }} />
                      )}
                    </>
                  ) : (
                    <>
                      {r.description && (
                        <div
                          className={r.type === "page" ? "text-[12.5px] text-ink leading-relaxed" : "text-[11.5px] text-slate"}
                          dangerouslySetInnerHTML={{ __html: r.description }}
                        />
                      )}
                      {r.node}
                    </>
                  )}
                  {r.attachments.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1">
                      <div className="text-[10px] font-semibold text-slate uppercase tracking-wide flex items-center gap-1">
                        <Paperclip size={10} /> Documents complémentaires
                      </div>
                      {r.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={`/api/lms/modules/attachments/${a.id}`}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink"
                        >
                          {a.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
