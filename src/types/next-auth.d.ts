import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Extends NextAuth's built-in types with the tenant/role fields the app
// relies on everywhere (see src/lib/tenant.ts) — keeps callbacks in
// src/lib/auth.ts type-safe instead of casting to `any`.
// Pourquoi additionalRoles est optionnel partout : un jeton émis avant
// l'existence du champ n'en porte pas, et il reste valable 30 jours. Le
// lire comme `?? []` — c'est-à-dire « aucun rôle cumulé » — rend alors
// exactement le comportement d'avant, jamais un accès de trop.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: Role;
      // Rôles cumulés en plus du rôle principal (User.additionalRoles).
      // Transporté pour tout consommateur direct de la session ; les
      // écrans et routes passent eux par getSessionContext(), qui relit
      // ce champ en base à chaque requête pour qu'un retrait de casquette
      // prenne effet immédiatement (src/lib/tenant.ts).
      additionalRoles?: Role[];
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
    additionalRoles?: Role[];
    passwordChangedAt?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    organizationId: string;
    role: Role;
    additionalRoles?: Role[];
    passwordChangedAt?: number | null;
  }
}
