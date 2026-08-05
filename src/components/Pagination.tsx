import Link from "next/link";

// Server component — plain links, not a client component, since page
// navigation here doesn't need to preserve any local state beyond the URL
// itself (unlike SearchInput's debounce).
export function Pagination({
  basePath,
  searchParams,
  page,
  totalPages,
  // Le nom du paramètre d'URL. Il n'est à changer que sur un écran qui
  // pagine DEUX listes distinctes (le planning : sessions datées d'un côté,
  // formations en continu de l'autre) — sinon les deux se déplaceraient
  // ensemble, ce qui n'a de sens ni pour l'une ni pour l'autre.
  pageKey = "page",
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  pageKey?: string;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== pageKey) params.set(key, value);
    }
    if (targetPage > 1) params.set(pageKey, String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center justify-between text-[12px] text-slate pt-2">
      <div>Page {page} / {totalPages}</div>
      <div className="flex items-center gap-3">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="text-ink underline decoration-line hover:decoration-ink">Précédent</Link>
        ) : (
          <span className="text-ash">Précédent</span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="text-ink underline decoration-line hover:decoration-ink">Suivant</Link>
        ) : (
          <span className="text-ash">Suivant</span>
        )}
      </div>
    </div>
  );
}
