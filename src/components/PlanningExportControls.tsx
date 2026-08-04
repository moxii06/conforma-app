"use client";

import { useState } from "react";

// Bornes de période pour l'export PDF du planning (audit P1 : « il faut
// pouvoir renseigner les dates concernées par l'export »). Champs vides =
// tout le planning, le comportement historique — l'export reste un simple
// <a href> vers la route GET, les dates ne font qu'enrichir l'URL, donc
// pas de fetch ni d'état serveur ici.
export function PlanningExportControls({ trainerId }: { trainerId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams({ trainer: trainerId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const inputClass = "border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal";

  return (
    <span className="flex items-center gap-1.5">
      <label className="text-[12px] text-slate">du</label>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
      <label className="text-[12px] text-slate">au</label>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
      <a
        href={`/api/planning/export?${params.toString()}`}
        className="text-[12.5px] text-slate hover:text-ink underline underline-offset-2 ml-1"
      >
        Exporter ce planning (PDF)
      </a>
    </span>
  );
}
