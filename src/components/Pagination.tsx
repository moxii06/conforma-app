import Link from "next/link";

// Server component — plain links, not a client component, since page
// navigation here doesn't need to preserve any local state beyond the URL
// itself (unlike SearchInput's debounce).
export function Pagination({
  basePath,
  searchParams,
  page,
  totalPages,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
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
          <span className="text-[#B9B6AA]">Précédent</span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="text-ink underline decoration-line hover:decoration-ink">Suivant</Link>
        ) : (
          <span className="text-[#B9B6AA]">Suivant</span>
        )}
      </div>
    </div>
  );
}
