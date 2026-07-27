# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Jalon — a Next.js 16 (App Router) + Prisma/PostgreSQL SaaS for French Qualiopi-certified
training organizations (organismes de formation): CRM, session planning, an LMS with
quizzes/certificates, Qualiopi/GDPR/BPF compliance modules, native invoicing, an
automation-rule engine for relances, and a public marketing site. `technical-specification.md`
describes the original target spec — it is not a live description of current state; the
real state is the code plus `README.md`.

**No paying customers yet.** Multi-tenancy is enforced at the application layer only
(every query filters by `organizationId` by convention, not by database-level policy) —
a missed `where: { organizationId }` clause anywhere is a tenant data leak.

## Commands

```bash
npm install
npm run dev                  # http://localhost:3000
npx tsc --noEmit              # type-check (no separate lint/build gate exists beyond this)
npm test                      # vitest run — currently covers only src/lib/tenant.ts and src/lib/lms.ts
npx vitest run path/to.test.ts   # run a single test file
npm run prisma:migrate        # prisma migrate dev (interactive — see migration workflow below)
npm run prisma:seed           # full demo dataset + seeded logins (local only, password conforma2026)
npm run prisma:seed:reference # Qualiopi indicators + starter templates only, no demo org — safe against a real DB
npx prisma studio
```

`npm run build` is `prisma migrate deploy && next build` — every Vercel deploy applies
pending migrations against production before building; there is no separate manual
migration step in normal operation. `postinstall` runs `prisma generate`, required
before any type-check because generated Prisma types are what most of the codebase
type-checks against.

### Migration workflow (Windows-specific)

`prisma migrate dev`'s interactive flow (needs a disposable shadow database) is not
reliable in this dev environment. Migrations are instead hand-built:

```bash
npx prisma migrate diff --from-url <local-db-url> --to-schema-datamodel prisma/schema.prisma --script
# save the output by hand into prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
npx prisma generate
```

Once committed and pushed, the standard `prisma migrate deploy && next build` build
step applies it to production automatically on the next `vercel --prod`. If you have a
normal `prisma migrate dev` setup available, skip all of the above — it's a workaround
for this specific environment, not a project convention.

## Architecture

### Tenant scoping and permissions — the one place a bug becomes a data leak

`src/lib/tenant.ts` is the single source of truth for role access:
`PERMISSIONS: Record<string, Record<Role, AccessLevel>>` (`"full" | "limited" | "none"`),
read via `can(role, feature)`. The Sidebar, page-level redirects, and UI feature-gating
all read from it directly — it should stay the only place that matrix is defined.

That flat matrix can only express "does this role see this section at all," not "their
own records only." Several pages layer a second, query-level ownership filter on top —
the repeated pattern:

```ts
const ownerFilter = role === Role.TRAINER ? { session: { trainerId: userId } } : {};
```

appears in `/dossiers`, `/planning`, `/formations` and elsewhere for TRAINER (own
sessions/dossiers) and SALES (own CRM opportunities, via `canManageOpportunity`/
`canAccessContact` also in `tenant.ts`). Adding a new role or feature means checking
both layers. A `Subcontractor` can be given a real login (`Subcontractor.linkedUserId`)
via the invite flow in `/api/subcontractors/[id]/invite` — it creates a normal `User`
with role `TRAINER`, so it inherits this same scoping automatically; no separate
"or a subcontractor" branch exists elsewhere in the codebase by design.

### The automation-rule engine — reusable infrastructure for relances

Three pieces work together: `src/lib/automationRules.ts` (trigger names/labels via
`AUTOMATION_TRIGGER_VALUES`/`AUTOMATION_TRIGGER_LABELS`), the daily cron handler at
`src/app/api/cron/automation-rules/route.ts` (one function per trigger, dispatched by
`rule.trigger`), and `AutomationRulesPanel.tsx` (the per-course UI, already shared by
every course automatically). Adding a new kind of automated relance never needs a new
UI component: add the trigger to the two exports in `automationRules.ts`, add its
phrasing to `AFTER_DAYS_PHRASING`/`AFTER_DAYS_SUFFIX` in `AutomationRulesPanel.tsx`, and
add a handler + dispatch branch in the cron route. Every automated send also writes a
`ClientOutreach` row with `sentByUserId: "system"`, which is what powers both the
`/automatisations` activity log and the CRM contact timeline — no separate audit-log
model exists.

Some triggers (e.g. `satisfaction_not_collected`, the rolling-access-deadline warnings)
are instead computed live in `src/lib/dashboardTasks.ts` rather than sent by the cron —
that file is the dashboard's single "what needs doing" list, recomputed on every page
load from dossier/invoice/etc. state rather than stored as rows. `DashboardTaskDismissal`
is the only persisted state (keyed by `kind` + `entityId`), since there's otherwise
nothing to mark done.

### LMS completion — one function, several consumers

`src/lib/lms.ts`'s `buildCourseProgress()` (and its thin wrapper `getCourseCompletion()`)
is the single place that turns a course's modules + one dossier's progress rows into
"what should the UI show" / "is this course done." It's pure and unit-tested
(`lms.test.ts`) because it's load-bearing in more places than it looks: the learner
portal's progress bars, the certificate-issuance gate
(`/api/lms/dossiers/[id]/certificate`), the rolling-access-deadline reminders, and the
décrochage (inactivity) detection in `dashboardTasks.ts` all call it rather than
re-deriving completion themselves. A module with no progress row is `"locked"`, not
just "not started" (see `unlockNextModuleIfNeeded`, which is what creates that row);
quiz modules complete via a passed `QuizAttempt`, not `percentComplete`.

