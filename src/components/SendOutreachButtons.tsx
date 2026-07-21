"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OutreachType = "contract" | "convocation" | "platform_access";

const LABELS: Record<OutreachType, string> = {
  contract: "Envoyer le contrat",
  convocation: "Envoyer la convocation",
  platform_access: "Envoyer l'accès plateforme",
};

export function SendOutreachButtons({ dossierId, showConvocation }: { dossierId: string; showConvocation: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<OutreachType | null>(null);
  const [result, setResult] = useState<{ type: OutreachType; message: string; link?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(type: OutreachType) {
    setLoading(type);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/dossiers/${dossierId}/outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    if (type === "contract") {
      setResult({
        type,
        message: body.emailSent ? "Contrat généré et envoyé par email." : "Contrat généré — email non envoyé, lien à transmettre :",
        link: `/api/documents/generated/${body.document.id}`,
      });
    } else if (type === "convocation") {
      setResult({ type, message: body.meetingLink ? `Convocation envoyée — lien : ${body.meetingLink}` : "Convocation envoyée." });
    } else {
      setResult({
        type,
        message: body.alreadyActive
          ? "Ce compte est déjà actif — accès déjà utilisable."
          : body.emailSent
            ? "Accès créé et lien d'activation envoyé par email."
            : "Accès créé — email non envoyé, lien d'activation à transmettre :",
        link: body.alreadyActive ? undefined : (body.activationUrl ?? undefined),
      });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 flex-wrap">
        <button onClick={() => handleSend("contract")} disabled={loading !== null} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading === "contract" ? "…" : LABELS.contract}
        </button>
        {showConvocation && (
          <button onClick={() => handleSend("convocation")} disabled={loading !== null} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
            {loading === "convocation" ? "…" : LABELS.convocation}
          </button>
        )}
        <button onClick={() => handleSend("platform_access")} disabled={loading !== null} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading === "platform_access" ? "…" : LABELS.platform_access}
        </button>
      </div>
      {result && (
        <div className="text-[11.5px] text-sage">
          {result.message}{" "}
          {result.link && (
            <a href={result.link} target="_blank" rel="noreferrer" className="underline">
              {result.link}
            </a>
          )}
        </div>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
