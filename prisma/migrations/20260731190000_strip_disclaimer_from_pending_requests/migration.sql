-- Suite de 20260731170000 : l'avertissement interne subsistait dans les
-- recueils des besoins DÉJÀ ENVOYÉS.
--
-- NeedsAssessmentRequest.templateBody n'est pas une référence au modèle mais
-- une COPIE prise au moment de l'envoi — c'est ce qui permet à un formulaire
-- de rester stable même si l'organisme retouche son modèle après coup.
-- Nettoyer DocumentTemplate ne suffisait donc pas : un lien envoyé la
-- semaine dernière et toujours ouvert affichait encore « [Modèle de
-- démarrage — à faire relire et valider par un juriste...] » en première
-- ligne, au prospect.
--
-- Contrairement à la table Document, il n'y a ici aucune raison de préserver
-- l'existant : ce champ est le questionnaire affiché, pas une pièce
-- contractuelle signée. On le nettoie partout, y compris sur les demandes
-- déjà complétées, pour que la trace conservée soit celle qu'on aurait
-- voulu envoyer.

UPDATE "NeedsAssessmentRequest"
SET "templateBody" = replace(
  "templateBody",
  E'[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]\n\n',
  ''
)
WHERE "templateBody" LIKE '%Modèle de démarrage — à faire relire%';
