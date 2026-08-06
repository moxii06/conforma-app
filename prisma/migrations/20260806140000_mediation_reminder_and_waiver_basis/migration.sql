-- Report du rappel « adhérer à un médiateur de la consommation ».
-- Un report, pas un renoncement : l'obligation de l'art. L.612-1 subsiste,
-- et l'étape de démarrage reste décochée pendant tout ce temps.
ALTER TABLE "Organization" ADD COLUMN     "mediatorReminderSnoozedUntil" TIMESTAMP(3);

-- Sur quel alinéa de l'art. L.221-28 la renonciation repose : 13° (contenu
-- numérique, le droit tombe dès l'accès) ou 1° (service pleinement exécuté
-- dans le délai, le droit tombe à l'achèvement). Nullable : les lignes
-- antérieures reposent toutes sur le 13°, et leur texte accepté le dit déjà.
ALTER TABLE "WithdrawalWaiver" ADD COLUMN     "legalBasis" TEXT;
