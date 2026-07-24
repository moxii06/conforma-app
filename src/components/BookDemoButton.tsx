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
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="afterInteractive" />
      <button
        type="button"
        onClick={() => {
          if (window.Calendly) window.Calendly.initPopupWidget({ url: CALENDLY_URL });
          else window.open(CALENDLY_URL, "_blank", "noopener,noreferrer");
        }}
        className={className}
      >
        {children}
      </button>
    </>
  );
}
