// Suivi des conversions marketing (côté client) — envoie un événement à GA4
// via gtag. NO-OP si la mesure n'est pas chargée : gtag n'existe que lorsque
// l'identifiant GA4 est configuré ET que le visiteur a donné son consentement
// (voir src/components/CookieConsent.tsx). Centralise le nommage des
// événements de conversion pour qu'ils soient importables tels quels dans
// Google Ads.
//
// Événements de conversion utilisés dans l'app :
//   - "sign_up"       → inscription à l'essai (SignupForm)         [conversion principale]
//   - "generate_lead" → diagnostic Qualiopi / demande de démo      [conversions secondaires]
//                       (param `form`: "diagnostic_qualiopi" | "demo_request")
type Params = Record<string, unknown>;

export function trackEvent(name: string, params?: Params): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", name, params ?? {});
}
