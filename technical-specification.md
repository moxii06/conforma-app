# Technical specification — Compliance CRM for training organizations (OFP)

**Working name:** Conforma (placeholder — not final)
**Document purpose:** give a developer a clear picture of the product to build, its scope, and the constraints that shape the architecture. This is a specification to scope and estimate work, not a finished design document — technical choices below are proposals to validate with the developer, not fixed decisions.

A clickable UI prototype (React/JSX, static mock data) exists separately and should be reviewed alongside this document — it shows the intended screens, information hierarchy, and interaction patterns for every module described below.

---

## 1. Product summary

A multi-tenant SaaS CRM aimed at **independent training providers and small training organizations** in France ("organismes de formation professionnelle" / OFP, typically 1–20 people). It combines:

- A standard commercial CRM (prospects → quotes → contracts → invoicing)
- Session/training management
- A compliance layer for two French regulatory frameworks: **Qualiopi certification** and **GDPR**
- A legal document toolkit (contract and policy templates, dynamically personalized)
- A lightweight LMS for e-learning content

**Positioning:** simplicity and AI-assisted compliance for micro training organizations, versus existing heavier/more expensive competitors (Digiforma, Dendreo, Ypareo, Intelixa, SmartOF).

**Deployment model:** classic multi-tenant SaaS (one platform, isolated data per customer account), not one instance per client.

---

## 2. Target users and roles

Six roles, each with a different scope of access. The developer should design the permission system around these from day one — retrofitting role-based access later is expensive.

| Role | Scope |
|---|---|
| **Admin OF** | Full access to everything for their organization |
| **Administrative manager** | CRM, sessions, dossiers, Qualiopi, RGPD — no billing/integrations settings |
| **Sales / commercial** | CRM and pipeline only, limited to their own prospects |
| **Trainer** | Their own sessions, attendance sheets, evaluations to fill in |
| **Learner** | Their own dossier only (documents, convocations, evaluations, e-learning) |
| **External DPO** | Read-only access to the GDPR register and AIPD/DPA module, no access to commercial data |

Multi-user accounts (team seats) are required from v1 — this is not a single-user tool.

Two of these roles (trainer, learner) need their own simplified portal UI, distinct from the admin-facing CRM.

---

## 3. Recommended technical stack

These are recommendations to validate with the developer, not constraints imposed by the client.

| Layer | Recommendation | Rationale |
|---|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui | Fast iteration, large ecosystem |
| Backend | Node.js (NestJS) + PostgreSQL | Straightforward to operate; multi-tenancy via `tenant_id` + row-level security rather than one database per client |
| Hosting | **Scaleway or OVHcloud** (France) | Hard requirement — see §7, data residency in France is a core sales argument and a client expectation, not a nice-to-have |
| File storage | S3-compatible object storage from the same French provider | Encryption at rest, data residency |
| Auth | Self-hosted (e.g. Keycloak) rather than a US-based auth provider | Consistency with the "hosted in France" positioning |
| E-signature | **Yousign** (French, eIDAS-compliant, hosted in France) | Preferred over DocuSign for the same data-residency reason |
| Transactional email / reminders | Brevo (French) | GDPR-friendly, handles the automated reminder flows described in §5.5 |
| Optional AI features | Mistral AI (sovereign, EU-hosted) as an alternative/complement to other LLM providers | Lets the product market "AI hosted in Europe" as a differentiator |

None of this is set in stone — the developer should weigh in before implementation starts, especially on the multi-tenancy strategy and auth.

---

## 4. Core data model (conceptual)

This is not a full schema, but the entities the UI and features assume. Get the developer's input on the actual schema design.

