"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-mist p-4">
      <div className="bg-white border border-line rounded-card p-8 max-w-sm text-center">
        <div className="font-display text-[28px] text-ink mb-2">Une erreur est survenue</div>
        <p className="text-[13px] text-slate leading-relaxed mb-5">
          Quelque chose s&apos;est mal passé. Vous pouvez réessayer, ou revenir à l&apos;accueil.
        </p>
        <div className="flex items-center justify-center gap-2.5">
          <Button variant="secondary" onClick={reset}>Réessayer</Button>
          <Button href="/">Accueil</Button>
        </div>
      </div>
    </div>
  );
}
