// Constants shared between the NextAuth server config (src/lib/auth.ts) and
// the client-side login form. They live here rather than in auth.ts because
// that module pulls in Prisma and bcrypt — importing it from a client
// component would drag the whole server stack into the browser bundle.

// Google sign-in runs on its own provider id instead of NextAuth's default
// "google": /api/auth/callback/google is already a real route in this app
// (the Gmail *mailbox* integration), and a static App Router segment wins
// over NextAuth's [...nextauth] catch-all. See the longer note in auth.ts.
export const GOOGLE_LOGIN_PROVIDER_ID = "google-login";

// Surfaced to /login as ?error= — one code for every refusal reason on
// purpose, so the page can't be used to probe which addresses have accounts.
export const SOCIAL_LOGIN_DENIED = "social_denied";

// Thrown by authorize() when too many failed attempts have piled up on one
// address (see src/lib/rateLimit.ts). Unlike the refusals above this one is
// worth naming: the visitor is very likely the legitimate account holder who
// mistyped, and "email ou mot de passe incorrect" would send them in circles.
// It leaks nothing — the counter increments on failures for any address,
// existing or not.
export const LOGIN_RATE_LIMITED = "login_rate_limited";
