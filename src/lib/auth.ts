import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GOOGLE_LOGIN_PROVIDER_ID, SOCIAL_LOGIN_DENIED, LOGIN_RATE_LIMITED } from "@/lib/authProviders";
import { checkRateLimit, recordFailure, resetRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

// Why GOOGLE_LOGIN_PROVIDER_ID isn't the default "google":
// /api/auth/callback/google is already a real route in this app (the Gmail
// *mailbox* integration, see src/app/api/auth/callback/google/route.ts), and
// in the App Router a static segment wins over NextAuth's [...nextauth]
// catch-all. Sharing the id would silently route sign-in callbacks into the
// mailbox handler. Two redirect URIs on the same Google Cloud OAuth client,
// two unrelated features.

// Hidden entirely until the OAuth client is configured, same "prepared but
// not yet wired" stance as every other optional integration here — a button
// that can only ever fail is worse than no button.
export const googleLoginEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Social sign-in AUTHENTICATES an existing account — it never creates one.
 *
 * A Google profile carries no organizationId and no role, and there is no
 * honest way to invent either: staff accounts are provisioned by the OF
 * (invite flow in /api/team/members), learner accounts by the platform-access
 * flow. So the verified address has to already match an active staff User,
 * or sign-in is refused.
 *
 * LEARNER is excluded per the client's "staff uniquement" scoping: learner
 * access is granted and revoked by the OF through activation tokens, and an
 * OF that disables a learner expects that to be the end of it — a second,
 * self-service door would quietly work around that.
 */
async function findActiveStaffByEmail(email: string | null | undefined) {
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.status !== "active" || user.role === Role.LEARNER) return null;
  return user;
}

// Credentials provider for Phase 1 local/dev auth. Spec §3 recommends a
// self-hosted provider (Keycloak) for the "hosted in France" positioning —
// swap the provider here when that's wired in; the session shape
// (userId/organizationId/role) below is what the rest of the app depends
// on, so keep that contract when migrating providers.
export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  // error -> /login too: NextAuth's built-in error page is unstyled and
  // English, and every failure it reports here is one the visitor recovers
  // from on the login form anyway. LoginForm reads ?error= and shows the
  // matching French message (generic for anything it doesn't recognise).
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email et mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();

        // Throttled per address rather than per IP: a botnet rotates IPs, the
        // account under attack doesn't. Only FAILED attempts count (see
        // below) — otherwise someone signing in ten times in a normal working
        // day would lock themselves out.
        const gate = await checkRateLimit(`login:${email}`, RATE_LIMITS.login);
        if (!gate.allowed) throw new Error(LOGIN_RATE_LIMITED);

        const user = await prisma.user.findUnique({ where: { email } });

        // Count the miss even when no such account exists: otherwise the
        // limiter itself becomes an oracle for which addresses are real.
        if (!user || !user.passwordHash || user.status !== "active") {
          await recordFailure(`login:${email}`, RATE_LIMITS.login);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          await recordFailure(`login:${email}`, RATE_LIMITS.login);
          return null;
        }

        await resetRateLimit(`login:${email}`);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          role: user.role,
        };
      },
    }),
    ...(googleLoginEnabled
      ? [
          GoogleProvider({
            id: GOOGLE_LOGIN_PROVIDER_ID,
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Default scopes only (openid/email/profile): this flow proves
            // who someone is, nothing more. Reading their mailbox is a
            // separate, explicit opt-in on /integrations with its own
            // consent screen — signing in must never quietly grant it.
            // prompt=select_account so someone with a personal and a
            // professional Google account gets to choose rather than have
            // the browser's default picked for them.
            authorization: { params: { prompt: "select_account" } },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Credentials sign-in was already fully validated in authorize().
      if (account?.provider !== GOOGLE_LOGIN_PROVIDER_ID) return true;

      const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;
      // Google's own verification of the address is the entire basis for
      // matching on email being safe — without it, anyone able to put an
      // arbitrary address on a profile could sign in as that staff member.
      if (!googleProfile?.email_verified) return `/login?error=${SOCIAL_LOGIN_DENIED}`;

      const staff = await findActiveStaffByEmail(googleProfile.email);
      // One generic refusal for "no such account" / "not activated" /
      // "is a learner": saying which one applies would confirm to a stranger
      // whether a given address has an account on this platform.
      if (!staff) return `/login?error=${SOCIAL_LOGIN_DENIED}`;
      return true;
    },
    async jwt({ token, user, account }) {
      // On OAuth sign-in `user` is built from the Google profile: its id is
      // Google's subject and it carries no organizationId/role, so the
      // session contract the whole app depends on (src/lib/tenant.ts) has to
      // come from our own User row. `account` is only set on the initial
      // sign-in, so this runs once — not on every session refresh.
      if (account?.provider === GOOGLE_LOGIN_PROVIDER_ID) {
        const staff = await findActiveStaffByEmail(user?.email ?? token.email);
        // signIn already refused everything this rejects, so getting here
        // means the account was disabled/downgraded mid-flow. Fail closed
        // rather than mint a token with an undefined organizationId — that
        // would be a session with no tenant scoping at all.
        if (!staff) throw new Error("Compte introuvable ou non autorisé pour la connexion Google.");
        token.id = staff.id;
        token.organizationId = staff.organizationId;
        token.role = staff.role;
        token.name = staff.name;
        token.email = staff.email;
        return token;
      }

      if (user) {
        token.id = user.id;
        token.organizationId = user.organizationId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.organizationId = token.organizationId;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
