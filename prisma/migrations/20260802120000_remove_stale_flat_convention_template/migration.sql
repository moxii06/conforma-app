-- Retire le modèle de démarrage "Convention de formation professionnelle"
-- (organizationId NULL) resté à l'ancien format à placeholders bruts
-- ([NOM DE L'ORGANISME], etc.) jamais migré vers les balises {{organization.*}}
-- — remplacé par la version "— paragraphes conditionnels" depuis la
-- refonte en blocs conditionnels. Le laisser au catalogue exposait un
-- second choix au même libellé (moins le suffixe) qui ne reprenait jamais
-- les informations légales de l'organisme, quoi qu'on renseigne sur /profil.
--
-- Sans effet sur les documents déjà générés à partir de lui : Document
-- garde son propre bodyText et templateOrigin (une chaîne, pas une clé
-- étrangère) au moment de l'envoi — voir le commentaire de
-- Document.templateOrigin dans schema.prisma.
DELETE FROM "DocumentTemplateBlock"
WHERE "templateId" IN (
  SELECT "id" FROM "DocumentTemplate"
  WHERE "organizationId" IS NULL
    AND "category" = 'convention'
    AND "title" = 'Convention de formation professionnelle'
);

DELETE FROM "DocumentTemplate"
WHERE "organizationId" IS NULL
  AND "category" = 'convention'
  AND "title" = 'Convention de formation professionnelle';