Certificates optionally expire: `Course.certificateValidityMonths` (set per course) is
resolved into a concrete `Document.expiresAt` **at the moment a certificate is actually
issued**, not read live from the course — so changing a course's validity setting later
never retroactively alters attestations already granted. The `certificate_expiring`
automation trigger reads `Document.expiresAt` directly for the same reason.

### AI extraction — always a suggestion, never authoritative

Every AI-backed feature in `src/lib/ai.ts` (reply drafting, prospect field extraction,
GDPR email classification, course-info extraction from an uploaded PDF, Qualiopi
indicator summaries) follows the same shape: one platform-level `OPENAI_API_KEY` (not
per-organization — see the file's own top comment), a shared `chatCompletion()` helper
with a strict JSON-only system prompt, defensive `JSON.parse` with type-checked
fallbacks, and the result always lands in an editable field a human reviews before
anything is persisted. No AI output writes to the database directly.

### Document generation and sending

`src/lib/documentSending.ts`'s `buildDocumentAttachment()` is shared by every "send a
document" flow (dossier documents, CRM prospect documents): it turns either a rich-text
template (via `htmlToPdf.ts`'s `generatePdfFromRichText`) or an uploaded file into a
persisted Vercel Blob plus base64 bytes for an email attachment, so a generated and an
uploaded document end up identical from every caller's perspective. `mergeTemplate.ts`
resolves `[Prénom]`/`organization.*`/`course.*`-style merge fields; `mergeTags.ts` is
the separate, smaller tag set used by automation-rule email bodies. Signature completion
(`/api/documents/[id]/sign` stub path and the real Yousign webhook at
`/api/webhooks/yousign/[organizationId]`) both call the same two helpers
(`notifyDocumentSigned`, `syncParcoursFromSignedDocument`) so "what happens when a
document gets signed" exists in exactly one place regardless of which path triggered it.

### Bank reconciliation — suggest, never auto-apply

A bank transaction's label is free text with no invoice reference, unlike Stripe's
Checkout Session metadata — so `src/lib/bankReconciliation.ts`'s `rankInvoiceMatches()`
(exact remaining-balance match + payer name found in the label, see its own comments for
why the scoring is gated the way it is) only ever produces a ranked suggestion that staff
confirms on `/facturation?tab=a-valider`, never an automatic status flip. Two independent
sources feed the same `BankTransaction` table so no OFP is locked out by their bank or
accounting software: a CSV statement import (`bankStatementImport.ts`, always on) and a
live connector to Bridge (`bridge.ts`, a French DSP2/ACPR-licensed open-banking aggregator
covering ~99% of French banks through a single API — hidden until `BRIDGE_CLIENT_ID`/
`_SECRET` are set, same "prepared but not yet wired" stance as every other optional
integration). Unlike most platform-level credentials here, Bridge has no self-serve free
production tier — the sandbox used to build this is free, but going live needs a
commercial agreement with Bridge. (An earlier version of tier 2 targeted GoCardless Bank
Account Data instead; dropped when GoCardless closed new signups for that product.)
`src/lib/payments.ts`'s `recordInvoicePayment()` is the one place a `Payment` row actually
gets created — manual entry, Stripe's webhook, and a confirmed bank match all call it, so
the auto-PAID-once-covered logic can't drift between the three.

### Public vs. authenticated routes

`middleware.ts` gates every route through NextAuth except an explicit allowlist, each
with its own access-control story instead of a session: `/login`, `/essai` (trial
signup) + `/api/signup`, `/activation/[token]` (invited members/learners, pre-account),
`/formulaire/[token]` (public needs-assessment form, prospect-facing), `/actualites` +
`/api/newsletter`, `/api/webhooks/stripe/[organizationId]` (authenticated by its own
Stripe-Signature header), and the marketing root. Read the matcher comment before adding
a new public route — the trailing `|$` is specifically what excludes only the exact
root path.

### Prisma schema

One file, `prisma/schema.prisma` (~54 models) — comments throughout explain *why* a
field or relation exists the way it does (nullable-on-purpose, denormalized-on-purpose,
etc.), not what it is. Read the comment before "simplifying" a field that looks
redundant; e.g. `EmailMessage.contactId` is nullable specifically so an unmatched email
lands in the inbox-triage queue instead of being force-linked to the wrong contact.

## Testing

`vitest.config.ts` + `npm test` currently cover only `src/lib/tenant.ts` and
`src/lib/lms.ts` (the highest-risk pure logic — permission checks and LMS completion
math). Everything else — every API route, every page, every other `src/lib/*.ts` file —
is still only verified by hand (type-check + manually driving a browser against seeded
demo data). Route handlers and anything touching Prisma at import time aren't covered
by the current Vitest setup; that needs a real or mocked database connection this config
doesn't provide. `.github/workflows/ci.yml` runs type-check + `npm test` on push/PR to
`master` — it deliberately does not run `next build`, since that needs a reachable
Postgres to apply migrations against.
