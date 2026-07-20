"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddSubProcessorForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("France");
  const [dpaStatus, setDpaStatus] = useState<"pending" | "signed">("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/rgpd/sub-processors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, location, dpaStatus }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'enregistrement.");
      return;
    }

    setName("");
    setRole("");
    setLocation("France");
    setDpaStatus("pending");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2.5 flex-wrap">
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Nom du prestataire</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-44" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Rôle</label>
        <input required value={role} onChange={(e) => setRole(e.target.value)} placeholder="Hébergement, emailing..." className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-44" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Localisation</label>
        <input required value={location} onChange={(e) => setLocation(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-32" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">DPA</label>
        <select value={dpaStatus} onChange={(e) => setDpaStatus(e.target.value as "pending" | "signed")} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="pending">En attente</option>
          <option value="signed">Signé</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <div className="text-[12px] text-rust w-full">{error}</div>}
    </form>
  );
}
