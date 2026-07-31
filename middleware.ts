import withAuth from "next-auth/middleware";

// The bare `export { default } from "next-auth/middleware"` form only reads
// NEXTAUTH_SECRET — it doesn't know about the custom sign-in page configured
// in src/lib/auth.ts (that authOptions object is never passed to the edge
// middleware). Without `pages.signIn` here too, unauthenticated visitors get
// bounced to NextAuth's built-in (unstyled) /api/auth/signin instead of our
// /login page.
export default withAuth({
  pages: { signIn: "/login" },
});

// Gate every route except: the login page; NextAuth's own API routes; the
// public prospect-facing needs-assessment form (/formulaire/[token] + its
// submission API — deliberately reached without a Jalon account, the
// token itself is the access control); the trial signup page (/essai) and
// its account-creation API (/api/signup — no session exists yet, that's
// the whole point of a signup endpoint); the account-activation page
// (/activation/[token], reached by invited team members and learners
// granted platform access — no session exists yet either, the token is
// the access control, same pattern as /formulaire); Stripe's webhook
// callback (/api/webhooks/stripe/[organizationId] — called by Stripe
// itself, no Jalon session exists, the request is authenticated by its
// own Stripe-Signature header instead, see verifyStripeWebhook()); the
// public marketing news page (/actualites) and its newsletter-signup API
// (/api/newsletter — no session exists, visitors aren't Jalon accounts);
// the satisfaction questionnaires (/satisfaction/[token] — same token-as-
// access-control pattern as /formulaire: a learner answering an évaluation
// à chaud/à froid has no reason to hold a Jalon account, and these feed
// Qualiopi indicators 11 and 30); the password-recovery pages
// (/mot-de-passe-oublie and /reinitialiser-mot-de-passe/[token] — by
// definition reached by someone who CANNOT sign in, so gating them behind
// a session made the flow circular and locked the user out for good);
// and the marketing/pricing page at the site root. Static assets (_next,
// favicon) are excluded so the app shell can still load its CSS/JS while an
// unauthenticated user is bounced to /login.
// The trailing `|$` is what excludes the *exact* root "/" — everything
// else keeps going through auth (e.g. "/dashboard" still matches, since
// its remainder isn't empty).
export const config = {
  matcher: [
    // api/v1 is the public REST API: it carries its own bearer-token auth
    // (see src/lib/apiAuth.ts), so a NextAuth session redirect here would
    // answer an API call with an HTML login page.
    //
    // api/cron for the same reason, and it was a real bug: Vercel's
    // scheduler carries no session, so both declared crons were being
    // bounced to /login every day and had never actually run. They are
    // gated by CRON_SECRET instead (see src/lib/cronAuth.ts), which now
    // REFUSES in production when the variable is missing — without that,
    // removing them from the middleware would leave them wide open.
    "/((?!login|formulaire|satisfaction|mot-de-passe-oublie|reinitialiser-mot-de-passe|catalogue|essai|activation|actualites|diagnostic-qualiopi|demo|api/auth|api/public|api/v1|api/cron|api/signup|api/webhooks|api/newsletter|_next/static|_next/image|favicon.ico|$).*)",
  ],
};
