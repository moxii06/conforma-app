"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";

// Lien vers un document qui vient d'être créé. Les dialogues d'envoi
// affichaient l'adresse de stockage brute — deux cents caractères de
// chemin interne, illisibles et sans intérêt pour l'utilisateur quand
// l'email est bien parti (retour client : « pourquoi j'ai ça ? »).
//
// showCopy : réservé au cas où l'email n'a PAS pu partir. C'est le seul
// moment où l'adresse elle-même a une utilité — il faut la transmettre à
// la main — et donc le seul moment où un bouton « copier » a du sens.
export function ResultLink({ url, showCopy = false }: { url: string; showCopy?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) — le lien
      // reste sélectionnable à la main, inutile d'alerter.
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-ink underline decoration-line hover:decoration-ink"
      >
        <ExternalLink size={12} /> Ouvrir le document
      </a>
      {showCopy && (
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate hover:text-ink"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
      )}
    </div>
  );
}
