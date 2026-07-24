"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
    >
      Imprimer / PDF
    </button>
  );
}
