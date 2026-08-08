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

`npm run build` is `prisma migrate deploy && tsx prisma/seed-reference-data.ts &&
next build` — every Vercel deploy applies pending migrations against production and
then re-seeds the global reference data, so neither needs a manual step. The seed is
in the build because leaving it manual meant it never ran: two conditional document
templates sat in the repo for weeks while production showed "Modèles conditionnels :
0". It only ever upserts rows with `organizationId: null` (Qualiopi indicators, Jalon's
starter templates), never an organization's own adapted copy, and it is idempotent —
repeat runs are a no-op. A failure fails the deploy rather than passing silently.
`postinstall` runs `prisma generate`, required before any type-check because generated
Prisma types are what most of the codebase type-checks against.

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

A person can hold several roles: `User.additionalRoles` (a formateur who is also
commercial), edited from /team. `can()` therefore accepts `Role | Role[]` and returns the
**best** level across the list (`full` > `limited` > `none`) — no composite role is ever
invented. `SessionContext` carries both `role` (the primary one, still what the
query-level ownership filters below key off) and `roles` (the effective list, always
`[role, ...]`). **Passing `session.roles` instead of `session.role` is what makes a screen
honour the cumul**; with an empty `additionalRoles` the two are indistinguishable, which is
why the migration is safe to do screen by screen. `LEARNER` and `ADMIN_OF` cannot be
cumulated (see `NON_CUMULABLE_ROLES`): the first is the OF's customer, the second would
mint a second owner around the "Admin OF can't be reassigned" rule.

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
UI component: add the trigger to the three exports in `automationRules.ts` — values,
labels, and `AUTOMATION_DELAY_PHRASING` — then add a handler + dispatch branch in
`executerReglesRelance` in the cron route.

`AUTOMATION_DELAY_PHRASING` sits beside the labels on purpose: a delay means nothing
without the point it counts *from*, and that point differs per trigger (enrollment,
session end, or counted backwards from a deadline). The panel used to hold two
separate maps and only five of the eight triggers had a suffix, so three rendered
"Relancer après 7 jours" — after what? Each entry now brackets the number
(`avant`/`apres`) so the control reads as a sentence, and `resumerDelaiRegle` gives the
one-line form used in the list of existing rules. What is written there must stay a
faithful translation of the clock in the cron, never an approximation.

Every automated send also writes a
`ClientOutreach` row with `sentByUserId: "system"`, which is what powers both the
`/automatisations` activity log and the CRM contact timeline — no separate audit-log
model exists.

That route is not a straight-line script: Vercel Hobby allows **2 cron jobs**, so all
the daily work lives in one route as an ordered list of named stages run by
`src/lib/cronRunner.ts`. Each run starts where the previous one stopped
(`CronCheckpoint.nextStage`, written *before* each stage so a killed process still
resumes correctly) and rotates, so no stage can be starved by the ones ahead of it —
which is exactly what used to happen to the mailbox sync and the daily digests. A full
pass resets to the nominal order. Adding daily work means adding a stage there, not a
`vercel.json` entry; every stage must be idempotent, since a killed one is replayed.

Some triggers (e.g. `satisfaction_not_collected`, the rolling-access-deadline warnings)
are instead computed live in `src/lib/dashboardTasks.ts` rather than sent by the cron —
that file is the dashboard's single "what needs doing" list, recomputed on every page
load from dossier/invoice/etc. state rather than stored as rows. Two things persist,
since there's otherwise nothing to mark done: `DashboardTaskDismissal` (keyed by `kind`
+ `entityId`) for dismissing one task, and `Organization.tasksHiddenBefore` for hiding
everything older than a date. The second is deliberately *not* a bulk write of the
first — the per-family caps mean a row-per-task rejection both under-covers (it only
sees the capped page) and permanently poisons the cap; a single date applied as the
query floor is exact at any volume. Read that field's schema comment before touching it.

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
`src/lib/payments.ts`'s `recordInvoicePayment()` is where every *live* payment channel
converges — manual entry, Stripe's webhook, and a confirmed bank match all call it, so the
auto-PAID-once-covered logic can't drift between the three. It also fires the
`invoice.paid` webhook and advances the CRM opportunity, which is exactly why the history
import (`/api/import/history`) is the one deliberate exception: it writes its `Payment`
rows directly. Money collected in another tool two years ago is a ledger fact, not an
event — emitting a thousand `invoice.paid` webhooks for it would be false. The rows are
written all the same, because the invoicing screens derive "remaining due" from the sum of
payments, so a PAID invoice with none would read as entirely unpaid.

### Closing a learner file — what goes quiet, and what never does

`Dossier.archivedAt` closes a learner file, and `src/lib/dossierArchive.ts` is the single
place that says what that means — 22 files query dossiers and the answer is not the same in
all of them. Working lists go quiet (`/dossiers` by default, dashboard tasks, the
automation cron, pickers for a *new* action); the BPF, the Qualiopi result indicators, the
learner's own space, invoicing and global search never do. Closing is the OF filing a
record away, never a rewrite of a legal declaration or a revocation of what belongs to the
learner. Archiving a *session* closes its whole cohort in one action — the audit's
complaint was "the 2022 cohort stays in every list forever", and a per-file button alone
would just have been thirty clicks. Note `/dossiers` groups by learner and queries twice
(which learners match, then their dossiers): the closure filter must be on **both** passes,
or a learner retained by a closed file also shows their open ones.

### Lists and pickers at 4 000 learners — two different fixes

A screen that lists and a field that picks are both "too much data", but they are not the
same problem and must not get the same answer.

