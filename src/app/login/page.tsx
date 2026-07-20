import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Connexion — Conforma",
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return <LoginForm />;
}
