"use client";

import { useState } from "react";

// Same "children as a server-rendered slot" pattern as CollapsibleSection —
// the caller (a server component) renders the overflow rows itself and
// passes them in; this only owns the reveal toggle, so dashboard widget
// lists that used to dead-end at a static "+N autres" label can actually
// be expanded instead.
export function ShowMoreToggle({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-[11.5px] text-slate hover:text-ink mt-2 pt-2 border-t border-line w-full text-left underline decoration-line hover:decoration-ink"
    >
      + {count} autre{count > 1 ? "s" : ""}
    </button>
  );
}
