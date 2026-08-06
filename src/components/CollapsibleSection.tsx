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
  header,
  defaultOpen = false,
  children,
}: {
  // ReactNode (not just string) so a caller can compose an icon/label
  // combo as the heading — e.g. the course content tab's per-module type
  // icon — while every plain-string usage (dashboard widgets) keeps working
  // unchanged.
  title: React.ReactNode;
  badge?: React.ReactNode;
  extra?: React.ReactNode;
  /**
   * Rendu sous le titre, ouvert OU fermé.
   *
   * Pour ce qui doit rester lisible sans déplier — le filtre par pile du
   * widget « à faire », par exemple : le mettre dans le corps le rendrait
   * invisible tant qu'on n'a pas ouvert, alors que son intérêt est
   * justement de voir d'un coup d'œil où se trouve le travail.
   */
  header?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-left shrink-0 min-w-0">
          {open ? <ChevronDown size={14} className="text-slate shrink-0" /> : <ChevronRight size={14} className="text-slate shrink-0" />}
          <span className="text-[12.5px] text-slate min-w-0">{title}</span>
        </button>
        {badge}
        <div className="flex-1" />
        {extra}
      </div>
      {header && <div className="mt-2.5">{header}</div>}
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
