# Conforma — Phase 1 scaffold

This is a starting codebase for the product described in `technical-specification.md`
(handed to you alongside this repo). It is **not** a finished MVP — it's the
skeleton a developer can build on: project structure, data model, tenant/role
scoping pattern, and a handful of pages wired to real (if unseeded-by-default)
database queries instead of mock data.

## What's actually built here

- Next.js 14 + TypeScript + Tailwind project structure
- **Full Prisma schema** (`prisma/schema.prisma`) covering every entity described
  in spec §4, including the ones not yet used by a page (GDPR, Qualiopi evidence,
  LMS, email matching) — so the data model doesn't need to be redesigned as each
  module gets built, only the pages/queries for them
- A tenant + role-permission helper (`src/lib/tenant.ts`) — the intended single
  source of truth for "who can see what," mirroring the permission matrix from
  the prototype's Équipe screen
- Nine working pages, each doing a real Prisma query against the schema:
  **Dashboard** (three hand-rolled SVG charts — no charting library, see
  below), **CRM pipeline** (create prospects, change pipeline stage, send the
  needs assessment — see below), **Session planning** (list + calendar month
  view + a per-session detail page with the invitation workflow), Learner
  dossiers (list + detail), **Document library** (see below), **Qualiopi**
  (all three prototype tabs — Indicators, Continuous improvement, Audit
  prep), **GDPR** (all four prototype tabs — Processing register, DPIA,
  Sub-processors & DPA, Data subject rights), Team & roles (member list +
  invite flow + live permission matrix)
- **Dashboard charts** — a single hand-rolled `BarChart` SVG component (no
  charting dependency added), used three times: CRM pipeline by stage,
  upcoming sessions by week, dossier-journey-checklist completion. All three
  are single-series magnitude-by-category, so there's no categorical-palette
  concern — see the dataviz skill notes in the component's comment.
- **CRM** — `/crm` now supports creating a prospect (new or existing
  contact + opportunity), changing an opportunity's pipeline stage inline,
  and sending the needs assessment to a contact (see below). Write actions
  gate on `can(role, "crm") !== "none"`, both in the UI and in the API routes
  (`/api/crm/opportunities`, `/api/crm/opportunities/[id]`).
- **Session/course creation + calendar** — `/planning` gained a "+ Nouvelle
  session" form (pick an existing course or create one inline, assign a
  trainer, format, location, capacity) and a Liste/Calendrier tab toggle; the
  calendar is a month grid (`PlanningCalendar`) with prev/today/next
  navigation via `?month=yyyy-MM`, sessions shown as clickable chips.
  Creation is gated to `can(role, "planning") === "full"` (ADMIN_OF/
  ADMIN_MANAGER) — Trainer/Sales can still see the list/calendar per their
  existing "limited" access.
