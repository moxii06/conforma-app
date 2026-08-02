"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Settings2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Socle de mesure marketing + consentement RGPD (lignes directrices CNIL).
//
// Aucune balise (GA4, GTM, Meta Pixel, LinkedIn Insight) n'est chargée tant
// que l'utilisateur n'a pas donné un consentement explicite — refuser doit
// rester aussi simple qu'accepter, et le choix doit rester modifiable à tout
// moment (exigences CNIL), pas seulement au premier passage : d'où le lien
// "Gérer les cookies" une fois un choix déjà fait. Les identifiants sont lus
// depuis des variables d'environnement `NEXT_PUBLIC_*` : tant qu'elles sont
// toutes vides, ce composant est un NO-OP complet (aucune balise, aucune
// bannière).
//
// Deux finalités, pas quatre fournisseurs : GA4/GTM répondent à la même
// finalité "mesure d'audience" (GTM est explicitement une alternative à GA4
// direct, voir .env.example), Meta Pixel/LinkedIn Insight à la même finalité
// "publicité & réseaux sociaux" — regrouper par finalité plutôt que par nom
// de fournisseur est ce qu'un visiteur peut réellement arbitrer, et une
// catégorie sans aucune balise configurée derrière ne s'affiche pas.
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

const HAS_AUDIENCE_TAG = Boolean(GA4_ID || GTM_ID);
const HAS_ADS_TAG = Boolean(META_PIXEL_ID || LINKEDIN_PARTNER_ID);
const HAS_ANY_TAG = HAS_AUDIENCE_TAG || HAS_ADS_TAG;
const CONSENT_KEY = "jalon-consent-v2";

// Mirrors middleware.ts's matcher: the same set of routes reachable without
// a Jalon session. Marketing/audience measurement only makes sense for an
// anonymous visitor on those pages — mounted in the root layout, this
// component used to render on every authenticated page too (client
// feedback: the collapsed "Gérer les cookies" pill had nowhere safe to sit
// there and started colliding with ordinary page content).
const PUBLIC_PATH_RE =
  /^\/(login|formulaire|satisfaction|mot-de-passe-oublie|reinitialiser-mot-de-passe|catalogue|essai|activation|actualites|diagnostic-qualiopi|demo)(\/|$)|^\/$/;

type Categories = { audience: boolean; ads: boolean };
const REFUSE_ALL: Categories = { audience: false, ads: false };
const ACCEPT_ALL: Categories = { audience: true, ads: true };

function readStoredConsent(): Categories | null {
  const raw = window.localStorage.getItem(CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.audience === "boolean" && typeof parsed.ads === "boolean") return parsed;
  } catch {
    // ignore malformed/legacy value, treated as no consent yet
  }
  return null;
}

export function CookieConsent() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Categories | null>(null);
  const [ready, setReady] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<Categories>(REFUSE_ALL);

  useEffect(() => {
    setConsent(readStoredConsent());
    setReady(true);
  }, []);

  function save(value: Categories) {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    setConsent(value);
    setCustomizing(false);
  }

  function openCustomize() {
    setDraft(consent ?? REFUSE_ALL);
    setCustomizing(true);
  }

  // No-op complet si aucune balise n'est configurée : ni bannière, ni script.
  if (!HAS_ANY_TAG) return null;
  // No-op à l'intérieur de l'application authentifiée : rien n'y est mesuré
  // à des fins marketing, et la bannière/pastille n'y a pas sa place.
  if (!PUBLIC_PATH_RE.test(pathname ?? "")) return null;

  const showPrompt = ready && (consent === null || customizing);

  return (
    <>
      {consent?.audience && GA4_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      )}

      {consent?.audience && GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}

      {consent?.ads && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}

      {consent?.ads && LINKEDIN_PARTNER_ID && (
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`_linkedin_partner_id="${LINKEDIN_PARTNER_ID}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      )}

      {ready && consent !== null && !customizing && (
        <button
          type="button"
          onClick={openCustomize}
          // bottom-RIGHT: bottom-left sat on top of the sidebar's user
          // block ("Déconnexion") on every authenticated page — client
          // feedback. Nothing else in the app anchors fixed bottom-right.
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 text-[11.5px] text-slate hover:text-ink bg-white border border-line rounded-md px-2.5 py-1.5 shadow-sm"
        >
          <Settings2 size={12} />
          Gérer les cookies
        </button>
      )}

      {showPrompt && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="max-w-3xl mx-auto bg-white border border-line rounded-card shadow-lg p-5 sm:p-6">
            {!customizing ? (
              <>
                <div className="text-[13.5px] font-semibold text-ink mb-1.5">Votre vie privée</div>
                <p className="text-[12.5px] text-slate leading-relaxed mb-4">
                  Nous utilisons des cookies de mesure d&apos;audience et, selon les cas, de publicité pour comprendre
                  comment notre site est utilisé et améliorer nos contenus. Aucun cookie de ce type n&apos;est déposé
                  sans votre accord. Vous pouvez accepter, refuser, personnaliser, ou modifier votre choix à tout
                  moment via le lien « Gérer les cookies ».
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => save(ACCEPT_ALL)}
                    className="bg-ink text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:bg-ink-soft"
                  >
                    Tout accepter
                  </button>
                  <button
                    onClick={() => save(REFUSE_ALL)}
                    className="bg-white border border-line text-ink text-[13px] font-medium rounded-md px-4 py-2.5 hover:border-ink-soft"
                  >
                    Tout refuser
                  </button>
                  <button
                    onClick={openCustomize}
                    className="text-ink text-[13px] font-medium underline decoration-line hover:decoration-ink px-1.5 py-2.5"
                  >
                    Personnaliser
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[13.5px] font-semibold text-ink mb-1.5">Personnaliser les cookies</div>
                <p className="text-[12px] text-slate leading-relaxed mb-4">
                  Choisissez ce que vous autorisez, finalité par finalité. Ce choix reste modifiable à tout moment via
                  « Gérer les cookies ».
                </p>
                <div className="flex flex-col gap-3 mb-4">
                  {HAS_AUDIENCE_TAG && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.audience}
                        onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.checked }))}
                        className="mt-0.5 accent-ink w-4 h-4 shrink-0"
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-ink">Mesure d&apos;audience</span>
                        <span className="block text-[11.5px] text-slate">
                          Statistiques de fréquentation anonymisées, pour comprendre ce qui fonctionne sur le site.
                        </span>
                      </span>
                    </label>
                  )}
                  {HAS_ADS_TAG && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.ads}
                        onChange={(e) => setDraft((d) => ({ ...d, ads: e.target.checked }))}
                        className="mt-0.5 accent-ink w-4 h-4 shrink-0"
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-ink">Publicité &amp; réseaux sociaux</span>
                        <span className="block text-[11.5px] text-slate">
                          Mesure de l&apos;efficacité de nos campagnes sur les réseaux sociaux.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => save(draft)}
                    className="bg-ink text-white text-[13px] font-medium rounded-md px-4 py-2.5 hover:bg-ink-soft"
                  >
                    Enregistrer mes choix
                  </button>
                  <button
                    onClick={() => save(REFUSE_ALL)}
                    className="bg-white border border-line text-ink text-[13px] font-medium rounded-md px-4 py-2.5 hover:border-ink-soft"
                  >
                    Tout refuser
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
