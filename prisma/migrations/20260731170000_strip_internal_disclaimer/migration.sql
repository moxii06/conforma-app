-- Retire l'avertissement juridique interne du corps des modèles de document.
--
-- Il était préfixé à chaque modèle de démarrage, donc il partait dans le
-- document généré : un prospect recevant son recueil des besoins lisait
-- « [Modèle de démarrage — à faire relire et valider par un juriste avant
-- tout usage réel.] » en première ligne. L'avertissement s'adresse à
-- l'organisme, pas à son client — il est désormais affiché par l'interface.
--
-- Touche aussi les copies adaptées par les organisations (organizationId non
-- nul), que le seed ne réécrit jamais : sans cette migration, un OF ayant
-- forké un modèle garderait l'avertissement à vie.
--
-- Ne touche PAS la table Document : ces lignes sont des documents déjà
-- générés, parfois déjà envoyés et signés. Réécrire leur contenu après coup
-- modifierait un document contractuel existant.

UPDATE "DocumentTemplate"
SET "bodyText" = replace(
  "bodyText",
  E'[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]\n\n',
  ''
)
WHERE "bodyText" LIKE '%Modèle de démarrage — à faire relire%';

UPDATE "DocumentTemplateBlock"
SET "bodyText" = replace(
  "bodyText",
  E'[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]\n\n',
  ''
)
WHERE "bodyText" LIKE '%Modèle de démarrage — à faire relire%';
