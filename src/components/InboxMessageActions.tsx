"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; firstName: string; lastName: string; email: string };

export function InboxMessageActions({ messageId, contacts }: { messageId: string; contacts: Contact[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "existing" | "new">("idle");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(body: object) {
    setLoading(true);
    await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    router.refresh();
  }

  if (mode === "existing") {
    return (
      <div className="flex items-center gap-1.5">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal">
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </select>
        <button onClick={() => send({ action: "link", contactId })} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
          Rattacher
        </button>
        <button onClick={() => setMode("idle")} className="text-[12px] text-slate">Annuler</button>
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="flex items-center gap-1.5">
        <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-20" />
        <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-20" />
        <button
          onClick={() => firstName && lastName && send({ action: "link-new", firstName, lastName })}
          disabled={loading || !firstName || !lastName}
          className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
        >
          Créer
        </button>
        <button onClick={() => setMode("idle")} className="text-[12px] text-slate">Annuler</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <button onClick={() => setMode("new")} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Nouveau prospect
      </button>
      {contacts.length > 0 && (
        <button onClick={() => setMode("existing")} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
          Rattacher
        </button>
      )}
      <button onClick={() => send({ action: "discard" })} disabled={loading} className="text-[12px] text-rust hover:underline">
        Ignorer
      </button>
    </div>
  );
}
