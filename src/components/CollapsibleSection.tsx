"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Client feedback: the "À faire" and "Réclamations en attente" dashboard
// widgets should default to a reduced/compact state with a button to expand
// — a growing task list otherwise pushes everything else on the dashboard
// down. Children are rendered server-side by the caller and passed in as a
// slot; this component only owns the open/closed toggle, so the list
// content itself doesn't need to become client-side.
export function CollapsibleSection({
  title,
  badge,
  extra,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  extra?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-left shrink-0">
          {open ? <ChevronDown size={14} className="text-slate" /> : <ChevronRight size={14} className="text-slate" />}
          <span className="text-[12.5px] text-slate">{title}</span>
        </button>
        {badge}
        <div className="flex-1" />
        {extra}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
