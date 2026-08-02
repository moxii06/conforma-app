"use client";

import { useRouter } from "next/navigation";

export function PlatformAdminLogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/plateforme/logout", { method: "POST" });
        router.push("/plateforme/connexion");
        router.refresh();
      }}
      className="text-[12px] text-slate hover:text-ink"
    >
      Déconnexion
    </button>
  );
}
