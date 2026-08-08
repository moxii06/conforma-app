"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import type { SupportKind } from "@/lib/supportRequests";

/**
 * La preuve de traitement : un fichier joint EN PLUS de la note écrite.
 *
 * La note dit ce qui a été fait, la pièce le montre — le courrier de réponse
 * réellement envoyé, le compte rendu d'entretien, l'attestation. C'est ce que
 * demande un auditeur quand il ouvre une réclamation close.
 *
 * Le lien de lecture pointe vers la route API, jamais vers l'URL du blob : le
 * magasin est privé, et une URL de blob distribuée serait un accès permanent
 * et non authentifié à une pièce nominative.
 */
export function SupportProofUpload({
  kind,
  itemId,
  proofFileName,
  hasProof,
}: {
  kind: SupportKind;
  itemId: string;
  proofFileName: string | null;
  hasProof: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function envoyer() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch(`/api/support/proof/${kind}/${itemId}`, { method: "POST", body: formData });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Envoi impossible.");
      return;
    }
    setFile(null);
    setInputKey((k) => k + 1);
    toast.success("Preuve de traitement jointe.");
    router.refresh();
  }

  async function retirer() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/support/proof/${kind}/${itemId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Suppression impossible.");
      return;
    }
    toast.success("Preuve retirée.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-slate uppercase tracking-wide">Preuve de traitement</span>
      {hasProof ? (
        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href={`/api/support/proof/${kind}/${itemId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] text-ink underline decoration-line hover:decoration-ink min-w-0"
          >
            <Paperclip size={13} className="shrink-0" />
            <span className="truncate">{proofFileName ?? "Pièce jointe"}</span>
          </a>
          <Button type="button" variant="tertiary" size="sm" onClick={() => inputRef.current?.click()} disabled={loading}>
            Remplacer
          </Button>
          <Button type="button" variant="tertiary" size="sm" onClick={retirer} disabled={loading}>
            Retirer
          </Button>
        </div>
      ) : (
        <span className="text-[11px] text-slate">
          Facultatif — le justificatif de ce qui a été fait, en plus de la note écrite (10 Mo maximum).
        </span>
      )}
      <div className={`flex items-center gap-2.5 flex-wrap ${hasProof ? "hidden" : ""}`}>
        <input
          key={inputKey}
          ref={inputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-[11.5px] text-ink min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={envoyer} disabled={loading || !file}>
          {loading ? "…" : "Joindre"}
        </Button>
      </div>
      {/* Le champ reste dans le DOM même quand une preuve existe : « Remplacer »
          l'ouvre par la référence, et le bouton d'envoi réapparaît dès qu'un
          fichier est choisi. */}
      {hasProof && file && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] text-ink truncate min-w-0">{file.name}</span>
          <Button type="button" variant="secondary" size="sm" onClick={envoyer} disabled={loading}>
            {loading ? "…" : "Remplacer par ce fichier"}
          </Button>
        </div>
      )}
      {error && <span className="text-[11.5px] text-rust">{error}</span>}
    </div>
  );
}
