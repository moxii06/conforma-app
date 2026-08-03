import type { Metadata } from "next";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, googleLoginEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export async function generateMetadata(props: { searchParams: Promise<{ as?: string }> }): Promise<Metadata> {
  const searchParams = await props.searchParams;
  return { title: searchParams.as === "learner" ? "Connexion" : "Connexion — Jalon" };
}

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <Suspense>
      <LoginForm googleEnabled={googleLoginEnabled} />
    </Suspense>
  );
}
