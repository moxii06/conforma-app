"use client";

import { MERGE_TAGS } from "@/lib/mergeTags";

// Dropped above any staff-facing email subject/body field that sends to a
// specific learner/contact — clicking a tag inserts it at the field's
// current cursor position (see lib/mergeTags.ts's insertTagAtCursor); the
// literal [Prénom]/[Nom]/... text is filled in server-side right before
// sending, once the recipient is known.
export function MergeTagButtons({ tags = MERGE_TAGS, onInsert }: { tags?: typeof MERGE_TAGS; onInsert: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((m) => (
        <button
          key={m.tag}
          type="button"
          onClick={() => onInsert(m.tag)}
          className="text-[11px] bg-[#EFEDE7] hover:bg-[#E6E3DA] text-ink rounded-full px-2 py-0.5"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
