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
// submission API — deliberately reached without a Conforma account, the
// token itself is the access control); the trial signup page (/essai) and
// its account-creation API (/api/signup — no session exists yet, that's
// the whole point of a signup endpoint); the account-activation page
// (/activation/[token], reached by invited team members and learners
// granted platform access — no session exists yet either, the token is
// the access control, same pattern as /formulaire); Stripe's webhook
// callback (/api/webhooks/stripe/[organizationId] — called by Stripe
// itself, no Conforma session exists, the request is authenticated by its
// own Stripe-Signature header instead, see verifyStripeWebhook()); the
// public marketing news page (/actualites) and its newsletter-signup API
// (/api/newsletter — no session exists, visitors aren't Conforma accounts);
// and the marketing/pricing page at the site root. Static assets (_next,
// favicon) are excluded so the app shell can still load its CSS/JS while an
// unauthenticated user is bounced to /login.
// The trailing `|$` is what excludes the *exact* root "/" — everything
// else keeps going through auth (e.g. "/dashboard" still matches, since
// its remainder isn't empty).
export const config = {
  matcher: [
    "/((?!login|formulaire|essai|activation|actualites|api/auth|api/public|api/signup|api/webhooks|api/newsletter|_next/static|_next/image|favicon.ico|$).*)",
  ],
};
