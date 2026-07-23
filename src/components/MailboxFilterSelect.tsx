"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Connection = { id: string; provider: string; accountEmail: string };

export function MailboxFilterSelect({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("mailbox") ?? "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("mailbox");
    else params.set("mailbox", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (connections.length < 2) return null;

  return (
    <select
      value={current}
      onChange={(e) => handleChange(e.target.value)}
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
    >
      <option value="all">Toutes les boîtes</option>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.accountEmail}
        </option>
      ))}
    </select>
  );
}
