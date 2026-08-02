-- Commercial-relationship fields on Contact: industry, sales-set urgency,
-- email/SMS marketing consent (+ timestamp), free-text notes. All nullable
-- — every existing row simply has no answer recorded yet.

ALTER TABLE "Contact"
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "urgencyLevel" TEXT,
  ADD COLUMN "emailConsent" BOOLEAN,
  ADD COLUMN "emailConsentAt" TIMESTAMP(3),
  ADD COLUMN "smsConsent" BOOLEAN,
  ADD COLUMN "smsConsentAt" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT;
