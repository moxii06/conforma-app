import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Conforma",
};

export default async function ForgotPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return <ForgotPasswordForm />;
}
