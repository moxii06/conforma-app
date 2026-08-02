import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platformAdmin";

export default async function PlatformAdminProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) redirect("/plateforme/connexion");
  return <>{children}</>;
}
