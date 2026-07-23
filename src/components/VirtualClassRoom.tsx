"use client";

import { useEffect, useRef } from "react";

const PING_INTERVAL_MS = 30_000;

// Presence is tracked from this page actually being open in the learner's
// browser — join on mount, a heartbeat every 30s while it stays open, leave
// on unmount/tab-close (via sendBeacon, since a normal fetch can be
// cancelled mid-flight when the tab closes). This is the "real connection
// status, not a checkbox" signal: nobody on staff can tick this box, and a
// learner who never opens this page never accrues any presence.
export function VirtualClassRoom({ sessionId, dossierId, meetingLink }: { sessionId: string; dossierId: string; meetingLink: string }) {
  const dossierIdRef = useRef(dossierId);
  dossierIdRef.current = dossierId;

  useEffect(() => {
    const base = `/api/planning/sessions/${sessionId}/attendance`;
    const body = JSON.stringify({ dossierId: dossierIdRef.current });

    fetch(`${base}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body });

    const interval = setInterval(() => {
      fetch(`${base}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    }, PING_INTERVAL_MS);

    function leave() {
      navigator.sendBeacon(`${base}/leave`, new Blob([body], { type: "application/json" }));
    }
    window.addEventListener("beforeunload", leave);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", leave);
      leave();
    };
  }, [sessionId]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-slate">
        Votre présence est enregistrée automatiquement tant que cette page reste ouverte.
      </div>
      <iframe
        src={meetingLink}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="w-full aspect-video rounded-md border border-line bg-black"
      />
    </div>
  );
}
