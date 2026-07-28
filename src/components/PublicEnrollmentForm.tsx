"use client";

import { useState } from "react";

// The public page's only interactive element. Deliberately short: every
// extra field on a public form costs conversions, and everything else the OF
// needs (needs assessment, category, funding) is collected later through the
// flows that already exist once the person is in the CRM.
export function PublicEnrollmentForm({
  courseId,
  mode,
  brandColor,
}: {
  courseId: string;
  mode: "request" | "direct";
  brandColor: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [needsAccommodation, setNeedsAccommodation] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const accent = brandColor || "#1B2430";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/public/course-enrollment/${courseId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        companyName: companyName || undefined,
        message: message || undefined,
        needsAccommodation,
        website,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "L'envoi a échoué. Réessayez dans un instant.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[15px] font-display text-ink mb-1">
          {mode === "direct" ? "Votre inscription est enregistrée" : "Votre demande est bien reçue"}
        </div>
        <p className="text-[13px] text-slate leading-relaxed">
          {mode === "direct"
            ? "Vous recevrez vos accès et les informations pratiques par email."
            : "L'organisme vous recontacte pour confirmer votre inscription et vous transmettre les modalités."}
        </p>
      </div>
    );
  }

  const field =
    "w-full bg-white border border-line rounded-md px-3 py-2 text-[13px] text-ink outline-none focus:border-ink placeholder:text-ash";
  const label = "text-[11.5px] font-semibold text-slate uppercase tracking-wide block mb-1";

  return (
    <div className="bg-white border border-line rounded-card p-5">
      {!open ? (
        <>
          <div className="text-[15px] font-display text-ink mb-1">
            {mode === "direct" ? "S'inscrire à cette formation" : "Demander une inscription"}
          </div>
          <p className="text-[13px] text-slate leading-relaxed mb-3.5">
            {mode === "direct"
              ? "Renseignez vos coordonnées : votre place est réservée immédiatement."
              : "Laissez vos coordonnées, l'organisme revient vers vous avec les modalités et les dates."}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{ backgroundColor: accent }}
            className="text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:opacity-90"
          >
            {mode === "direct" ? "S'inscrire" : "Demander une inscription"}
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-[15px] font-display text-ink">
            {mode === "direct" ? "S'inscrire à cette formation" : "Demander une inscription"}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pe-firstname">Prénom</label>
              <input id="pe-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={field} />
            </div>
            <div>
              <label className={label} htmlFor="pe-lastname">Nom</label>
              <input id="pe-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} required className={field} />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="pe-email">Email</label>
            <input id="pe-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pe-phone">Téléphone (optionnel)</label>
              <input id="pe-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="pe-company">Société (optionnel)</label>
              <input id="pe-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={field} />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="pe-message">Votre message (optionnel)</label>
            <textarea
              id="pe-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Vos attentes, vos contraintes de dates, votre financement envisagé…"
              className={`${field} resize-none`}
            />
          </div>

          <label className="flex items-start gap-2 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={needsAccommodation}
              onChange={(e) => setNeedsAccommodation(e.target.checked)}
              className="mt-0.5 accent-sage"
            />
            <span>
              Je souhaite être contacté(e) au sujet d&apos;un aménagement (situation de handicap).
            </span>
          </label>

          {/* Honeypot — hidden from people, irresistible to bots. */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] w-px h-px opacity-0"
          />

          {error && <div className="text-[12.5px] text-rust">{error}</div>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: accent }}
              className="text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Envoi…" : mode === "direct" ? "Confirmer mon inscription" : "Envoyer ma demande"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
              Annuler
            </button>
          </div>

          <p className="text-[11px] text-slate leading-relaxed">
            Vos données sont transmises à l&apos;organisme de formation pour traiter votre demande. Vous pouvez
            demander leur accès, leur rectification ou leur effacement à tout moment auprès de cet organisme.
          </p>
        </form>
      )}
    </div>
  );
}
