"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

// ---------------------------------------------------------------------------
// Socle de mesure marketing + consentement RGPD (lignes directrices CNIL).
//
// Aucune balise (GA4, GTM, Meta Pixel, LinkedIn Insight) n'est chargée tant
// que l'utilisateur n'a pas donné un consentement explicite — refuser doit
// rester aussi simple qu'accepter (exigence CNIL). Les identifiants sont lus
// depuis des variables d'environnement `NEXT_PUBLIC_*` : tant qu'elles sont
// vides, ce composant est un NO-OP complet (aucune balise, aucune bannière).
//
// Pour ACTIVER la mesure : renseigner un ou plusieurs identifiants dans
// l'environnement (voir .env.example, section "Mesure marketing"), puis
// redéployer. Rien d'autre à toucher — la bannière et les balises
// apparaissent automatiquement.
// ---------------------------------------------------------------------------

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const LINKEDIN_PARTNER_ID = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID ?? "";

const HAS_ANY_TAG = Boolean(GA4_ID || GTM_ID || META_PIXEL_ID || LINKEDIN_PARTNER_ID);
const CONSENT_KEY = "jalon-consent-v1";

type Consent = "granted" | "denied";

export function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored === "granted" || stored === "denied") setConsent(stored);
    setReady(true);
  }, []);

  function choose(value: Consent) {
    window.localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  }

  // No-op complet si aucune balise n'est configurée : ni bannière, ni script.
  if (!HAS_ANY_TAG) return null;

  const showBanner = ready && consent === null;
  const loadTags = consent === "granted";

  return (
    <>
      {loadTags && GA4_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      )}

      {loadTags && GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}

      {loadTags && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}

      {loadTags && LINKEDIN_PARTNER_ID && (
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`_linkedin_partner_id="${LINKEDIN_PARTNER_ID}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      )}

      {showBanner && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="max-w-3xl mx-auto bg-white border border-line rounded-card shadow-lg p-5 sm:p-6">
            <div className="text-[13.5px] font-semibold text-ink mb-1.5">Votre vie privée</div>
            <p className="text-[12.5px] text-slate leading-relaxed mb-4">
              Nous utilisons des cookies de mesure d&apos;audience pour comprendre comment notre site est utilisé
              et améliorer nos contenus. Aucun cookie de mesure n&apos;est déposé sans votre accord. Vous pouvez
              accepter, refuser, ou modifier votre choix à tout moment.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => choose("granted")}
                className="bg-ink text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:bg-ink-soft"
              >
                Tout accepter
              </button>
              <button
                onClick={() => choose("denied")}
                className="bg-white border border-line text-ink text-[13px] font-medium rounded-md px-4 py-2.5 hover:border-ink-soft"
              >
                Tout refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
