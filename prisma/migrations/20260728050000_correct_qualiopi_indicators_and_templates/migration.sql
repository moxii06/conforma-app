-- Corrects the 32 QualiopiIndicator rows seeded for RNQ 2022 (versionId
-- 'rnq2022v1') whose numbering/critère grouping had drifted from the real
-- official referential from indicator 7 onward, and the corresponding
-- reform-draft version ('rnq2026-reforme-projet'). Also backfills two new
-- starter document templates (subcontractor contract with an RNQ clause,
-- handicap partners directory) and patches the CGV template with the
-- médiateur de la consommation clause. Idempotent: existing rows are
-- updated in place (their id, and any FK referencing them such as
-- QualiopiIndicatorEvidence or QualiopiAuditFinding, is preserved); rows
-- that don't exist yet are inserted.

INSERT INTO "QualiopiIndicator" ("id", "versionId", "number", "criterionNumber", "label") VALUES
  (gen_random_uuid()::text, 'rnq2022v1', 1, 1, 'Information accessible au public sur les prestations, délais d''accès et résultats obtenus'),
  (gen_random_uuid()::text, 'rnq2022v1', 2, 1, 'Diffusion d''indicateurs de résultats adaptés à la nature des prestations et des publics'),
  (gen_random_uuid()::text, 'rnq2022v1', 3, 1, 'Information du public sur le taux d''obtention des certifications visées, le cas échéant'),
  (gen_random_uuid()::text, 'rnq2022v1', 4, 2, 'Analyse du besoin du bénéficiaire en lien avec l''entreprise et/ou le financeur'),
  (gen_random_uuid()::text, 'rnq2022v1', 5, 2, 'Détermination d''objectifs opérationnels et évaluables de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 6, 2, 'Détermination de contenus et modalités adaptés aux objectifs de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 7, 2, 'Adéquation du contenu de la prestation aux exigences de la certification visée'),
  (gen_random_uuid()::text, 'rnq2022v1', 8, 2, 'Détermination des procédures de positionnement et d''évaluation des acquis à l''entrée de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 9, 3, 'Information sur les conditions de déroulement de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 10, 3, 'Adaptation de la prestation, son suivi et son évaluation aux publics bénéficiaires'),
  (gen_random_uuid()::text, 'rnq2022v1', 11, 3, 'Évaluation de l''atteinte par les bénéficiaires des objectifs de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 12, 3, 'Mesures favorisant l''engagement des bénéficiaires et prévenant les ruptures de parcours'),
  (gen_random_uuid()::text, 'rnq2022v1', 13, 3, 'Coordination entre le centre de formation et l''entreprise pour le suivi des apprentis (alternance)'),
  (gen_random_uuid()::text, 'rnq2022v1', 14, 3, 'Accompagnement socio-professionnel et exercice de la citoyenneté des apprentis (alternance)'),
  (gen_random_uuid()::text, 'rnq2022v1', 15, 3, 'Information des apprentis sur leurs droits et devoirs (alternance)'),
  (gen_random_uuid()::text, 'rnq2022v1', 16, 3, 'Conditions de présentation des candidats aux épreuves de certification (alternance)'),
  (gen_random_uuid()::text, 'rnq2022v1', 17, 4, 'Adéquation des moyens humains et techniques mobilisés à la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 18, 4, 'Coordination des différents intervenants mobilisés sur la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 19, 4, 'Mise à disposition de ressources pédagogiques et d''un environnement adaptés, y compris à distance'),
  (gen_random_uuid()::text, 'rnq2022v1', 20, 4, 'Personnel dédié à l''accompagnement des apprentis : mobilité, référent handicap, conseil de perfectionnement (CFA)'),
  (gen_random_uuid()::text, 'rnq2022v1', 21, 5, 'Détermination et mobilisation des compétences des intervenants internes et/ou externes'),
  (gen_random_uuid()::text, 'rnq2022v1', 22, 5, 'Complétude et actualisation des compétences des personnels chargés des prestations'),
  (gen_random_uuid()::text, 'rnq2022v1', 23, 6, 'Veille légale et réglementaire sur son secteur d''activité'),
  (gen_random_uuid()::text, 'rnq2022v1', 24, 6, 'Veille sur les évolutions des compétences, métiers et emplois'),
  (gen_random_uuid()::text, 'rnq2022v1', 25, 6, 'Veille sur les innovations pédagogiques et technologiques'),
  (gen_random_uuid()::text, 'rnq2022v1', 26, 6, 'Accueil et accompagnement des personnes en situation de handicap, avec un référent identifié'),
  (gen_random_uuid()::text, 'rnq2022v1', 27, 6, 'Conformité de la sous-traitance ou de la cotraitance au référentiel qualité'),
  (gen_random_uuid()::text, 'rnq2022v1', 28, 6, 'Mobilisation d''un réseau de partenaires socio-économiques utiles à la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 29, 6, 'Insertion professionnelle et poursuite d''étude des bénéficiaires à l''issue de la prestation'),
  (gen_random_uuid()::text, 'rnq2022v1', 30, 7, 'Recueil des appréciations des parties prenantes (bénéficiaires, financeurs, équipes pédagogiques)'),
  (gen_random_uuid()::text, 'rnq2022v1', 31, 7, 'Traitement des difficultés, réclamations, litiges et abandons signalés'),
  (gen_random_uuid()::text, 'rnq2022v1', 32, 7, 'Mise en œuvre d''un dispositif d''amélioration continue à partir des appréciations et réclamations')
ON CONFLICT ("versionId", "number") DO UPDATE SET
  "criterionNumber" = EXCLUDED."criterionNumber",
  "label" = EXCLUDED."label";

INSERT INTO "QualiopiIndicator" ("id", "versionId", "number", "criterionNumber", "label") VALUES
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 1, 1, 'Information accessible au public sur les prestations, délais d''accès et résultats obtenus'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 2, 1, 'Diffusion d''indicateurs de résultats adaptés à la nature des prestations et des publics'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 3, 1, 'Information du public sur le taux d''obtention des certifications visées, le cas échéant'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 4, 2, 'Analyse du besoin du bénéficiaire en lien avec l''entreprise et/ou le financeur'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 5, 2, 'Détermination d''objectifs opérationnels et évaluables de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 6, 2, 'Détermination de contenus et modalités adaptés aux objectifs de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 7, 2, 'Adéquation du contenu de la prestation aux exigences de la certification visée'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 8, 2, 'Détermination des procédures de positionnement et d''évaluation des acquis à l''entrée de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 9, 3, 'Information sur les conditions de déroulement de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 10, 3, 'Adaptation de la prestation, son suivi et son évaluation aux publics bénéficiaires'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 11, 3, 'Évaluation de l''atteinte par les bénéficiaires des objectifs de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 12, 3, 'Mesures favorisant l''engagement des bénéficiaires et prévenant les ruptures de parcours'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 13, 3, 'Coordination entre le centre de formation et l''entreprise pour le suivi des apprentis (alternance)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 14, 3, 'Accompagnement socio-professionnel et exercice de la citoyenneté des apprentis (alternance)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 15, 3, 'Information des apprentis sur leurs droits et devoirs (alternance)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 16, 3, 'Conditions de présentation des candidats aux épreuves de certification (alternance)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 17, 4, 'Adéquation des moyens humains et techniques mobilisés à la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 18, 4, 'Coordination des différents intervenants mobilisés sur la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 19, 4, 'Mise à disposition de ressources pédagogiques et d''un environnement adaptés, y compris à distance'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 20, 4, 'Personnel dédié à l''accompagnement des apprentis : mobilité, référent handicap, conseil de perfectionnement (CFA)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 21, 5, 'Détermination et mobilisation des compétences des intervenants internes et/ou externes'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 22, 5, 'Complétude et actualisation des compétences des personnels chargés des prestations'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 23, 6, 'Veille légale et réglementaire documentée (source, date, décision, preuve d''exploitation)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 24, 6, 'Veille sur les évolutions des compétences, métiers et emplois'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 25, 6, 'Veille sur les innovations pédagogiques et technologiques'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 26, 6, 'Accueil et accompagnement des personnes en situation de handicap, avec traçabilité des aménagements accordés par bénéficiaire et référent handicap formé et actif'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 27, 6, 'Conformité de la sous-traitance ou de la cotraitance au référentiel qualité'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 28, 6, 'Mobilisation d''un réseau de partenaires socio-économiques utiles à la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 29, 6, 'Insertion professionnelle et poursuite d''étude des bénéficiaires à l''issue de la prestation'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 30, 7, 'Recueil des appréciations des parties prenantes (bénéficiaires, financeurs, équipes pédagogiques)'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 31, 7, 'Traitement des difficultés, réclamations, litiges et abandons signalés'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 32, 7, 'Mise en œuvre d''un dispositif d''amélioration continue à partir des appréciations et réclamations'),
  (gen_random_uuid()::text, 'rnq2026-reforme-projet', 33, 7, 'Indicateurs de résultats définis par une méthode de calcul explicite (formule, source, population, exclusions)')
ON CONFLICT ("versionId", "number") DO UPDATE SET
  "criterionNumber" = EXCLUDED."criterionNumber",
  "label" = EXCLUDED."label";

-- Two new starter document templates (organizationId IS NULL = platform-wide
-- reference, per DocumentTemplate's existing convention). No formal unique
-- constraint exists on (organizationId, category, title) — matching the
-- application seed script's own findFirst-then-create logic, guarded here
-- with WHERE NOT EXISTS instead of ON CONFLICT.
INSERT INTO "DocumentTemplate" ("id", "organizationId", "category", "title", "bodyText", "createdAt")
SELECT gen_random_uuid()::text, NULL, 'subcontractor_contract', 'Contrat sous-traitant / intervenant',
  '[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]' || E'\n\n' ||
  'CONTRAT DE SOUS-TRAITANCE / PRESTATION PÉDAGOGIQUE' || E'\n\n' ||
  'Entre [NOM DE L''ORGANISME], d''une part, et [NOM DU PRESTATAIRE / INTERVENANT], d''autre part.' || E'\n\n' ||
  'Article 1 — Objet : le présent contrat a pour objet la réalisation, pour le compte de l''organisme, de tout ou partie de la prestation de formation suivante : [INTITULÉ DE LA FORMATION / MISSION].' || E'\n\n' ||
  'Article 2 — Durée : [DATE DE DÉBUT] au [DATE DE FIN, le cas échéant].' || E'\n\n' ||
  'Article 3 — Obligations du prestataire : qualifications et moyens mobilisés, respect du programme et des modalités pédagogiques définis par l''organisme : [À COMPLÉTER].' || E'\n\n' ||
  'Article 4 — Engagement de conformité au Référentiel National Qualité (RNQ) — indicateur 27 : le prestataire s''engage à exercer sa mission dans le respect des exigences du RNQ applicables à la prestation sous-traitée (information du public, adaptation aux publics, évaluation des acquis, accessibilité aux personnes en situation de handicap notamment), et à fournir à l''organisme, sur demande, tout justificatif permettant d''en attester dans le cadre d''un audit de certification.' || E'\n\n' ||
  'Article 5 — Rémunération et modalités de règlement : [À COMPLÉTER].' || E'\n\n' ||
  'Article 6 — Confidentialité : le prestataire s''engage à ne pas divulguer les informations dont il aurait connaissance dans le cadre de sa mission, notamment les données personnelles des bénéficiaires.' || E'\n\n' ||
  'Article 7 — Résiliation : conditions de résiliation anticipée du présent contrat par l''une ou l''autre des parties : [À COMPLÉTER].',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentTemplate" WHERE "organizationId" IS NULL AND "category" = 'subcontractor_contract' AND "title" = 'Contrat sous-traitant / intervenant'
);

INSERT INTO "DocumentTemplate" ("id", "organizationId", "category", "title", "bodyText", "createdAt")
SELECT gen_random_uuid()::text, NULL, 'handicap_partners', 'Répertoire des partenaires handicap',
  '[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]' || E'\n\n' ||
  'RÉPERTOIRE DES PARTENAIRES HANDICAP' || E'\n\n' ||
  'Réseau national d''acteurs mobilisables pour l''accueil, l''accompagnement et le maintien en formation des personnes en situation de handicap — à compléter avec vos contacts locaux et à tenir à disposition de votre référent handicap et de vos équipes (Qualiopi indicateur 26).' || E'\n\n' ||
  'AGEFIPH (Association de gestion du fonds pour l''insertion professionnelle des personnes handicapées) — financements et appuis pour l''emploi et la formation en milieu ordinaire (secteur privé). agefiph.fr' || E'\n\n' ||
  'FIPHFP (Fonds pour l''insertion des personnes handicapées dans la fonction publique) — équivalent Agefiph pour le secteur public. fiphfp.fr' || E'\n\n' ||
  'Cap emploi — réseau d''accompagnement vers et dans l''emploi des personnes handicapées, présent dans chaque département. Cap emploi le plus proche : [À COMPLÉTER].' || E'\n\n' ||
  'MDPH (Maison départementale des personnes handicapées) — reconnaissance des droits (RQTH notamment) et orientation. MDPH du département : [À COMPLÉTER — coordonnées locales].' || E'\n\n' ||
  'Pôle emploi / France Travail — référents handicap dédiés dans chaque agence pour l''accompagnement des demandeurs d''emploi en situation de handicap.' || E'\n\n' ||
  'Réseau Cheops (Coordination handicap et emploi des organismes de placement spécialisés) — fédère les Cap emploi au niveau national. cheops-ops.org' || E'\n\n' ||
  'Contact interne de l''organisme : le référent handicap désigné (voir fiche équipe) est le premier point d''entrée pour toute demande d''aménagement, avant orientation vers l''un de ces partenaires si nécessaire.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentTemplate" WHERE "organizationId" IS NULL AND "category" = 'handicap_partners' AND "title" = 'Répertoire des partenaires handicap'
);

