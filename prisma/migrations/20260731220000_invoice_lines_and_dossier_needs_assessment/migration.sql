-- Deux ajouts indépendants, regroupés pour n'appliquer qu'une migration.
--
-- 1. NeedsAssessmentRequest.dossierId — le recueil des besoins ne savait pas
--    à quel dossier il se rapportait. La complétion devait donc deviner :
--    elle cochait « recueil fait » sur TOUS les dossiers du contact, et
--    rattachait une déclaration de handicap — donnée sensible au sens de
--    l'article 9 — au dossier le plus récent. Pour un apprenant inscrit à
--    deux formations, c'était un pari. Nullable : le recueil part souvent
--    avant l'inscription, auquel cas l'ancien comportement reste le bon.
--
-- 2. InvoiceLine / QuoteLine — le détail de la prestation. Un OPCO qui
--    instruit une prise en charge demande « 2 stagiaires × 3 jours × 350 € »,
--    pas « 2 100 € ». Facultatif : une facture à ligne unique reste valable,
--    et les documents existants n'en ont pas.

-- AlterTable
ALTER TABLE "NeedsAssessmentRequest" ADD COLUMN     "dossierId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "NeedsAssessmentRequest_dossierId_idx" ON "NeedsAssessmentRequest"("dossierId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedsAssessmentRequest" ADD CONSTRAINT "NeedsAssessmentRequest_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

