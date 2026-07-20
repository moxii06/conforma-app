"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/tenant";

const INVITABLE_ROLES = Object.values(Role).filter((r) => r !== Role.ADMIN_OF);

export function InviteMemberForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.SALES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'invitation.");
      return;
    }

    setName("");
    setEmail("");
    setRole(Role.SALES);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2.5 flex-wrap">
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Nom</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-40"
        />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-56"
        />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Rôle</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
      >
        {loading ? "Envoi…" : "Inviter"}
      </button>
      {error && <div className="text-[12px] text-rust w-full">{error}</div>}
    </form>
  );
}
