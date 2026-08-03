// Rendu par les loading.tsx des écrans les plus lourds (Next.js les affiche
// automatiquement pendant le chargement des données serveur) — une trame
// pâle plutôt que l'écran blanc par défaut de Next.js (audit S6, finding E2).
export function PageLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between px-8 pt-5 pb-4 border-b border-line">
        <div>
          <div className="h-[22px] w-48 bg-pebble rounded" />
          <div className="h-[13px] w-64 bg-linen rounded mt-2" />
        </div>
        <div className="h-10 w-32 bg-pebble rounded-md" />
      </div>
      <div className="p-8 flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 bg-white border border-line rounded-card px-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-linen shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-[13px] w-1/3 bg-linen rounded" />
              <div className="h-[11px] w-1/5 bg-linen rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