- **Organization** (tenant) — the training provider account
- **User** — belongs to an Organization, has one Role
- **Contact** — a person (prospect, learner, company HR contact, trainer). Identified primarily by email address. **A Contact is not the same as a Dossier** — see §5.7, this distinction matters for email auto-linking logic.
- **Company** — optional, a Contact can belong to a Company
- **Dossier** — a specific training engagement for a Contact (one enrollment in one session/cohort). A Contact can have multiple Dossiers over time.
- **Session** — a scheduled instance of a training course (dates, trainer, room or video link, capacity, format: in-person / remote / hybrid)
- **Course / training offer** — the catalog item a Session is an instance of
- **Quote / Invoice** — commercial documents, linked to a Contact/Company and optionally to a Dossier
- **Document** — generated or uploaded files attached to a Dossier (convention, convocation, attendance sheet, certificate, etc.), each with a template origin if generated
- **Processing activity (registre RGPD)** — a documented data processing purpose, with legal basis, retention period, and linked sub-processor if applicable
- **Sub-processor** — third-party vendor processing personal data on the organization's behalf, with DPA status
- **AIPD / DPIA record** — a data protection impact assessment tied to a specific processing activity
- **Rights request** — a GDPR data-subject request (access, erasure, portability, etc.) with a legal deadline
- **Qualiopi indicator evidence** — links specific documents/data points to one of the 32 Qualiopi indicators
- **Non-conformity / complaint / corrective action** — continuous-improvement records required by Qualiopi
- **E-learning module** — lessons and quizzes, linked to a Course, with per-learner progress tracking
- **Email message** — synced from a connected mailbox, linked to a Contact (see §5.7 for the matching logic)

---

## 5. Feature modules

Each module below corresponds to a screen (or set of screens) in the prototype.

### 5.1 Dashboard
Overview for the admin: revenue this month, sessions in progress, Qualiopi compliance score, overdue invoices, a task/reminder list combining commercial, administrative and Qualiopi follow-ups, and a compliance-score visual (circular progress indicator).

### 5.2 CRM / sales pipeline
Standard pipeline: Prospect → Quote sent → Contract signed → Session scheduled → Invoiced. Kanban-style board.

