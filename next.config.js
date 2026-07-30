/** @type {import('next').NextConfig} */

// Baseline security headers, applied to every route rather than per-page:
// the pages that most need them here (a learner's dossier, a signed
// convention) are exactly the ones nobody remembers to annotate one by one.
//
// No full Content-Security-Policy yet — Next.js injects inline bootstrap
// scripts, so a CSP that actually blocks anything needs nonce plumbing
// through the document. frame-ancestors below already covers the
// clickjacking case, which is the main thing a CSP would buy us today.
const SECURITY_HEADERS = [
  // This app is never meant to be embedded anywhere. frame-ancestors is the
  // modern form; X-Frame-Options stays for browsers that ignore it.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Stops the browser second-guessing our Content-Type — relevant on the
  // document routes, which serve user-supplied filenames.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak dossier/contact ids in the Referer when someone follows a
  // link out of the app.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs these; denying by default stops an injected script
  // from prompting the user on our behalf.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HTTPS only. Vercel already redirects, but this header is what protects
  // the *first* request after someone types the bare domain. Safe here:
  // there is no HTTP-only host in this deployment.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// `experimental.serverActions.allowedOrigins: ["localhost:3000"]` used to sit
// here and shipped to production. It was inert (this app uses API routes
// exclusively — no "use server" anywhere), but it additionally trusted
// localhost as a Server Action origin, so it was worth removing rather than
// leaving as a trap for whoever adds the first Server Action.
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

module.exports = nextConfig;