-- Patch the existing global CGV template with the médiateur de la
-- consommation clause (article 6) — an UPDATE, not an insert, since this
-- template already exists from the initial reference-data seed.
UPDATE "DocumentTemplate"
SET "bodyText" =
  '[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]' || E'\n\n' ||
  'CONDITIONS GÉNÉRALES DE VENTE' || E'\n\n' ||
  '1. Objet — Les présentes conditions régissent les prestations de formation proposées par [NOM DE L''ORGANISME], organisme de formation enregistré sous le numéro [NUMÉRO DE DÉCLARATION D''ACTIVITÉ].' || E'\n\n' ||
  '2. Inscription — Toute inscription est confirmée par la signature d''une convention ou d''un contrat de formation.' || E'\n\n' ||
  '3. Tarifs et règlement — Les prix sont indiqués en euros. Modalités de paiement : [À COMPLÉTER].' || E'\n\n' ||
  '4. Annulation et report — Conditions d''annulation, de report et de remplacement de participant : [À COMPLÉTER].' || E'\n\n' ||
  '5. Accessibilité — Les personnes en situation de handicap peuvent contacter le référent handicap de l''organisme : [COORDONNÉES].' || E'\n\n' ||
  '6. Litiges — En cas de litige, les parties s''efforcent de trouver une solution amiable avant tout recours contentieux. Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, si le client est un consommateur et qu''aucune solution amiable n''a pu être trouvée, il peut recourir gratuitement au service de médiation de la consommation suivant, dans un délai d''un an à compter de sa réclamation écrite auprès de l''organisme : [NOM ET COORDONNÉES DU MÉDIATEUR DE LA CONSOMMATION — voir mediation-conso.fr pour la liste des médiateurs agréés].'
WHERE "organizationId" IS NULL AND "category" = 'cgv' AND "title" = 'Conditions générales de vente';
