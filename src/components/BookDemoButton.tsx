"use client";

import Script from "next/script";
import type { ReactNode } from "react";

// Popup widget, not the inline/badge embed — keeps the visitor on the
// landing page instead of sending them to calendly.com. Renders nothing
// if NEXT_PUBLIC_CALENDLY_URL isn't set, rather than showing a dead button.
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL;

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (opts: { url: string }) => void };
  }
}

export function BookDemoButton({ className, children }: { className?: string; children: ReactNode }) {
  if (!CALENDLY_URL) return null;

  return (
    <>
      <link href="https://assets.calendly.com/assets/external/widget.css" rel="stylesheet" />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="afterInteractive" />
      {/* A real <a href> so the button still works (opens Calendly directly)
          if the popup script is blocked by an ad/tracker blocker — Calendly's
          widget.js is a common blocklist target. The popup is progressive
          enhancement on top, not the only path. */}
      <a
        href={CALENDLY_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (window.Calendly) {
            e.preventDefault();
            window.Calendly.initPopupWidget({ url: CALENDLY_URL });
          }
        }}
        className={className}
      >
        {children}
      </a>
    </>
  );
}
