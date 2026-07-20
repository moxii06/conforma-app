"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocStatus } from "@prisma/client";

const STATUS_LABELS: Record<DocStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  SIGNED: "Signé",
  PAID: "Payé",
  OVERDUE: "En retard",
};

export function DocStatusSelect({ kind, id, status }: { kind: "quotes" | "invoices"; id: string; status: DocStatus }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    await fetch(`/api/facturation/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={saving}
      className="text-[11.5px] border border-line rounded px-1.5 py-0.5 text-ink outline-none focus:border-seal disabled:opacity-60"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