### 5.3 Invoicing
Quotes and invoices, with status tracking (draft, sent, paid, overdue). **Important regulatory constraint — see §7.2**: from September 2026 all French businesses must be able to receive structured e-invoices, and from September 2027 micro/small businesses must issue them in a structured format (Factur-X/UBL/CII) via an accredited platform (PA, formerly PDP). The product does **not** become its own accredited platform — it delegates the compliant transmission to a third-party platform chosen by the client, via a connector architecture (adapter pattern, one adapter per supported provider — Pennylane and Sellsy for v1, plus a fallback to the free public portal PPF for clients who haven't chosen a provider yet).

### 5.4 Session / cohort planning
Calendar/agenda view of scheduled sessions: date, time, format (in-person/remote/hybrid), room or video link, assigned trainer, enrolled/capacity count, and a status flag (confirmed, missing program document, trainer unconfirmed, etc.).

### 5.5 Learner dossier (core object)
Tabbed view per learner enrollment:
- **Info** — training journey checklist (needs assessment, contract signed, convocation sent, attendance, evaluation)
- **Emails** — see §5.7
- **Documents** — generated/uploaded files with download
- **Personal data** — legal basis, retention period, scheduled purge date, and shortcuts to export data (portability) or process an erasure request
- **Qualiopi evidence** — which indicators this dossier's documents serve as proof for

### 5.6 Qualiopi compliance module
Three tabs:
- **Indicators** — progress bar per criterion (the 7 criteria / 32 indicators of the Référentiel National Qualité), overall compliance score, next audit date, and a regulatory-watch panel (RNQ updates, BPF deadline)
- **Continuous improvement** — complaints, non-conformities and suggestions log, with origin, status (in progress / resolved), and due date for corrective actions
- **Audit preparation** — a checklist of evidence categories to gather before the auditor's visit, plus one-click export of the full evidence package

### 5.7 GDPR module
Four tabs:
- **Processing register** — the standard registre des traitements (purpose, legal basis, retention, risk flag)
- **DPIA / AIPD** — impact assessments linked to specific processing activities, with risk level and status
- **Sub-processors & DPA** — vendor list (hosting, e-signature, emailing, invoicing) with data-processing-agreement status per vendor
- **Data subject rights** — logged requests with legal response deadline (1 month, extendable by 2 for complex cases)

### 5.8 Legal document toolkit
Library of templates, grouped by category (contracts/conventions, pedagogical documents, GDPR templates, internal documents). **Templates are authored and maintained by the client (an experienced training-sector lawyer), not generated from scratch by the developer or by AI.** The engineering work here is the **dynamic personalization engine**: merging dossier/session/contact data into a template to produce a filled document, not the legal content itself.

### 5.9 Team & roles
Team member list with invite flow, and a permission matrix (feature × role, three access levels: full / limited-to-own-scope / none) — this should be the actual authorization model, not just a display.

### 5.10 Learner portal & trainer portal
Simplified, role-scoped views (see §2). The learner sees only their own dossier, documents, e-learning progress, and pending actions. The trainer sees only their own upcoming sessions, attendance to complete, and availability settings.

### 5.11 Mailbox integration & inbox triage
See detailed matching logic in the sub-section below — this is one of the trickier pieces of business logic in the product.

**Connecting a mailbox.** OAuth2 connection to Gmail API and Microsoft Graph API for v1 (generic IMAP as a possible later addition, not required for MVP). No password storage — access tokens only, revocable at any time. Google's app verification process for broader scopes can take several weeks, so this should be started in parallel with development, not after.

**Matching logic — do not auto-assign to a single Dossier:**
1. Emails are matched and stored against a **Contact** (by email address), not directly against a Dossier. A Contact can be linked to multiple Dossiers over time (e.g. a repeat client).
2. If a Contact has exactly one linked Dossier, the email is unambiguously associated with it.
3. If a Contact has multiple linked Dossiers, the email is visible from all of them by default. The system may *suggest* a specific Dossier when there's a reliable signal (thread continuity via `In-Reply-To`/`References` headers matching a known thread, or a dossier reference code found in the subject/body) — but never guesses without a signal. Show the suggestion basis in the UI ("suggested by thread" / "suggested by reference").
4. Emails from an address with **no matching Contact** go to an unsorted inbox ("emails to sort"), not into any Dossier. From there, staff can create a new prospect, manually link to an existing contact, or discard.
5. Unsorted emails must be **auto-purged after a defined retention window (e.g. 30 days)** if not triaged — this is a GDPR data-minimization requirement, not just housekeeping.
6. Cc'd addresses can be used to detect additional known Contacts in a thread, but should not silently create new Contact records — surface it as a suggestion instead.

### 5.12 LMS (e-learning)
Simple content delivery: modules made of lessons and quizzes, attached to a Course. Track per-learner progress (percentage complete). **Every login, completed lesson, and quiz result should be timestamped and stored as evidence** — this data feeds directly into Qualiopi indicator evidence (§5.6) and learner dossier tracking (§5.5), so the LMS and the compliance module are not independent subsystems.

### 5.13 BPF (Bilan Pédagogique et Financier)
The annual mandatory report French training organizations file (Cerfa n°10443, deadline April 30). This should **not** be manually re-entered — it's computed automatically from data already in the system: learner counts and hours by legal status category (employees, jobseekers, private individuals, apprenticeship contracts), and revenue by funding origin (companies/OPCO, public bodies, individuals), all sourced from Sessions, Dossiers, and Invoices. The feature is essentially a report generator over existing data plus a Cerfa export, not a new data-entry workflow.

---

## 6. Financing / funding tracking (CPF, OPCO, Pôle emploi)

**Explicitly out of scope for v1.** No EDOF/CPF or OPCO API integration is planned yet. If this becomes a requirement later, treat it as a distinct, larger integration project (these are official government/para-public APIs with their own onboarding processes) — don't assume it's a small add-on.

---

## 7. Regulatory constraints that shape the architecture

These aren't optional nice-to-haves — they should inform technical decisions from the start, not be retrofitted.

### 7.1 GDPR / data residency
- Hosting must be in France (or at minimum EU, with France as the explicit sales argument)
- Encryption at rest and in transit
- Full access traceability/audit log
- Every third-party integration (email, e-signature, invoicing, emailing, AI) needs a documented legal basis and, where applicable, a signed DPA — this is not just a UI feature (§5.7), it's a constraint on which vendors can be integrated at all
- Retention periods and auto-purge logic (see §5.11 point 5, and the 5-year default retention shown for learner dossiers) need to be enforced at the data layer, not just displayed in the UI

### 7.2 French e-invoicing reform
- **1 September 2026**: all VAT-registered French businesses must be able to *receive* structured e-invoices via an accredited platform (PA) or the public portal (PPF)
- **1 September 2027**: micro-businesses, small businesses and freelancers (the product's target segment) must be able to *issue* invoices in a structured format (Factur-X/UBL/CII) the same way
- A plain PDF invoice will no longer be compliant after the applicable deadline
- Product decision (§5.3): don't build a compliant e-invoicing platform in-house — integrate with existing accredited platforms via API, and let each client choose their own

### 7.3 Qualiopi
- The Référentiel National Qualité (7 criteria, 32 indicators) changes periodically — the indicator list and evidence requirements should be data-driven/configurable, not hardcoded, so updates don't require a full redeploy
- BPF and Qualiopi evidence gathering both depend on data already captured elsewhere in the system (sessions, dossiers, LMS) — this reinforces that these modules can't be built as silos; they need consistent underlying data models

---

## 8. Suggested pricing tiers (for context, not a build requirement)

- **Solo** — €39/month: 1 user, up to 15 active learners/month, toolkit included
- **Team** — €89/month: 5 users, unlimited learners, learner/trainer portals, basic LMS
- **Growth** — €149/month: unlimited users, full GDPR/DPIA module, future OPCO integrations
- 14-day free trial, no credit card required

---

## 9. Suggested build priority

The client has validated the full scope above and a prototype exists for every module listed. For an actual MVP build, a phased approach is recommended — this is a suggestion for the developer to push back on based on real effort estimates, not a fixed roadmap:

**Phase 1 (MVP core):**
- Auth, multi-tenancy, roles/permissions foundation
- CRM pipeline + Contact/Dossier data model
- Session planning
- Learner dossier (core tabs: info, documents)
- Basic invoicing (native quote/invoice creation; e-invoicing connector can start with just PPF fallback)
- Mailbox connection (Gmail + Outlook) with the Contact-level matching logic from §5.11 — client has explicitly requested this be in the MVP, not deferred
- Qualiopi indicator dashboard (read/tracking, not yet the full continuous-improvement workflow)
- GDPR processing register (basic)

**Phase 2:**
- Full GDPR module (DPIA, sub-processors, rights requests workflow)
- Qualiopi continuous improvement + audit prep
- Legal document toolkit with dynamic personalization
- Learner & trainer portals
- Team & permissions matrix UI (vs. just enforcing roles in Phase 1)
- Inbox triage screen

**Phase 3:**
- LMS
- BPF automated report
- Additional e-invoicing connectors
- CPF/OPCO integrations (if pursued at all — see §6)

---

## 10. Open questions for the developer

- Multi-tenancy approach: shared schema with row-level security vs. schema-per-tenant vs. database-per-tenant — trade-offs on isolation vs. operational complexity
- Auth: build vs. buy (self-hosted Keycloak vs. a managed EU-based provider, if one exists that satisfies the data-residency requirement)
- Realistic timeline and cost estimate for the Phase 1 scope above
- Whether the mailbox OAuth verification process (Google in particular) should be kicked off before or in parallel with development, given it can be a multi-week bottleneck independent of engineering effort
