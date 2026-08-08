"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui";
import { DialogShell } from "@/components/DialogShell";
import { QUESTIONS_COMPETENCE } from "@/lib/subcontractorQuestionnaire";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.TRAINER, label: "Formateur" },
  { value: Role.SALES, label: "Commercial" },
  { value: Role.ADMIN_MANAGER, label: "Admin (accès limité)" },
];

// L'invitation partait avec un texte figé — « X vous invite à rejoindre
// l'espace Y » — sans un mot sur la prestation attendue ni sur ce qu'on
// demande à l'intervenant. Deux ajouts, tous deux facultatifs : un mot
// d'accompagnement, et le questionnaire de compétence à l'entrée
// (indicateur Qualiopi 21), qui est le moment naturel pour le poser.
export function InviteSubcontractorButton({
  subcontractorId,
  hasEmail,
  nom,
}: {
  subcontractorId: string;
  hasEmail: boolean;
  nom: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(Role.TRAINER);
  const [message, setMessage] = useState("");
  const [joindreQuestionnaire, setJoindreQuestionnaire] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ activationUrl: string; emailSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, message: message.trim() || undefined, joindreQuestionnaire }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'invitation.");
      return;
    }
    const body = await res.json();
    setResult({ activationUrl: body.activationUrl, emailSent: body.emailSent });
    setOpen(false);
    router.refresh();
  }

  if (!hasEmail) {
    return <span className="text-[11px] text-slate">Ajoutez un email de contact pour pouvoir inviter</span>;
  }

  if (result) {
    return (
      <div className="text-[11.5px] text-sage">
        {result.emailSent ? "Invitation envoyée par email." : "Compte créé — lien à transmettre :"}
        {!result.emailSent && (
          <a href={result.activationUrl} target="_blank" rel="noreferrer" className="text-ink underline ml-1 break-all">
            {result.activationUrl}
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Inviter sur la plateforme
      </button>
      {open && (
        <DialogShell title={`Inviter ${nom}`} subtitle="Un compte est créé et le lien d'activation part par email." onClose={() => setOpen(false)}>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-slate uppercase tracking-wide">Rôle sur la plateforme</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-slate uppercase tracking-wide">Mot d&apos;accompagnement</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Ex. : Suite à notre échange, voici votre accès pour la session Excel de septembre. Merci de déposer votre attestation URSSAF avant le 1er."
              className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-y"
            />
            <span className="text-[11px] text-slate">Inséré en tête de l&apos;email, avant le lien d&apos;activation. Facultatif.</span>
          </label>

          <div className="bg-linen border border-line rounded-md p-3 flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={joindreQuestionnaire}
                onChange={(e) => setJoindreQuestionnaire(e.target.checked)}
                className="accent-sage"
              />
              Joindre le questionnaire de compétence à l&apos;entrée
            </label>
            <div className="text-[11px] text-slate">
              Trois questions posées à l&apos;intervenant, qu&apos;il renseigne depuis son espace. La réponse revient
              dans ses documents et coche la pièce correspondante (indicateur Qualiopi 21).
            </div>
            <ul className="text-[11px] text-slate list-disc pl-4">
              {QUESTIONS_COMPETENCE.map((q) => (
                <li key={q.cle}>{q.libelle}</li>
              ))}
            </ul>
          </div>

          {error && <div className="text-[11.5px] text-rust">{error}</div>}
          <div className="flex items-center justify-end gap-2.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="button" size="sm" onClick={handleInvite} disabled={loading}>
              {loading ? "…" : "Envoyer l'invitation"}
            </Button>
          </div>
        </DialogShell>
      )}
    </>
  );
}