- **Document library + needs-assessment send tool** (`/documents`,
  `DocumentTemplate` model) — spec §5.8's "legal document toolkit" scoped
  down to a plain editable-text library (not the dynamic merge-field
  personalization engine that full toolkit describes — that's a separate,
  bigger build). Conforma ships 7 starter templates as global reference data
  (`organizationId: null`): CGV, règlement intérieur, convention, and the
  five documents that map onto the dossier journey checklist — recueil des
  besoins, convocation, évaluation à chaud, évaluation à froid. An org
  "adapts" one via **Adapter ce modèle**, which forks it into their own
  editable copy (`forkedFromId` points back at the original; forking twice
  is idempotent — returns the existing fork rather than duplicating it); orgs
  can also add fully custom templates from scratch. **Sending the needs
  assessment to a CRM prospect** is its own tool, deliberately scoped to just
  that one document type rather than a generic "any template, any recipient"
  engine (that's what was actually asked for): a `NeedsAssessmentRequest` is
  created with a random-token link (`/formulaire/[token]`, unauthenticated —
  the token is the capability, excluded from `middleware.ts`'s auth gate)
  where the prospect reads a snapshot of the template and submits a free-text
  response, which flips the request to `completed` and shows up back on the
  CRM card. Like session invitations and Team invites, **no email is
  actually sent** — the link is shown in the CRM UI for the staff member to
  deliver however they currently do.
- **Session invitations** (`/planning/[id]`) — the assigned trainer (or an
  admin) can invite each enrolled learner (Dossier) to a session:
  - **REMOTE/HYBRID**: a video link is generated automatically on first send
    and reused for every subsequent invite to that session (`Session.meetingLink`).
    It's a public Jitsi Meet room (no account/API key needed) — swap for a
    real conferencing API if the client picks one; spec doesn't mandate a
    provider.
  - **IN_PERSON/HYBRID**: a Google Maps link is derived from `Session.location`
    on the fly (not stored), and the invite can carry document attachments —
    either picked from that learner's existing `Document` library, or added
    freely as a title + URL (there's no file-storage/S3 integration yet, so
    "upload" here means linking an already-hosted file; freely-added
    documents are saved as a new `Document` row against that learner's
    dossier, so they show up in the library next time too).
  - Sending flips `Dossier.convocationSent` — this *is* the convocation step
    from the existing dossier journey checklist, not a separate concept.
  - Access is checked with `canManageSessionInvitations()` in `tenant.ts`:
    ADMIN_OF/ADMIN_MANAGER always, TRAINER only for sessions where they're
    the assigned trainer (per spec §2, "their own sessions") — enforced in
    the API route, not just hidden in the UI.
  - Like the Team invite flow, **no email is actually sent** (Brevo isn't
    wired in) — `SessionInvitation` records what would be sent (link +
    attachments + timestamp) as a real audit trail, but delivery is still
    open.
- **Qualiopi indicator reference data** (`QualiopiIndicator` model, seeded
  with the 7 criteria / 32 indicators) — the compliance score and per-criterion
  progress bars on the Indicators tab are computed from real
  `QualiopiIndicatorEvidence` rows, not hardcoded. The Audit prep tab is a
  separate manual checklist (`AuditChecklistItem`) with a text export. Verify
  the indicator wording against the official France Compétences referential
  before relying on it for an actual audit — see the comment on
  `QualiopiIndicator` in `schema.prisma`.
- Every page gates on the permission matrix server-side, not just in the nav:
  a role with `"none"` access to a feature (`crm`, `planning`, `dossiers`,
  `qualiopi`, `rgpd`, `team`) gets redirected rather than just having the nav
  link hidden, and write actions (invite a member, add a processing activity,
  toggle the audit checklist, etc.) check the same matrix in their API route,
  not just in the UI. `DPO_EXTERNAL` is wired as explicitly read-only on GDPR
  per spec §2, via `canWriteRgpd()` in `tenant.ts`.
- **Authentication** — NextAuth (Credentials provider, JWT sessions), gating
  every page under the `(app)` route group via `middleware.ts` +
  `src/app/(app)/layout.tsx`. `src/lib/tenant.ts` now reads the real session
  instead of a stub; every page/query uses `organizationId` from
  `requireSessionContext()`, not a hardcoded demo ID. Swap the Credentials
  provider for Keycloak (per spec §3) when that's ready — the session shape
  (`userId`/`organizationId`/`role`) is the contract the rest of the app
  depends on, so keep it when migrating providers.
- A seed script producing one demo organization consistent with the names/data
  used in the clickable prototype (Formations Nova, Jean Dupuis, Claire Bonnet)

## Second pass — the rest of spec §5

Everything below fills in modules the first pass explicitly left out. None of
it touches a real external account — see "Explicitly stubbed" further down
for what that means in practice for each one.

- **Public marketing page** (`src/app/page.tsx`) — the site root is a real,
  unauthenticated landing page (positioning, feature grid, pricing — spec
  §8's Solo/Team/Growth tiers) with a "Se connecter" link to `/login` and
  "Commencer l'essai" links into the signup flow below.
- **Self-serve trial signup** (`/essai`, `POST /api/signup`) — each pricing
  card links to `/essai?plan=<solo|team|growth>`; the page reads that query
  param to preselect the plan (still editable in the form). Submitting
  creates a real `Organization` + `User` (`ADMIN_OF`, password hashed) +
  `Subscription` (`status: "trialing"`, `trialEndsAt` 14 days out) in one
  transaction, then the client calls `signIn("credentials", ...)` itself
  (same call `LoginForm` makes) and lands on `/dashboard` — no separate
  "check your email" step. Matches spec §8's "14-day trial, no credit card
  required" literally: nothing here collects a card. A trial banner shows
  on the dashboard (`ADMIN_OF` only) with days remaining, linking to
  `/integrations` where a `stripe` credential slot now exists for when a
  real processor is wired in and its webhook starts flipping
  `Subscription.status` on payment events — that plumbing itself isn't
  built, on purpose (no Stripe account was available to build against; see
  `Subscription`'s comment in `schema.prisma`). `middleware.ts`'s matcher
  excludes the exact root path and `/essai`/`/api/signup` (the trailing
  `|$` handles the root; the rest are named) so all three bypass the auth
  gate that protects everything else. An already-authenticated visitor who
  lands on `/essai` gets bounced to `/dashboard`, same as `/login`.
- **Invoicing** (`/facturation`, spec §5.3) — native quote/invoice creation,
  linkable to a Dossier, status tracking (draft/sent/signed/paid/overdue).
  Every invoice defaults to `einvoicingProvider: "ppf"` (the public portal
  fallback) since no Pennylane/Sellsy connector is wired in — see
  `/integrations`.
- **Inbox triage** (`/inbox`, spec §5.11) — the matching logic from the spec
  (Contact-level matching, thread/reference-based Dossier suggestions,
  "emails to sort" for unmatched senders) runs against real `EmailMessage`
  rows; staff can create a prospect, link to an existing contact, or discard.
  No live Gmail/Outlook sync populates those rows — the ones in the seed are
  demo data standing in for a real inbox. Auto-purge after ~30 days (spec
  §5.11 point 5) isn't implemented — needs a scheduled job runner, which this
  scaffold doesn't have.
- **Mail workflow — assignment, replies, client-record sends, follow-ups**
  (built on top of the inbox triage above) — team assignment of any email
  (`EmailMessage.assignedToUserId`, a select on both `/inbox` and the
  dossier's Emails tab); replying to a message (`EmailReplyComposer`) records
  a real threaded `EmailMessage` (`direction: "out"`, `inReplyToId`) with its
  full body, not just a snippet — no real delivery, same constraint as
  everywhere else; an "Assister avec l'IA" button calls
  `/api/inbox/messages/[id]/ai-draft`, which returns a clear 501 pointing at
  `/integrations` rather than faking a completion (needs a real LLM API key
  — Claude/Mistral/OpenAI — none configured). From a Dossier's Info tab,
  "Communications" now covers the three send actions spec'd beyond the
  positioning test (which already had its own flow via
  `NeedsAssessmentRequest`): **Contrat** generates a real merged `Document`
  from the org's `convention` template and tracks it via the new
  `ClientOutreach` model, with a "Marquer signé" action that flips
  `Dossier.contractSigned`; **Convocation** reuses the exact same
  `createSessionInvitation()` logic as `/planning` (factored into
  `src/lib/sessionInvitations.ts` so the two entry points can't drift) rather
  than duplicating it; **Accès plateforme** creates/links a real `LEARNER`
  `User` (or detects one already exists/is active) and issues a genuine
  activation link. The dashboard's new "Relances à faire" widget
  (`src/lib/followUps.ts`) aggregates everything still waiting — positioning
  tests, contracts, platform access — past a 5-day threshold, plus dossiers
  with a session starting soon that still have no convocation sent, scoped
  by the same SALES/TRAINER ownership rules as the rest of the app.
- **Account activation** (`/activation/[token]`) — the missing half of the
  Team invite flow: an invited member (or a learner granted platform access)
  sets their own password via a token-gated public page, same pattern as
  `/formulaire/[token]`, and is signed in automatically afterward. This also
  retroactively fixes Team invites, which previously created `status:
  "invited"` accounts with no way to ever actually activate them.
- **Document merge-field engine** (`src/lib/mergeTemplate.ts`) — the piece
  the first pass's document library explicitly deferred. A template's
  `{{contact.firstName}}`-style placeholders (listed on `/documents`) get
  substituted with real dossier/session/contact/org data and saved as a new
  `Document` (its `bodyText`, viewable via `/api/documents/generated/[id]`).
  Still string substitution, not a layout/PDF engine.
- **LMS** (`/formations`, spec §5.12) — module management per course, and
  progress tracking (`ElearningProgress.percentComplete` +
  `lastEventAt`) editable from both the admin catalog view and the learner's
  own portal. Per-event evidence logging (every login/lesson/quiz timestamped
  individually) isn't implemented — only the latest percentage + timestamp
  per module, which is enough to show engagement but not a full event
  history for a Qualiopi audit trail.
- **BPF report** (`/bpf`, `src/lib/bpfReport.ts`, spec §5.13) — learner
  hours by legal-status category and revenue by funding origin, computed
  from `Dossier`/`Session`/`Invoice` for a selected year, with a text export.
  Needs `Dossier.learnerCategory` and `Invoice.fundingOrigin` actually filled
  in to be meaningful — both default to null ("Non renseigné" in the report)
  until set on the relevant dossier/invoice.
- **Learner & trainer portals** (`/mon-espace`, spec §5.10) — one route,
  branching on role. Learner sees their own `Dossier`(s) (via
  `learnerUserId`) — journey checklist, documents, e-learning progress they
  can update themselves. Trainer sees their own upcoming sessions with
  invitation status, linking out to the existing `/planning/[id]` detail page
  rather than duplicating that UI.
- **Dossier detail — remaining tabs** (`/dossiers/[id]`) — Emails (that
  contact's `EmailMessage` history), Documents (everything attached via
  invitations or the merge engine, plus a free-add form), Données
  personnelles (legal basis/retention + one-click `RightsRequest` creation
  for access/erasure), Preuves Qualiopi (`QualiopiIndicatorEvidence` for that
  dossier). Only Info shipped in the first pass.
- **Ownership scoping** (`canManageOpportunity()`/`canManageSessionInvitations()`
  in `tenant.ts`) — spec §2's "Sales: limited to their own prospects" and
  "Trainer: their own sessions" are now enforced, not just implied by the
  `"limited"` access level: SALES only sees/edits `Opportunity` rows where
  `ownerId` is theirs (set at creation), TRAINER only sees/edits sessions and
  dossiers where they're the assigned trainer, both in the page queries and
  in every relevant API route. ADMIN_MANAGER's `"limited"` stays org-wide —
  that role's restriction is about billing/integrations scope, not row
  ownership, per spec §2.
- **Integrations settings** (`/integrations`) — a place to store Brevo/
  Yousign/Pennylane/Sellsy API keys and Google/Microsoft OAuth client
  credentials per organization (`IntegrationCredential`). Storage only.

### Explicitly stubbed, not really built

None of these actually call an external service — every "send" or "connect"
action in this app produces a real link, record, or file that a human
delivers manually, not an actual delivery:

- No email is ever sent (Team invites, session invitations, needs-assessment
  requests, replies, contract/convocation/platform-access sends) — Brevo
  isn't wired in, regardless of what's saved on `/integrations`. Every one of
  these produces a real link or record that a human relays manually
  (activation link, generated document, meeting link).
- No mailbox is ever synced — `/inbox` runs on seeded demo `EmailMessage`
  rows, not a live Gmail/Outlook connection. Connecting one for real needs a
  registered Google/Microsoft OAuth app — Google's verification for the
  scopes this would need can take weeks, per spec's own note.
- No AI drafts replies — `/api/inbox/messages/[id]/ai-draft` needs a real
  LLM API key (Claude/Mistral/OpenAI) configured on `/integrations` and a
  provider actually wired up to call it; right now it always returns a 501
  explaining why, never a fake completion.
- No e-invoice is ever transmitted — every invoice records
  `einvoicingProvider: "ppf"` as an intent, not an actual PPF/Pennylane/
  Sellsy API call.
- No signature request is ever sent — Yousign isn't called anywhere.
- No payment is ever processed and no Stripe API is ever called — trial
  signup (`/essai`) needs neither, by design (spec §8), but converting a
  trial to a paid `Subscription` afterward has no working mechanism yet:
  saving a key on `/integrations` doesn't do anything, there's no Checkout
  session creation and no webhook route.
- `IntegrationCredential` secrets are stored **in plaintext** — spec §7.1
  requires encryption at rest for exactly this kind of data; don't put real
  production keys in here as-is.

### Still not built at all

CPF/OPCO integration (spec §6 — explicitly out of scope for v1, treat as its
own project if pursued), the e-invoicing/Brevo/Yousign/mailbox connectors
themselves (vs. the settings page and data model that anticipate them), a
real auth provider (Keycloak per spec §3, vs. the Credentials/JWT setup
here), Postgres row-level security (still application-layer-only tenant
isolation, per the flag in spec §10), and per-event LMS evidence logging.
The Qualiopi "one-click evidence export" (spec §5.6) is a text status report
over the checklist, not a bundle of the underlying documents themselves
(zip/PDF).

## Deploying (Vercel + Neon)

There's a live deployment for demo purposes: **https://conforma-app.vercel.app** —
hosted on Vercel (project `conforma1/conforma-app`) against a Neon Postgres
database. This is a real deployment, not a mock: `/essai` there creates a
real account exactly like local dev does. Note this is **not** spec §7.1
compliant hosting (Neon/Vercel aren't French/EU-guaranteed by default) —
fine for a demo, not for real customer data; re-platform to Scaleway/
OVHcloud before that changes.

To redeploy or set up your own instance:

```bash
npx tsx prisma/seed-reference-data.ts     # Qualiopi indicators + starter templates only — no demo org (run once, locally, DATABASE_URL pointed at the target DB)
npx vercel login                          # one-time device-code browser auth
npx vercel link --yes                     # creates/links the Vercel project
npx vercel env add DATABASE_URL production
npx vercel env add NEXTAUTH_SECRET production   # generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx vercel env add NEXTAUTH_URL production      # the deployment's own https URL — set this AFTER the first deploy once you know it, then redeploy
npx vercel --prod --yes
```

`package.json`'s `build` script is `prisma migrate deploy && next build` —
every deploy applies any pending migrations against the production database
before building, so there's no separate manual migration step. This matters
because `vercel env add` (or the CLI's non-interactive defaults) marks new
variables **Sensitive** by default, meaning `vercel env pull` can no longer
retrieve the real value locally once set — `prisma migrate deploy` couldn't
be run from a local shell against production even if you wanted to. Running
it inside the build step sidesteps that: Vercel injects the real value into
the build process itself, it's only CLI/dashboard *retrieval* that's
blocked.

`package.json`'s `postinstall: "prisma generate"` is what makes this work at
all — Vercel does a fresh `npm install` from git (`node_modules` isn't
committed), so without it the Prisma Client generated on your own machine
(with your own machine's binary target) would never get regenerated for
Vercel's Linux runtime.

Don't run `prisma:seed` (the full demo-data seed) against a real deployment
— it's meant for local dev only and creates accounts with a
publicly-documented password. Use `prisma:seed:reference` instead, which
only loads the global Qualiopi/template reference data every org needs;
real accounts come from people actually signing up via `/essai`.

## Running it locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and NEXTAUTH_SECRET at minimum
npm run prisma:migrate    # creates the schema in your Postgres instance
npm run prisma:seed       # loads demo data + seeded logins
npm run dev                # http://localhost:3000 (redirects to /login)
```

Every seeded account uses password `conforma2026` (printed by the seed script
too):

| Email | Role |
|---|---|
| `marie@formations-nova.fr` | Admin OF — full access |
| `claire.bonnet@formations-nova.fr` | Trainer — own sessions/dossiers only, `/mon-espace` |
| `julien.petit@formations-nova.fr` | Sales — own CRM prospects only |
| `jean.dupuis@atlas-conseil.fr` | Learner — own dossier only, `/mon-espace` |

Use the Team & roles screen (Admin OF only) to invite more members and see
the permission matrix per role.

You need a Postgres instance reachable at `DATABASE_URL`. For local development
any Postgres works; for anything beyond local dev, use a French-hosted instance
(Scaleway or OVHcloud, per spec §7.1) — the data-residency requirement isn't
optional once real customer data is involved.

## A few things worth flagging before you go further

- **Multi-tenancy is enforced at the application layer only** (every query
  filters by `organizationId`). This is fine to start, but it means a missed
  `where: { organizationId }` clause anywhere is a tenant data leak. Consider
  Postgres row-level security as defense-in-depth once the schema stabilizes —
  flagged as an open question in spec §10.
- `EmailMessage.contactId` being nullable is intentional — it's how unmatched
  emails end up in the inbox-triage queue rather than being force-linked to
  the wrong contact. Don't "simplify" this to a required field; the matching
  logic in spec §5.11 depends on it.
