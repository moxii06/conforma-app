"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/70 hover:bg-ink-soft hover:text-white w-full text-left"
    >
      <LogOut size={16} />
      Déconnexion
    </button>
  );
}