**A list gets paginated and searchable.** `SearchInput` (URL-driven `?q=`, debounced,
clears `page`) + `Pagination` + a real `count()` next to the page. `/dossiers` is the
reference; `/facturation` (both tabs), `/crm` (both views) and `/inbox` follow it. The
count comes from `count()`, never from `rows.length` — a tab reading "À trier (30)" when
there are 4 025 is worse than no number. Two traps met here: a status filter and a search
that both need `OR` must be combined with `AND: [...]`, or the second silently replaces
the first (see `InvoicesTab`); and a `contact: {…}` clause carrying both the archive
filter and the search makes them a conjunction, so searching in the CRM would have
required the *name* to match as well as the label.

**A picker searches server-side and never preloads.** `/api/contacts/search` and
`/api/dossiers/search` return ~10 rows for a query; `ContactSearchInput` and
`DossierSearchSelect` consume them. Better still, scope the question: the "dossier lié"
of an invoice belongs to the client already chosen, so `DossierSearchSelect` takes a
`contactId` and lists that person's one-to-three files rather than searching 8 000.
`/facturation` alone was sending 22 Mo per page view to fill such a menu.

**`/documents` paginates by batch, not by document**, because a batch is the unit of both
display and action ("relancer les 3 qui n'ont pas signé") and cutting one across two pages
would show "3/6 signés" over four members. Two passes, like `/dossiers`: the seven scalar
columns needed to group and situate *every* matching document, then the full rows for the
current page's batches only. That is also what makes the four tab counts exact — they used
to be computed over a silent `take: 600`.

**Bulk actions name what they touch.** `BulkTaskActionDialog` (dashboard sends) and
`BulkListActionDialog` (invoice status, contact archive) share one rule: you never confirm an
action on forty rows without having read the forty labels, each uncheckable, with the count in
the button. The candidate list comes from the *filtered set*, not the visible page — the filter
you just applied is what defines the batch. Caps live in `lib/bulkLimits.ts` because the page
needs the same number as the route: it decides how many candidates to fetch, and a page
proposing rows the route would reject would fail *after* the click. A batch route reports what
it did and names what it skipped; "c'est fait" without a breakdown is worse than the one-by-one
it replaces. Anything that changes a record goes through the same helper as the single-item
control (`lib/invoiceStatus.ts`), or the two drift on side effects — marking an invoice paid
also advances its CRM deal, and it does *not* record a payment.

**A capped list must say so, and a counter must never be computed on one.** `/automatisations`
read "50 envois ces 30 derniers jours" straight off a `take: 50` list — permanently 50 for any
org that automates seriously. Counters come from `count()`; the list beside them says "les 50
plus récents" when it is truncated. Same rule for the RGPD panel on `/inbox`. `MetricCard`
takes a `number` and formats it (`12 483`, not `12483`) — the one place that rule lives.

Measure before deciding, with `npx tsx prisma/seed-volume.ts` (4 000 learners, 8 000
dossiers/invoices, 4 000 documents, 20 000 emails; `--purge` removes it, by relation from
the marked contacts and not by marker, so rows the app created meanwhile go too).

### Proving a session happened — two shapes, never mixed

A dated cohort proves itself by signatures: `SessionDay` + `AttendanceEntry`, the touch screen at
`/planning/[id]/emargement`. A **rolling** session cannot — nobody signs at 9am when everyone
connects on their own schedule — so it proves itself by `src/lib/activityReport.ts`: modules
completed, first access, last activity, assessments passed, certificate. Article D.6313-3-1 is
what makes this a substitution rather than a gap: for distance learning the law asks for
activities and assessments, not signatures. `mode === "ROLLING"` therefore hides the émargement
entry and the "Journées de la session" block, `/emargement` redirects to `/releve`, and a dated
session with e-learning gets *both* (blended is real).

What the report deliberately does **not** claim: a connection log. `ElearningProgress.lastEventAt`
is one timestamp per module, not a journal — so `ACTIVITY_REPORT_NOTICE` says so, on screen and in
the exported PDF, from a single constant so the two cannot drift. A funder demanding timestamped
connections is asking for something the schema does not hold; that would need a real event table,
which is a schema decision, not a screen tweak. Counting rules follow the BPF's discipline: quizzes
count per *assessment* not per attempt (three tries at one quiz is 1/1, not 3), and "no assessment
at all" prints `—` rather than `0/0`, because a zero reads as failure.

### The BPF and the history import — where "close enough" is not allowed

`src/lib/bpfReport.ts` computes a legally binding annual declaration (Cerfa n°10443) from
data already in the system: learners and hours from dossiers whose **session starts** in
the year, revenue from **PAID invoices created** in it. Two consequences run through the
code and should survive any refactor. First, `resolveSessionHours` has no calendar
fallback: real half-days, then the session's own `declaredHours`, then the course's
nominal duration, then `"unknown"` — which the page *names* rather than silently rounding
(it used to return wall-clock elapsed time and over-declared a 3-day session as 56 hours
instead of 21). Second, every parser feeding it returns `null` rather than a guess; an
unrecognised funding origin shows as "Non renseigné", which is correctable, where a wrong
Cerfa line is not.

`/api/import/history` is what lets a migrating OF have a true BPF for past years — one row
per past enrolment, reconstituting contact → course → shared session → dossier → paid
invoice, all backdated. Backdating is not cosmetic: `Dossier.createdAt` in the past is
what keeps the imported history out of the dashboard's task horizon, and the invoice's
`createdAt` is what files its revenue in the right year. Imported sessions carry
`importedAt` and land archived, so they never appear in the active planning.

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
