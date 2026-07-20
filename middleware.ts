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
// the whole point of a signup endpoint); and the marketing/pricing page at
// the site root. Static assets (_next, favicon) are excluded so the app
// shell can still load its CSS/JS while an unauthenticated user is bounced
// to /login.
// The trailing `|$` is what excludes the *exact* root "/" — everything
// else keeps going through auth (e.g. "/dashboard" still matches, since
// its remainder isn't empty).
export const config = {
  matcher: ["/((?!login|formulaire|essai|api/auth|api/public|api/signup|_next/static|_next/image|favicon.ico|$).*)"],
};
