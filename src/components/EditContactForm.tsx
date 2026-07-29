"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; firstName: string; lastName: string; email: string; phone: string | null; address: string | null };

export function EditContactForm({ contact, title }: { contact: Contact; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [address, setAddress] = useState(contact.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  // Client feedback: "Modifier" used to sit below every field, easy to
  // miss — it's now on the same row as the card's own title, the first
  // place someone looks for an edit action.
  const header = (
    <div className="flex items-center justify-between mb-3">
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
        >
          Modifier
        </button>
      )}
    </div>
  );

  if (!editing) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-1.5">
          <div>
            <div className="text-[11px] text-slate uppercase tracking-wide">Prénom</div>
            <div className="text-[13px] text-ink">{contact.firstName}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate uppercase tracking-wide">Nom</div>
            <div className="text-[13px] text-ink">{contact.lastName}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate uppercase tracking-wide">Email</div>
            <div className="text-[13px] text-ink">{contact.email}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate uppercase tracking-wide">Téléphone</div>
            <div className="text-[13px] text-ink">{contact.phone || "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate uppercase tracking-wide">Adresse</div>
            <div className="text-[13px] text-ink">{contact.address || "—"}</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Prénom"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Nom"
          className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (optionnel)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Adresse (optionnel)"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-2.5 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !firstName.trim() || !lastName.trim() || !email.trim()}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
      </div>
    </>
  );
}
