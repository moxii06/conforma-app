"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Debounced free-text search — writes to the URL (?q=...) rather than local
// state only, so the result list (a server component reading searchParams)
// re-fetches with a real `contains` query instead of filtering an
// already-loaded page client-side. Also clears `page` on every change so a
// new search always starts back at page 1 instead of landing on an
// out-of-range page of the new, usually-shorter result set.
export function SearchInput({ paramKey = "q", placeholder }: { paramKey?: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramKey) ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set(paramKey, value.trim());
      else params.delete(paramKey);
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 350);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal w-full sm:w-64"
    />
  );
}
