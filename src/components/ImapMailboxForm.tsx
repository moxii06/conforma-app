"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImapMailboxForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/integrations/imap/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, imapHost, imapPort, smtpHost, smtpPort }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la connexion.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input required type="email" placeholder="Adresse email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        <input required type="password" placeholder="Mot de passe (ou mot de passe d'application)" value={password} onChange={(e) => setPassword(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input required placeholder="Serveur IMAP (ex : imap.hebergeur.fr)" value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        <input required placeholder="Port" value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input required placeholder="Serveur SMTP (ex : smtp.hebergeur.fr)" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        <input required placeholder="Port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      </div>
      <button type="submit" disabled={loading} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start">
        {loading ? "Test de connexion…" : "Tester et connecter"}
      </button>
      {error && <div className="text-[12px] text-rust">{error}</div>}
      <div className="text-[11px] text-slate">
        Ports courants : 993 (IMAP) et 465 (SMTP), les deux en connexion chiffrée. Certains hébergeurs demandent un
        « mot de passe d&apos;application » distinct du mot de passe du compte — vérifiez les paramètres de votre
        fournisseur si la connexion échoue.
      </div>
    </form>
  );
}
