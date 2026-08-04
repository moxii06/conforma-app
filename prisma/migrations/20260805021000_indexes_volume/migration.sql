-- Index manquants sur les tables qui grossissent avec le nombre
-- d'apprenants. PostgreSQL ne crée aucun index automatiquement sur une
-- clé étrangère : chacune de ces colonnes était balayée séquentiellement.
-- Purement additif — aucun changement de comportement, uniquement le
-- plan d'exécution.
--
-- Mesuré localement sur 4 000 apprenants / 8 000 dossiers / 8 000 factures
-- / 20 000 emails (voir prisma/seed-volume.ts).

-- CreateIndex
CREATE INDEX "Contact_archivedAt_idx" ON "Contact"("archivedAt");

-- CreateIndex
CREATE INDEX "Document_dossierId_idx" ON "Document"("dossierId");

-- CreateIndex
CREATE INDEX "Dossier_sessionId_idx" ON "Dossier"("sessionId");

-- CreateIndex
CREATE INDEX "Dossier_learnerUserId_idx" ON "Dossier"("learnerUserId");

-- CreateIndex
CREATE INDEX "ElearningProgress_moduleId_idx" ON "ElearningProgress"("moduleId");

-- CreateIndex
CREATE INDEX "EmailMessage_receivedAt_idx" ON "EmailMessage"("receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_ignoredAt_idx" ON "EmailMessage"("ignoredAt");

-- CreateIndex
CREATE INDEX "EmailMessage_rgpdSuggestedType_idx" ON "EmailMessage"("rgpdSuggestedType");

-- CreateIndex
CREATE INDEX "EmailMessage_assignedToUserId_idx" ON "EmailMessage"("assignedToUserId");

-- CreateIndex
CREATE INDEX "EmailMessage_externalThreadId_idx" ON "EmailMessage"("externalThreadId");

-- CreateIndex
CREATE INDEX "Invoice_contactId_idx" ON "Invoice"("contactId");

-- CreateIndex
CREATE INDEX "Invoice_dossierId_idx" ON "Invoice"("dossierId");

-- CreateIndex
CREATE INDEX "Session_courseId_idx" ON "Session"("courseId");

-- CreateIndex
CREATE INDEX "Session_trainerId_idx" ON "Session"("trainerId");

-- CreateIndex
CREATE INDEX "Session_startsAt_idx" ON "Session"("startsAt");

