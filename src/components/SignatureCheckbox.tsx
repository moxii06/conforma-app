"use client";

// Dropped into every staff email composer — the actual signature content
// is resolved server-side from the sender's own profile (see
// lib/emailSignature.ts) right before sending, never trusted from the
// client; this checkbox only controls whether that happens.
export function SignatureCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-sage" />
      Inclure ma signature
    </label>
  );
}
