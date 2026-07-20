import type { Metadata } from "next";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conforma",
  description: "Compliance CRM for French training organizations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
