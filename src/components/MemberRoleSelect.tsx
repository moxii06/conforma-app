"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/tenant";

const EDITABLE_ROLES = Object.values(Role).filter((r) => r !== Role.ADMIN_OF);

export function MemberRoleSelect({ memberId, role }: { memberId: string; role: Role }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur.");
      return;
    }
    router.refresh();
  }

  if (role === Role.ADMIN_OF) {
    return <span className="text-[11.5px] text-slate">{ROLE_LABELS[role]}</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={role}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="bg-white border border-line rounded-md px-2 py-1 text-[11.5px] text-ink disabled:opacity-60"
      >
        {EDITABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
