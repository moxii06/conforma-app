/**
 * The origin to build user-facing links and OAuth redirect URIs with.
 *
 * `new URL(request.url).origin` derives from the Host header, which the
 * *caller* controls. That matters most on the password-reset flow: a forged
 * Host puts an attacker's domain in the email the legitimate user receives,
 * and clicking that link hands over the reset token — account takeover
 * without ever touching the victim's mailbox. The same class of problem
 * applies to invitation links (they create accounts) and to OAuth
 * redirect_uri values.
 *
 * NEXTAUTH_URL is the app's canonical, server-configured origin (NextAuth
 * already requires it in production), so it is the right source of truth and
 * is not attacker-influenced. The request-derived origin stays only as a
 * fallback for local development, where NEXTAUTH_URL may be unset.
 */
export function resolveAppOrigin(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Malformed env var: fall through rather than crash a send. Misconfigured
      // is a deployment problem; a thrown error here would surface as "the
      // invitation couldn't be sent", which points at the wrong thing.
    }
  }
  return new URL(request.url).origin;
}
