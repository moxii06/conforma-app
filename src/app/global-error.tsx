"use client";

// Remplace TOUT le layout racine — déclenché seulement si celui-ci plante.
// Pas de dépendance à Tailwind ni aux polices next/font (les deux sont
// posées par le layout qui vient d'échouer) : styles en ligne volontairement.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, sans-serif", background: "#F7F5F1" }}>
          <div style={{ background: "#fff", border: "1px solid #E3DED4", borderRadius: 12, padding: 32, maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: "#1C1B19" }}>Une erreur est survenue</div>
            <p style={{ fontSize: 13, color: "#6B6659", lineHeight: 1.5, marginBottom: 20 }}>
              L&apos;application n&apos;a pas pu se charger. Réessayez dans un instant.
            </p>
            <button
              onClick={reset}
              style={{ fontSize: 13, fontWeight: 500, borderRadius: 8, padding: "10px 18px", background: "#1C1B19", color: "#fff", border: "none", cursor: "pointer" }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
