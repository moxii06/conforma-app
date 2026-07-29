"use client";

// Wraps an interactive action (a button/link) placed inside a native
// <summary> so clicking it doesn't also toggle the parent <details> open —
// a button nested in <summary> triggers both its own click and the
// details' native toggle unless that default action is suppressed.
export function StopSummaryToggle({ children }: { children: React.ReactNode }) {
  return <div onClick={(e) => e.preventDefault()}>{children}</div>;
}
