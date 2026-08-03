"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { BookDemoButton } from "@/components/BookDemoButton";
import { trackEvent } from "@/lib/track";
import { Button } from "@/components/ui";

const ORG_SIZES = ["1 personne (indépendant)", "2 à 5 personnes", "6 à 10 personnes", "11 à 20 personnes", "Plus de 20 personnes"];
const TIMELINES = ["Dès que possible", "Sous 3 mois", "Cette année", "Je me renseigne"];

const field = "w-full border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-seal";
const labelCls = "text-[12.5px] text-slate mb-1.5 block";

export function DemoRequestForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [currentTool, setCurrentTool] = useState("");
  const [timeline, setTimeline] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, organizationName, orgSize, currentTool, timeline, message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Une erreur est survenue.");
        setLoading(false);
        return;
      }
      trackEvent("generate_lead", { form: "demo_request" });
      setDone(true);
    } catch {
      setError("Une erreur réseau est survenue.");
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="bg-white border border-line rounded-card p-8 text-center">
        <div className="w-11 h-11 rounded-full bg-sage/15 flex items-center justify-center mx-auto mb-4">
          <Check size={22} className="text-sage" />
        </div>
        <h2 className="font-display text-[22px] text-ink mb-2">Merci {firstName} !</h2>
        <p className="text-[13.5px] text-slate max-w-sm mx-auto mb-5">
          Dernière étape : choisissez directement le créneau qui vous arrange pour votre démonstration.
          Sinon, nous vous recontactons sous 1 jour ouvré au sujet de {organizationName}.
        </p>
        <div className="flex flex-col items-center gap-3">
          <BookDemoButton className="bg-ink text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:bg-ink-soft inline-flex items-center justify-center">
            Choisir mon créneau
          </BookDemoButton>
          <a href="/essai?plan=team" className="text-[13px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Ou commencer l&apos;essai gratuit tout de suite
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-6 flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Prénom *</label>
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={field} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Nom *</label>
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Email professionnel *</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="vous@votre-organisme.fr" />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Organisme *</label>
          <input required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className={field} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Téléphone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} inputMode="tel" placeholder="Facultatif" />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Taille de l&apos;organisme</label>
          <select value={orgSize} onChange={(e) => setOrgSize(e.target.value)} className={field}>
            <option value="">— Sélectionner —</option>
            {ORG_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls}>Échéance</label>
          <select value={timeline} onChange={(e) => setTimeline(e.target.value)} className={field}>
            <option value="">— Sélectionner —</option>
            {TIMELINES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Outil utilisé aujourd&apos;hui</label>
        <input value={currentTool} onChange={(e) => setCurrentTool(e.target.value)} className={field} placeholder="Excel, Digiforma, aucun… (facultatif)" />
      </div>

      <div>
        <label className={labelCls}>Un point particulier à aborder ?</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={field} placeholder="Facultatif" />
      </div>

      {error && <div className="text-[12.5px] text-rust">{error}</div>}

      <Button type="submit" disabled={loading} className="w-full mt-1">
        {loading ? "Envoi…" : "Demander ma démonstration"}
      </Button>
      <div className="text-[11.5px] text-slate text-center">Réponse sous 1 jour ouvré. Aucune carte bancaire, aucun engagement.</div>
    </form>
  );
}
