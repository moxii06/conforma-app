-- Numérotation des factures configurable (audit P1).
-- Nullable des deux côtés : une organisation qui n'a rien réglé garde
-- exactement la numérotation actuelle (FAC-<année>-<rang>), aucune
-- renumérotation rétroactive.
ALTER TABLE "Organization" ADD COLUMN "invoicePrefix" TEXT;
ALTER TABLE "Organization" ADD COLUMN "invoiceNextNumber" INTEGER;
