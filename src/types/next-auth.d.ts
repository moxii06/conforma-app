import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Extends NextAuth's built-in types with the tenant/role fields the app
// relies on everywhere (see src/lib/tenant.ts) — keeps callbacks in
// src/lib/auth.ts type-safe instead of casting to `any`.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: Role;
      // Epoch ms of User.passwordChangedAt as of sign-in — see
      // getSessionContext()'s freshness check in src/lib/tenant.ts. Absent
      // on tokens issued before this field existed; null when the account
      // has never gone through a password reset.
      passwordChangedAt?: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    organizationId: string;
    role: Role;
    passwordChangedAt?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    organizationId: string;
    role: Role;
    passwordChangedAt?: number | null;
  }
}
