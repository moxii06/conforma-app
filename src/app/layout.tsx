import type { Metadata } from "next";
import { Libre_Caslon_Text, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import "./globals.css";

// Titles get a classic serif with real ink (Libre Caslon Text); body copy
// and UI chrome get a humanist, official-feeling sans (IBM Plex, designed
// for IBM's own documentation — reads as "written by an institution," not
// a generic product sans); numbers that line up in columns (metrics,
// registers) get its monospace companion so digits stay tabular.
const displayFont = Libre_Caslon_Text({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display" });
const sansFont = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Conforma",
  description: "Compliance CRM for French training organizations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
