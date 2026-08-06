import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Jalon's own starter document library — global templates
// (organizationId: null) every org sees and can adapt. These are structural
// skeletons, not vetted legal text: spec §5.8 is explicit that template
// content is client-authored (a training-sector lawyer), not written by the
// developer or an AI. Hence the disclaimer prepended to every one of them.
//
// Lives here rather than inside either seed because both need it: the demo
// seed (prisma/lib/seed-base.ts) and the reference-data seed
// (prisma/seed-reference-data.ts, the one safe to run against a real
// database). It used to be copy-pasted into both — byte-identical, ~17 KB —
// which meant every wording fix had to be made twice and the merge-field
// correction actually was. One copy, two callers.

// L'avertissement juridique ne vit PLUS dans le corps des modèles.
//
// Il y était préfixé à chaque bodyText, donc il partait dans le document
// généré : un prospect recevant son recueil des besoins lisait « [Modèle de
// démarrage — à faire relire et valider par un juriste avant tout usage
// réel.] » en première ligne. L'avertissement s'adresse à l'organisme, pas à
// son client.
//
// Il est désormais affiché par l'interface, sur les modèles Jalon
// (organizationId === null) — au moment où l'OF les consulte et les adapte,
// c'est-à-dire là où il peut agir dessus. Voir STARTER_TEMPLATE_NOTICE.
export const STARTER_TEMPLATE_NOTICE =
  "Modèle de démarrage fourni par Jalon — à faire relire et valider par un juriste avant tout usage réel.";

export type StarterBlock = { bodyText: string; conditions: { questionKey: string; in: string[] }[] | null };
export const STARTER_TEMPLATES: { category: string; title: string; bodyText: string; blocks?: StarterBlock[] }[] = [
  {
    category: "cgv",
    title: "Conditions générales de vente",
    bodyText:
      "CONDITIONS GÉNÉRALES DE VENTE\n\n" +
      "1. Objet — Les présentes conditions régissent les prestations de formation proposées par [NOM DE L'ORGANISME], organisme de formation enregistré sous le numéro [NUMÉRO DE DÉCLARATION D'ACTIVITÉ].\n\n" +
      "2. Inscription — Toute inscription est confirmée par la signature d'une convention ou d'un contrat de formation.\n\n" +
      "3. Tarifs et règlement — Les prix sont indiqués en euros. Modalités de paiement : [À COMPLÉTER].\n\n" +
      "4. Annulation et report — Conditions d'annulation, de report et de remplacement de participant : [À COMPLÉTER].\n\n" +
      "5. Accessibilité — Les personnes en situation de handicap peuvent contacter le référent handicap de l'organisme : [COORDONNÉES].\n\n" +
      "6. Litiges — En cas de litige, les parties s'efforcent de trouver une solution amiable avant tout recours contentieux. Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, si le client est un consommateur et qu'aucune solution amiable n'a pu être trouvée, il peut recourir gratuitement au service de médiation de la consommation suivant, dans un délai d'un an à compter de sa réclamation écrite auprès de l'organisme : [NOM ET COORDONNÉES DU MÉDIATEUR DE LA CONSOMMATION — voir mediation-conso.fr pour la liste des médiateurs agréés].",
  },
  {
    category: "internal_rules",
    title: "Règlement intérieur",
    bodyText:
      "RÈGLEMENT INTÉRIEUR\n\n" +
      "Établi conformément aux articles L.6352-3 à L.6352-5 et R.6352-1 à R.6352-15 du Code du travail\n\n" +
      "Titre préliminaire — Objet et champ d'application\n\n" +
      "Article 1er. Le présent règlement intérieur s'applique à tout stagiaire inscrit à une action de formation dispensée par {{organization.name}}, quelles qu'en soient les modalités — présentielles, à distance, ou les deux —, pour toute la durée de cette action.\n\n" +
      "Toute personne suivant une action de formation dispensée par {{organization.name}} est réputée avoir pris connaissance et accepté les termes du présent règlement du seul fait de son inscription.\n\n" +
      "Titre I — Dispositions applicables à la formation à distance\n\n" +
      "Article 2 — Conduite lors des sessions à distance. Lors des classes virtuelles et des échanges à distance (visioconférence, messagerie, espaces de discussion entre participants), le stagiaire s'engage à respecter les mêmes règles de courtoisie et de comportement qu'en présentiel : ponctualité de connexion, respect des consignes du formateur relatives à l'usage de la caméra et du micro, respect de la parole d'autrui. Sont interdits tout propos discriminatoire, injurieux, diffamatoire ou contraire à l'ordre public, ainsi que tout débat étranger à l'objet de la formation portant sur des sujets politiques ou religieux.\n\n" +
      "Article 3 — Accès personnel et confidentialité. Les identifiants de connexion à la plateforme de formation sont personnels, confidentiels et incessibles. Le stagiaire s'interdit de les communiquer à un tiers et répond de tout usage effectué au moyen de ses identifiants.\n\n" +
      "Titre II — Dispositions applicables à la formation en présentiel\n\n" +
      "Article 4 — Hygiène et sécurité. Le stagiaire respecte les consignes d'hygiène et de sécurité applicables dans les locaux où se déroule la formation, y compris, lorsque la formation a lieu dans des locaux qui ne sont pas ceux de {{organization.name}}, le règlement intérieur du site d'accueil. Les consignes de sécurité incendie et la procédure à suivre en cas d'accident sont affichées dans les locaux et rappelées en début de formation.\n\n" +
      "Article 5 — Matériel. Le stagiaire conserve en bon état le matériel mis à sa disposition pour la formation et le restitue en fin d'action. Toute dégradation résultant d'un usage non conforme à sa destination pourra faire l'objet d'une réclamation. Il est interdit d'introduire dans les systèmes informatiques de {{organization.name}} tout programme ou fichier non autorisé.\n\n" +
      "Titre III — Discipline et assiduité\n\n" +
      "Article 6 — Comportement. Chaque stagiaire adopte un comportement garantissant le respect des règles élémentaires de savoir-vivre et de savoir-être en collectivité, ainsi que le bon déroulement de la formation. Sont notamment prohibés tout comportement discriminatoire, violent ou injurieux envers les autres stagiaires, les formateurs ou le personnel de {{organization.name}}, ainsi que la consommation d'alcool ou de substances illicites dans les locaux de formation.\n\n" +
      "Article 7 — Assiduité.\n\n" +
      "7.1 Le stagiaire suit avec assiduité l'intégralité des séances et activités prévues au programme, aux horaires communiqués.\n\n" +
      "7.2 Toute absence ou retard est justifié auprès de {{organization.name}} dans les meilleurs délais. Lorsque la formation fait l'objet d'une prise en charge par un financeur, celui-ci est informé de toute absence non justifiée, qui peut entraîner l'interruption de la prise en charge.\n\n" +
      "7.3 L'assiduité est établie, pour les sessions en présentiel, par la signature d'une feuille d'émargement, et pour les sessions à distance, par les relevés de connexion et de progression sur la plateforme de formation. Ces éléments constituent la preuve exclusive de la présence ; toute falsification expose son auteur aux sanctions prévues à l'article 9.\n\n" +
      "Article 8 — Évaluations et certifications. Toute fraude ou tentative de fraude commise à l'occasion d'une évaluation ou d'une épreuve de certification — utilisation de documents ou de matériel non autorisés, communication avec un tiers, usurpation d'identité — entraîne la nullité de l'épreuve concernée, sans préjudice des sanctions disciplinaires prévues à l'article 9.\n\n" +
      "Titre IV — Sanctions\n\n" +
      "Article 9 — Sanctions disciplinaires.\n\n" +
      "9.1 Constitue une sanction, au sens du présent règlement et conformément à l'article R.6352-3 du Code du travail, toute mesure, autre que les observations verbales, prise par {{organization.name}} à la suite d'un agissement du stagiaire considéré par elle comme fautif, que cette mesure soit de nature à affecter immédiatement ou non la présence de l'intéressé en formation ou à mettre en cause la continuité de la formation qu'il reçoit.\n\n" +
      "9.2 Selon la gravité du manquement, les sanctions susceptibles d'être prononcées sont, par ordre croissant : le rappel à l'ordre, l'avertissement écrit, l'exclusion temporaire, l'exclusion définitive de la formation. Aucune sanction pécuniaire n'est autorisée.\n\n" +
      "9.3 Lorsque le stagiaire est salarié, son employeur et, le cas échéant, le financeur de l'action sont informés de toute sanction prononcée.\n\n" +
      "Article 10 — Garanties disciplinaires.\n\n" +
      "10.1 Aucune sanction ne peut être infligée sans que le stagiaire ait été informé au préalable des griefs retenus contre lui.\n\n" +
      "10.2 Lorsque {{organization.name}} envisage une sanction ayant une incidence, immédiate ou non, sur la présence du stagiaire en formation, elle le convoque, par lettre recommandée avec avis de réception ou remise contre décharge, à un entretien préalable, en lui indiquant l'objet de la convocation, la date, l'heure et le lieu de cet entretien, ainsi que la possibilité de se faire assister par une personne de son choix, conformément à l'article R.6352-5 du Code du travail.\n\n" +
      "10.3 Au cours de l'entretien, le stagiaire est mis à même de fournir des explications.\n\n" +
      "10.4 La sanction ne peut intervenir moins d'un jour franc ni plus de quinze jours après l'entretien, ou après la date à laquelle le stagiaire a été informé des griefs retenus contre lui s'il n'y a pas eu d'entretien. Elle fait l'objet d'une décision écrite et motivée, notifiée à l'intéressé conformément à l'article R.6352-6 du Code du travail.\n\n" +
      "Titre V — Représentation des stagiaires\n\n" +
      "Article 11 — Élection des délégués (actions de plus de 500 heures). Dans les actions de formation d'une durée supérieure à cinq cents heures, il est procédé, dans les deux premiers mois, à l'élection d'un délégué titulaire et d'un délégué suppléant, conformément aux articles R.6352-9 à R.6352-12 du Code du travail. Le scrutin, à deux tours, est organisé par {{organization.name}}. Si le nombre de candidats est insuffisant pour pourvoir les postes, un procès-verbal de carence est établi. Les délégués font connaître à {{organization.name}} toute suggestion ou réclamation relative au déroulement de la formation.\n\n" +
      "Titre VI — Accessibilité et dispositions finales\n\n" +
      "Article 12 — Accessibilité et situation de handicap. Le stagiaire en situation de handicap est invité à se manifester auprès du référent handicap, {{organization.referentHandicapName}}, joignable à {{organization.publicContactEmail}}, afin qu'un aménagement de la formation soit étudié.\n\n" +
      "Article 13 — Publicité et entrée en vigueur. Le présent règlement est remis à chaque stagiaire préalablement à son inscription définitive et, lorsque la formation a lieu en présentiel, affiché dans les locaux de formation. Toute modification est portée à la connaissance des stagiaires déjà inscrits avant son entrée en application à leur égard, et ne s'applique de plein droit qu'aux stagiaires inscrits à une action postérieure à cette modification.",
  },
  {
    category: "contrat_formation",
    title: "Contrat de formation professionnelle (particulier) — paragraphes conditionnels",
    bodyText: "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
    blocks: [
      {
        bodyText:
          "CONTRAT DE FORMATION PROFESSIONNELLE\n\nConclu en application des articles L.6353-3 à L.6353-9 du Code du travail\n\nENTRE LES SOUSSIGNÉS :\n\n{{contact.firstName}} {{contact.lastName}}, né(e) le {{contact.birthDate}}, demeurant {{contact.address}}, joignable à {{contact.email}} et au {{contact.phone}},\n\nCi-après dénommé(e) « le Bénéficiaire »,\n\nD'une part,\n\nET :\n\n{{organization.name}}, {{organization.legalForm}} au capital social de {{organization.shareCapital}}, dont le siège social est sis {{organization.legalAddress}}, immatriculée au Registre du Commerce et des Sociétés de {{organization.rcsCity}} sous le numéro {{organization.rcsNumber}}, identifiée sous le numéro SIRET {{organization.siret}}, représentée aux fins des présentes par {{organization.legalRepresentativeName}}, dûment habilité(e) à l'effet des présentes,\n\nDéclarée en qualité d'organisme de formation sous le numéro d'enregistrement {{organization.activityDeclarationNumber}} auprès du préfet de la région {{organization.regionPrefecture}}. Conformément à l'article L.6352-12 du Code du travail, cet enregistrement ne vaut pas agrément de l'État.\n\nCi-après dénommée « l'Organisme de formation »,\n\nD'autre part,\n\nCi-après dénommées ensemble « les Parties » et individuellement « la Partie ».",
        conditions: null,
      },
      {
        bodyText:
          "IL A PRÉALABLEMENT ÉTÉ EXPOSÉ CE QUI SUIT :\n\n(A) L'Organisme de formation exerce une activité de formation professionnelle continue au sens des articles L.6311-1 et suivants du Code du travail.\n\n(B) Le Bénéficiaire, personne physique agissant à titre individuel et à ses frais, souhaite suivre l'action de formation décrite à l'article 4 des présentes, en vue des objectifs professionnels qu'il s'est fixés.\n\n(C) Préalablement à la signature des présentes, l'Organisme de formation a remis au Bénéficiaire, qui le reconnaît : le programme détaillé de la formation, les objectifs poursuivis et les prérequis exigés, les modalités et délais d'accès, les méthodes mobilisées et les modalités d'évaluation, le prix et les modalités de règlement, les conditions d'annulation et leurs conséquences financières, ainsi que le règlement intérieur applicable. Le Bénéficiaire déclare avoir disposé d'un délai de réflexion suffisant et avoir obtenu réponse à l'ensemble de ses questions.\n\n(D) Les Parties reconnaissent que la phase précontractuelle s'est déroulée de bonne foi et qu'elles se sont mutuellement communiqué toute information dont l'importance est déterminante du consentement de l'autre, au sens de l'article 1112-1 du Code civil.\n\n(E) Le Bénéficiaire a été informé que la formation ne constitue ni un conseil personnalisé, ni une garantie de résultat professionnel ou commercial, l'Organisme de formation n'étant tenu qu'à une obligation de moyens.\n\nCECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :",
        conditions: null,
      },
      {
        bodyText:
          "Article 1 — Définitions\n\nLes termes ci-après, employés avec une majuscule, ont la signification suivante : « Annexes » désigne les documents annexés aux présentes ; « Formation » désigne l'action de formation décrite à l'article 4 ; « Jour ouvré » désigne tout jour autre que le samedi, le dimanche et les jours fériés légaux en France métropolitaine ; « Plateforme » désigne l'espace numérique de formation mis à disposition du Bénéficiaire par l'Organisme de formation ; « Supports » désigne l'ensemble des contenus pédagogiques, sous quelque forme et sur quelque support que ce soit, mis à disposition du Bénéficiaire au titre de la Formation.\n\nArticle 2 — Objet du contrat\n\nLe présent contrat a pour objet de définir les conditions dans lesquelles l'Organisme de formation dispense la Formation au Bénéficiaire, ainsi que les droits et obligations réciproques des Parties. Il est conclu en application de l'article L.6353-3 du Code du travail, aux termes duquel les formations entreprises par une personne physique à titre individuel et à ses frais donnent lieu à la conclusion d'un contrat entre cette personne et l'organisme de formation.\n\nArticle 3 — Documents contractuels et hiérarchie\n\nLe contrat est formé des présentes et de ses annexes : Annexe 1, programme détaillé de la Formation ; Annexe 2, règlement intérieur applicable aux stagiaires ; le cas échéant, formulaire de rétractation, demande d'exécution anticipée et autorisation d'utilisation de l'image, dont l'applicabilité et le contenu sont précisés aux articles correspondants du présent contrat.\n\nEn cas de contradiction entre les stipulations du corps du contrat et celles d'une annexe, les stipulations du corps du contrat prévalent, sauf lorsque l'annexe est plus favorable au Bénéficiaire.\n\nAucun autre document, notamment aucun document commercial ou publicitaire, n'a valeur contractuelle.",
        conditions: null,
      },
      {
        bodyText:
          "Article 4 — Nature et objet de la Formation\n\n4.1 Intitulé. La Formation s'intitule : « {{course.title}} ».\n\n4.2 Nature. La Formation constitue une action de formation au sens de l'article L.6313-1, 1° du Code du travail. Elle entre dans le champ de la formation professionnelle continue et vise à permettre au Bénéficiaire d'acquérir les compétences décrites à l'article 5.\n\n4.3 Objet. {{course.description}}\n\n4.4 Effectifs. La Formation est dispensée dans la limite de {{course.maxLearners}} participants par session.\n\nArticle 5 — Objectifs, compétences et prérequis\n\n5.1 Objectifs pédagogiques. À l'issue de la Formation, le Bénéficiaire sera en mesure de : {{course.objectives}}\n\n5.2 Compétences visées. Le détail des compétences travaillées et des critères d'évaluation figure en Annexe 1.\n\n5.3 Niveau de connaissances préalables. {{course.prerequisites}} Le Bénéficiaire déclare disposer de ce niveau et reconnaît avoir été informé que son absence est susceptible de compromettre l'atteinte des objectifs.\n\n5.4 Positionnement à l'entrée. L'Organisme de formation procède, avant l'entrée en formation, à un positionnement destiné à vérifier l'adéquation entre la situation du Bénéficiaire et les objectifs poursuivis, et à adapter le cas échéant le déroulement de l'action.\n\nArticle 6 — Durée et dates\n\n6.1 Durée pédagogique. La durée totale de la Formation est de {{course.duration}}.\n\n6.2 Dates. Date d'entrée en formation : {{session.startsAt}}. Date de sortie de formation : {{session.endsAt}}.\n\n6.3 Assiduité. Ces durées s'entendent de temps de formation effectifs. Le Bénéficiaire s'engage à y consacrer le temps nécessaire et à respecter le calendrier communiqué.",
        conditions: null,
      },
      {
        bodyText:
          "Article 6 bis — Certification préparée\n\n6 bis.1 La Formation prépare à la certification « {{course.certificationName}} », enregistrée sous le numéro {{course.certificationCode}} au {{course.certificationRegistry}}, sous l'autorité de {{course.certifierName}}.\n\n6 bis.2 Modalités d'évaluation certifiante. Les épreuves, leurs conditions de passage et les critères de réussite figurent en Annexe 1.\n\n6 bis.3 Portée de l'engagement. L'Organisme de formation s'engage à préparer le Bénéficiaire aux épreuves et à l'y présenter. L'obtention de la certification demeure subordonnée à la réussite des épreuves ; le suivi intégral de la Formation ne la garantit pas.\n\n6 bis.4 Représentation. En cas d'échec, les conditions de représentation sont les suivantes : {{course.retakeConditions}}.\n\n6 bis.5 Équivalences et suites de parcours. Les passerelles, équivalences et suites de parcours associées à la certification sont accessibles sur la fiche publique du répertoire concerné.",
        conditions: [{ questionKey: "certificationVisee", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 7 — Déroulement en présentiel\n\n7.1 Lieu. Les séances en présentiel se déroulent à l'adresse suivante : {{session.location}}.\n\n7.2 Horaires. Les horaires sont communiqués au Bénéficiaire par la convocation adressée avant l'entrée en formation. L'Organisme de formation se réserve la faculté de les aménager pour des raisons d'organisation, sous réserve d'en informer le Bénéficiaire dans un délai raisonnable et sans réduction de la durée pédagogique.\n\n7.3 Émargement. La présence est attestée par la signature, par le Bénéficiaire, d'une feuille d'émargement par demi-journée.\n\n7.4 Règlement intérieur. Le Bénéficiaire se conforme au règlement intérieur figurant en Annexe 2, établi en application des articles L.6352-3 et R.6352-1 du Code du travail, dont il reconnaît avoir pris connaissance.",
        conditions: [{ questionKey: "modalite", in: ["IN_PERSON", "HYBRID"] }],
      },
      {
        bodyText:
          "Article 7 bis — Déroulement à distance\n\n7 bis.1 Modalités. Tout ou partie de la Formation est dispensée à distance, par classes virtuelles synchrones accessibles via {{session.meetingLink}} et par mise à disposition de Supports sur la Plateforme.\n\n7 bis.2 Mentions obligatoires. Conformément à l'article D.6313-3-1 du Code du travail, l'action à distance comprend : une assistance technique et pédagogique appropriée pour accompagner le Bénéficiaire dans le déroulement de son parcours, joignable à {{organization.publicContactEmail}} et au {{organization.publicContactPhone}}, aux jours et heures ouvrés, avec un délai de réponse maximal de deux jours ouvrés ; l'information du Bénéficiaire sur les activités pédagogiques à effectuer à distance et sur leur durée moyenne estimée, détaillées en Annexe 1 ; des évaluations jalonnant ou concluant l'action, décrites à l'article 9.\n\n7 bis.3 Prérequis techniques. Le suivi à distance suppose que le Bénéficiaire dispose d'une connexion internet, d'un équipement compatible, d'un micro et d'une webcam. Ces éléments demeurent à sa charge exclusive et leur défaut ne saurait engager la responsabilité de l'Organisme de formation.\n\n7 bis.4 Preuve d'assiduité. La preuve de la réalisation à distance résulte des relevés de connexion à la Plateforme, des états de présence aux classes virtuelles et de l'émargement électronique.\n\n7 bis.5 Accès à la Plateforme. Les accès sont strictement personnels, nominatifs et incessibles. Le Bénéficiaire répond de leur confidentialité et de tout usage effectué au moyen de ses identifiants. Ils sont ouverts pendant {{course.accessDelay}} et selon les modalités suivantes : {{course.accessModalities}}.\n\n7 bis.6 Disponibilité. L'Organisme de formation met en œuvre les moyens raisonnables pour assurer la disponibilité de la Plateforme, sans garantie de fonctionnement ininterrompu. Il informe le Bénéficiaire des interruptions programmées et rétablit l'accès dans les meilleurs délais.",
        conditions: [{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }],
      },
      {
        bodyText:
          "Article 8 — Moyens pédagogiques et techniques\n\nLes méthodes mobilisées sont les suivantes : {{course.teachingMethods}}\n\nL'Organisme de formation met à disposition du Bénéficiaire les Supports nécessaires à l'atteinte des objectifs, dans les conditions de l'article 21.\n\nLe Bénéficiaire est informé que la Formation peut faire référence à des outils, logiciels ou services édités par des tiers. L'Organisme de formation n'est tenu d'aucune obligation de mise à disposition de tels outils dans leurs versions payantes ; leur souscription relève du choix et de la charge du Bénéficiaire.\n\nArticle 9 — Contrôle des connaissances et sanction\n\n9.1 Modalités d'évaluation. {{course.evaluationModalities}}\n\n9.2 Sanction de la formation. À l'issue de l'action, l'Organisme de formation remet au Bénéficiaire une attestation de fin de formation mentionnant, conformément à l'article L.6353-1 du Code du travail, les objectifs, la nature et la durée de l'action ainsi que les résultats de l'évaluation des acquis.\n\n9.3 Certificat de réalisation. Un certificat de réalisation est délivré au Bénéficiaire et, le cas échéant, au financeur.\n\nArticle 10 — Intervenants\n\nLa Formation est dispensée par des formateurs justifiant des compétences, titres ou expériences professionnelles requis au regard de son objet. Les références de l'intervenant désigné pour la session sont portées à la connaissance du Bénéficiaire dans le programme figurant en Annexe 1 et, sur simple demande, transmises par l'Organisme de formation. L'Organisme de formation se réserve la faculté de substituer un intervenant de qualification équivalente, sans que cette substitution constitue une modification du contrat.\n\nArticle 11 — Accessibilité et situation de handicap\n\nL'Organisme de formation s'attache à rendre la Formation accessible aux personnes en situation de handicap. Le Bénéficiaire concerné est invité à se manifester avant l'entrée en formation auprès du référent handicap, {{organization.referentHandicapName}}, joignable à {{organization.publicContactEmail}}, afin qu'un aménagement de la Formation, de ses modalités ou de ses évaluations soit étudié. Lorsque l'aménagement excède les moyens de l'Organisme de formation, celui-ci oriente le Bénéficiaire vers les acteurs compétents et, à défaut de solution, l'annulation intervient sans frais.",
        conditions: null,
      },
      {
        bodyText:
          "Article 12 — Obligations de l'Organisme de formation\n\nL'Organisme de formation s'engage à : dispenser la Formation conformément au programme figurant en Annexe 1 et aux objectifs de l'article 5 ; mettre en œuvre les moyens humains, pédagogiques et techniques nécessaires ; assurer le suivi de l'exécution de l'action et la traçabilité de l'assiduité ; remettre les documents prévus à l'article 9 ; fournir, sur demande, les pièces justifiant la réalité et le bien-fondé des dépenses de formation engagées.\n\nL'Organisme de formation est tenu d'une obligation de moyens. Il ne garantit ni l'obtention d'un résultat professionnel, commercial ou financier, ni, lorsque la Formation y prépare, la réussite aux épreuves de certification.\n\nArticle 13 — Obligations du Bénéficiaire\n\nLe Bénéficiaire s'engage à : suivre la Formation avec assiduité et accomplir les travaux demandés ; satisfaire aux formalités d'émargement et de traçabilité ; respecter le règlement intérieur figurant en Annexe 2 ; adopter, envers l'Organisme de formation, les intervenants et les autres participants, un comportement respectueux, et s'abstenir de tout propos ou comportement discriminatoire, injurieux ou contraire à l'ordre public ; régler le prix selon les modalités de l'article 15 ; informer sans délai l'Organisme de formation de tout événement de nature à affecter le déroulement de la Formation.\n\nLe manquement grave ou réitéré aux obligations de comportement et de respect du règlement intérieur peut donner lieu aux sanctions prévues par le règlement intérieur, dans le respect de la procédure disciplinaire des articles R.6352-4 et suivants du Code du travail.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 — Prix\n\n14.1 Montant. Le prix de la Formation s'élève à {{course.price}}, exonéré de TVA en application de l'article 261-4-4° a du Code général des impôts.\n\n14.2 Contenu du prix. Ce prix couvre l'intégralité des prestations décrites aux présentes : conception et animation, mise à disposition des Supports et de la Plateforme, assistance, évaluation et délivrance des documents de fin de formation.\n\n14.3 Exclusions. Demeurent à la charge exclusive du Bénéficiaire : les frais de déplacement, d'hébergement et de restauration ; l'équipement informatique et la connexion ; les licences de logiciels tiers ; le cas échéant, les frais d'inscription aux épreuves de certification lorsqu'ils sont perçus par un organisme tiers.\n\n14.4 Fermeté. Le prix est ferme et définitif pour la durée de la Formation.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 bis — Prise en charge par un tiers financeur\n\n14 bis.1 Subrogation. Tout ou partie du prix est réglé directement à l'Organisme de formation par {{funder.name}}, dans le cadre d'une subrogation de paiement, sur présentation des justificatifs de réalisation de l'action.\n\n14 bis.2 Diligences du Bénéficiaire. Le Bénéficiaire fait son affaire de la constitution de son dossier de prise en charge et transmet à l'Organisme de formation, en temps utile, les pièces requises. L'assistance éventuellement apportée par l'Organisme de formation présente un caractère accessoire et n'emporte aucun engagement quant à l'issue de la demande.\n\n14 bis.3 Refus ou retrait de la prise en charge. En cas de refus, de retrait, de réduction de la prise en charge ou de défaut de paiement du financeur, les sommes correspondantes redeviennent exigibles auprès du Bénéficiaire, selon l'échéancier de l'article 15 et dans le respect des limites de l'article 15.1, après information écrite préalable de l'Organisme de formation.",
        conditions: [{ questionKey: "subrogation", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 14 ter — Montant restant à la charge du Bénéficiaire\n\nAprès imputation de la prise en charge, le montant restant dû par le Bénéficiaire s'élève à {{funding.remainder}}, réglé selon les modalités de l'article 15.",
        conditions: [{ questionKey: "resteACharge", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 15 — Modalités de règlement\n\n15.1 Règles impératives. Conformément à l'article L.6353-6 du Code du travail : aucune somme ne peut être exigée du Bénéficiaire avant l'expiration du délai de rétractation de dix jours prévu à l'article 16 ; à l'expiration de ce délai, il ne peut être versé une somme supérieure à trente pour cent (30 %) du prix convenu ; le solde donne lieu à un échelonnement des paiements au fur et à mesure du déroulement de l'action de formation. Toute stipulation contraire aux dispositions du présent article est réputée non écrite.\n\n15.2 Moyens de paiement. Le règlement s'effectue par virement bancaire ou par carte bancaire, au moyen d'un prestataire de services de paiement agréé.\n\n15.3 Données de paiement. L'Organisme de formation ne collecte, ne conserve et ne demande en aucun cas le cryptogramme visuel (CVC/CVV) de la carte bancaire du Bénéficiaire. Les données de paiement sont traitées exclusivement par le prestataire de paiement.\n\n15.4 Retard de paiement. Toute somme non réglée à l'échéance porte intérêt, de plein droit et après mise en demeure demeurée infructueuse pendant quinze jours, au taux d'intérêt légal en vigueur, sans préjudice du droit pour l'Organisme de formation de suspendre l'accès à la Plateforme après un nouveau préavis de huit jours.",
        conditions: null,
      },
      {
        bodyText:
          "15.5 Échéancier. Le prix est réglé en une échéance unique, exigible à l'expiration du délai de rétractation, dans la limite de trente pour cent (30 %) du prix convenu, le solde étant appelé au fur et à mesure du déroulement de l'action conformément à l'article 15.1.",
        conditions: [{ questionKey: "paiement", in: ["comptant"] }],
      },
      {
        bodyText:
          "15.5 Échéancier. Le prix est réglé selon l'échéancier annexé aux présentes, établi en considération du déroulement de l'action : un premier versement, exigible à l'expiration du délai de rétractation, dans la limite de trente pour cent (30 %) du prix convenu, puis le solde réparti en échéances complémentaires appelées au fur et à mesure du déroulement de l'action, conformément à l'article 15.1.\n\nLe Bénéficiaire informe l'Organisme de formation de tout changement affectant son moyen de paiement, sans jamais communiquer son cryptogramme visuel, la mise à jour s'effectuant directement auprès du prestataire de paiement.",
        conditions: [{ questionKey: "paiement", in: ["echelonne"] }],
      },
      {
        bodyText:
          "Article 16 — Droit de rétractation\n\n16.1 Délai légal de dix jours. Conformément à l'article L.6353-5 du Code du travail, le Bénéficiaire dispose d'un délai de dix jours à compter de la signature du présent contrat pour se rétracter.\n\n16.2 Modalités d'exercice. La rétractation est exercée par lettre recommandée avec avis de réception adressée à {{organization.name}}, {{organization.legalAddress}}. Le cachet de la poste fait foi de la date d'envoi.\n\n16.3 Effets. L'exercice de ce droit n'a à être ni motivé ni justifié. Il n'entraîne aucune pénalité ni aucun frais. Les sommes éventuellement versées sont intégralement restituées au Bénéficiaire dans un délai maximal de trente jours à compter de la réception de la rétractation.\n\n16.4 Caractère d'ordre public. Ce droit est d'ordre public. Il ne peut faire l'objet d'aucune renonciation, ni être écarté par l'exécution anticipée du contrat, et s'applique quelles que soient les modalités de conclusion de celui-ci.",
        conditions: null,
      },
      {
        bodyText:
          "Article 16 bis — Droit de rétractation du contrat conclu à distance\n\n16 bis.1 Fondement. Le présent contrat étant conclu à distance ou hors établissement, le Bénéficiaire bénéficie en outre du délai de quatorze jours prévu à l'article L.221-18 du Code de la consommation, courant à compter du jour de la conclusion du contrat.\n\n16 bis.2 Articulation des deux délais. Les deux droits de rétractation se cumulent. Le Bénéficiaire bénéficie en toute hypothèse du délai le plus long, soit quatorze jours, et du régime le plus favorable pour chacun de leurs effets.\n\n16 bis.3 Modalités d'exercice. Le Bénéficiaire exerce ce droit au moyen du formulaire type figurant en Annexe 3, ou par toute déclaration dénuée d'ambiguïté adressée à {{organization.publicContactEmail}}.\n\n16 bis.4 Remboursement. L'Organisme de formation rembourse le Bénéficiaire de la totalité des sommes versées, au plus tard quatorze jours à compter de la réception de la rétractation, en utilisant le même moyen de paiement que celui employé lors de la transaction initiale, sauf accord exprès contraire et sans frais pour le Bénéficiaire.",
        conditions: null,
      },
      {
        bodyText:
          "Article 16 ter — Demande d'exécution anticipée\n\n16 ter.1 Demande expresse. Le Bénéficiaire qui souhaite accéder aux Supports et à la Plateforme avant l'expiration du délai de quatorze jours en formule la demande expresse au moyen du formulaire figurant en Annexe 4.\n\n16 ter.2 Portée. Les Supports constituant un contenu numérique fourni sur un support immatériel, le Bénéficiaire reconnaît, conformément à l'article L.221-28, 13° du Code de la consommation, perdre son droit de rétractation au titre du Code de la consommation dès le commencement de l'exécution, après avoir recueilli son consentement préalable exprès et son renoncement exprès audit droit.\n\n16 ter.3 Réserve impérative. Cette renonciation demeure sans effet sur le délai de dix jours prévu à l'article 16, lequel est d'ordre public et continue de courir. Le Bénéficiaire qui exerce ce droit dans le délai de dix jours obtient la restitution intégrale des sommes versées, nonobstant l'accès déjà ouvert.",
        conditions: [{ questionKey: "accesImmediat", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 17 — Annulation avant le début de la Formation\n\n17.1 Par le Bénéficiaire. Après expiration des délais de rétractation, le Bénéficiaire peut annuler son inscription : plus de sept jours ouvrés avant la date d'entrée en formation, sans frais, les sommes versées étant intégralement restituées ; sept jours ouvrés ou moins avant cette date, une indemnité forfaitaire de {{contract.cancellationFeePercent}} du prix convenu (soit {{contract.cancellationFeeAmount}}) demeure acquise à l'Organisme de formation au titre des frais d'organisation déjà exposés, le surplus étant restitué. Cette indemnité n'est pas due lorsque l'annulation résulte d'un cas de force majeure au sens de l'article 19, ni lorsqu'elle procède d'un défaut d'aménagement au sens de l'article 11.\n\n17.2 Par l'Organisme de formation. L'annulation par l'Organisme de formation, pour quelque cause que ce soit, n'ouvre droit à aucune somme à son profit. Les sommes versées sont intégralement restituées dans un délai de trente jours. L'Organisme de formation propose, lorsque cela est possible, le report sur une session ultérieure.\n\n17.3 Réciprocité. L'annulation par l'Organisme de formation moins de sept jours ouvrés avant l'entrée en formation, hors force majeure, ouvre droit au profit du Bénéficiaire à une indemnité d'un montant égal à celle prévue au 17.1.",
        conditions: [{ questionKey: "indemniteAnnulation", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 17 — Annulation avant le début de la Formation\n\n17.1 Par le Bénéficiaire. Après expiration des délais de rétractation, le Bénéficiaire peut annuler son inscription à tout moment avant la date d'entrée en formation, sans frais ni pénalité. Les sommes versées sont intégralement restituées.\n\n17.2 Par l'Organisme de formation. L'annulation par l'Organisme de formation, pour quelque cause que ce soit, n'ouvre droit à aucune somme à son profit. Les sommes versées sont intégralement restituées dans un délai de trente jours. L'Organisme de formation propose, lorsque cela est possible, le report sur une session ultérieure.",
        conditions: [{ questionKey: "indemniteAnnulation", in: ["non"] }],
      },
      {
        bodyText:
          "Article 18 — Interruption et abandon en cours de Formation\n\n18.1 Principe légal. Conformément à l'article L.6354-1 du Code du travail, en cas d'inexécution totale ou partielle de la prestation de formation, l'Organisme de formation rembourse au Bénéficiaire les sommes indûment perçues.\n\n18.2 Abandon du Bénéficiaire. En cas d'abandon en cours de formation, seules les prestations effectivement réalisées à la date de l'abandon sont dues, calculées au prorata de la durée pédagogique accomplie.\n\n18.3 Force majeure. Lorsque l'abandon procède d'un cas de force majeure dûment justifié, le contrat est résilié de plein droit et, conformément à l'article L.6353-7 du Code du travail, seules les prestations effectivement dispensées sont dues, à due proportion de leur valeur prévue au contrat, à l'exclusion de toute indemnité.\n\n18.4 Interruption du fait de l'Organisme de formation. En cas d'interruption imputable à l'Organisme de formation, celui-ci propose une session de rattrapage. À défaut, le contrat est résilié et les sommes correspondant aux prestations non réalisées sont restituées.",
        conditions: null,
      },
      {
        bodyText:
          "Article 19 — Force majeure\n\n19.1 Définition. Constitue un cas de force majeure tout événement répondant aux conditions de l'article 1218 du Code civil.\n\n19.2 Illustrations. Sont notamment assimilés à des cas de force majeure, lorsqu'ils réunissent ces conditions et paralysent l'exécution : épidémie ou pandémie et les mesures administratives qui en découlent ; grève, conflit du travail interne ou externe, lock-out ; pénurie affectant les moyens nécessaires à l'exécution ; insurrection, attentat, acte de terrorisme, guerre ; incendie, inondation, tempête, séisme et autres catastrophes naturelles ; cyberattaque, intrusion, rançongiciel ou virus informatique ; coupure prolongée d'électricité ou de télécommunications, indisponibilité générale des réseaux ; décision d'une autorité publique faisant obstacle à l'exécution. Cette énumération n'est pas limitative.\n\n19.3 Effets. L'exécution des obligations affectées est suspendue pour la durée de l'empêchement, sans indemnité de part ni d'autre. La Partie empêchée en informe l'autre sans délai et met en œuvre les moyens raisonnables pour en limiter les effets. Lorsque l'empêchement se prolonge au-delà de soixante jours, chaque Partie peut résilier le contrat par lettre recommandée avec avis de réception, le règlement s'opérant alors conformément à l'article 18.3.\n\n19.4 Substitution de modalité. Lorsqu'un événement de force majeure affecte une séance prévue en présentiel, l'Organisme de formation peut la reporter ou la dispenser à distance, après information du Bénéficiaire, sans que cette adaptation constitue une inexécution.\n\nArticle 20 — Résiliation pour manquement\n\n20.1 Manquement. En cas de manquement par une Partie à l'une de ses obligations essentielles, l'autre Partie peut résilier le contrat quinze jours après une mise en demeure demeurée infructueuse, adressée par lettre recommandée avec avis de réception et énonçant précisément le manquement reproché.\n\n20.2 Manquement grave. En cas de manquement d'une gravité telle qu'il rend impossible la poursuite du contrat, la résiliation peut intervenir sans préavis, par lettre recommandée avec avis de réception motivée.\n\n20.3 Conséquences financières. La résiliation produit les effets de l'article 18.2, sans préjudice des dommages et intérêts que la Partie lésée serait fondée à réclamer.",
        conditions: null,
      },
      {
        bodyText:
          "Article 21 — Propriété intellectuelle\n\n21.1 Titularité. L'Organisme de formation demeure titulaire exclusif de l'ensemble des droits de propriété intellectuelle attachés aux Supports, à la Plateforme et à toute méthode ou contenu communiqué au Bénéficiaire. Le présent contrat n'emporte aucune cession de ces droits.\n\n21.2 Droit d'usage. Le Bénéficiaire bénéficie d'un droit d'usage personnel, non exclusif, non cessible et non transférable, limité à ses seuls besoins de formation et à la durée de son accès.\n\n21.3 Interdictions. Le Bénéficiaire s'interdit, sauf autorisation écrite préalable : de reproduire, représenter, adapter, traduire ou diffuser tout ou partie des Supports ; de les communiquer à un tiers, à titre gratuit ou onéreux ; de procéder à tout enregistrement, capture d'écran ou captation des séances ; de les exploiter à des fins de formation, de conseil ou à toute fin commerciale.\n\n21.4 Sanction. Tout manquement au présent article peut entraîner la suspension immédiate de l'accès, sans préjudice des poursuites au titre de la contrefaçon.\n\nArticle 22 — Confidentialité\n\nChaque Partie s'oblige à tenir confidentielle toute information non publique portée à sa connaissance à l'occasion de l'exécution du contrat, à ne pas la divulguer et à ne l'utiliser que pour les besoins des présentes. Cet engagement demeure en vigueur pendant trois ans à compter du terme du contrat. Il ne s'applique pas aux informations publiques, déjà connues, ou dont la divulgation est légalement requise.",
        conditions: null,
      },
      {
        bodyText:
          "Article 23 — Protection des données à caractère personnel\n\n23.1 Responsable de traitement. L'Organisme de formation traite les données du Bénéficiaire en qualité de responsable de traitement, au sens du Règlement (UE) 2016/679 et de la loi n° 78-17 du 6 janvier 1978 modifiée.\n\n23.2 Finalités et bases légales. Les données du Bénéficiaire sont traitées pour les finalités suivantes, chacune sur la base légale indiquée : la gestion de l'inscription et l'exécution du contrat, sur le fondement de l'exécution du contrat (article 6.1.b du RGPD) ; le suivi de l'assiduité, l'évaluation et la délivrance des attestations, sur le fondement de l'exécution du contrat et d'une obligation légale (article 6.1.b et c) ; la justification auprès des financeurs et des autorités de contrôle, sur le fondement d'une obligation légale (article 6.1.c) ; la facturation et la comptabilité, sur le fondement d'une obligation légale (article 6.1.c) ; les enquêtes de satisfaction et l'amélioration continue, sur le fondement de l'intérêt légitime (article 6.1.f) ; la prospection portant sur des formations analogues, sur le fondement de l'intérêt légitime, assortie d'un droit d'opposition (article 6.1.f).\n\n23.3 Destinataires. Les données sont destinées aux services habilités de l'Organisme de formation, à ses sous-traitants agissant sur instruction documentée, aux financeurs concernés et, le cas échéant, aux organismes certificateurs et autorités de contrôle.\n\n23.4 Durées de conservation. Les données relatives à l'exécution de la formation sont conservées pendant la durée de la relation, puis archivées pendant la durée des prescriptions applicables ; les pièces justificatives requises par la réglementation de la formation professionnelle sont conservées conformément aux durées légales ; les données de prospection sont conservées trois ans à compter du dernier contact.\n\n23.5 Droits. Le Bénéficiaire dispose des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité, ainsi que du droit de définir des directives relatives au sort de ses données après son décès. Il les exerce auprès de {{organization.publicContactEmail}}. Il peut introduire une réclamation auprès de la CNIL.\n\n23.6 Transferts. Aucun transfert hors Union européenne n'est réalisé sans garanties appropriées au sens du chapitre V du RGPD.",
        conditions: null,
      },
      {
        bodyText:
          "Annexe 5 — Autorisation d'utilisation de l'image et de la voix\n\nCette autorisation est facultative et distincte du contrat. Le refus du Bénéficiaire est sans incidence sur son inscription, sur le déroulement de la Formation et sur son prix.\n\nJe soussigné(e) {{contact.firstName}} {{contact.lastName}} autorise {{organization.name}} à capter, enregistrer, reproduire et diffuser mon image et ma voix, ainsi que mes nom et prénom, dans les conditions suivantes : ☐ J'accepte ☐ Je refuse\n\n1. Objet. L'autorisation porte sur les captations réalisées à l'occasion de mon témoignage, de ma participation à une séance diffusée ou rediffusée, ou de tout autre événement organisé par l'Organisme de formation et expressément porté à ma connaissance.\n\n2. Supports et étendue. L'exploitation peut intervenir sur les sites internet et espaces de l'Organisme de formation ainsi que sur ses comptes de réseaux sociaux, à des fins de présentation de ses activités et de communication, y compris promotionnelle.\n\n3. Exclusions. L'autorisation n'emporte pas le droit de céder ou sous-licencier ces droits à des tiers autres que les prestataires techniques agissant pour le compte de l'Organisme de formation, ni de les associer à un contenu publicitaire de marque tierce, ni d'en faire un usage portant atteinte à ma réputation, à ma dignité ou à ma vie privée.\n\n4. Durée et territoire. L'autorisation est consentie pour une durée de trois ans à compter de sa signature, pour le monde entier compte tenu du caractère mondial des réseaux de communication.\n\n5. Retrait. Je peux retirer mon consentement à tout moment, sans motif, par simple demande adressée à {{organization.publicContactEmail}}. L'Organisme de formation cesse alors toute nouvelle diffusion et procède au retrait des contenus concernés des supports qu'il maîtrise, dans un délai de trente jours. Le retrait ne remet pas en cause la licéité des diffusions antérieures.\n\n6. Absence de rémunération. La présente autorisation est consentie à titre gratuit.\n\nFait à ………………, le ………………  Signature :",
        conditions: [{ questionKey: "droitImage", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 24 — Réclamations et médiation\n\n24.1 Réclamation interne. Toute réclamation est adressée à {{organization.publicContactEmail}}. L'Organisme de formation en accuse réception sous cinq jours ouvrés et y répond dans un délai de trente jours.\n\n24.2 Médiation de la consommation. Conformément aux articles L.612-1 et R.612-1 du Code de la consommation, le Bénéficiaire consommateur peut, après réclamation écrite demeurée infructueuse et dans un délai d'un an à compter de celle-ci, recourir gratuitement au médiateur de la consommation dont relève l'Organisme de formation : {{organization.mediatorName}} — {{organization.mediatorContact}}.\n\n24.3 Plateforme européenne. Le Bénéficiaire peut également recourir à la plateforme de règlement en ligne des litiges de la Commission européenne.\n\nArticle 25 — Dispositions générales\n\n25.1 Intégralité. Le contrat et ses Annexes expriment l'intégralité de l'accord des Parties et annulent tout engagement antérieur de même objet.\n\n25.2 Modification. Toute modification fait l'objet d'un avenant écrit et signé.\n\n25.3 Nullité partielle. La nullité d'une stipulation n'affecte pas la validité des autres, les Parties s'engageant à lui substituer une stipulation d'effet économique équivalent et licite.\n\n25.4 Non-renonciation. Le fait de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.\n\n25.5 Cession. Le contrat est conclu intuitu personae à l'égard du Bénéficiaire et ne peut être cédé par lui sans accord écrit préalable.\n\n25.6 Notifications. Les notifications sont valablement effectuées aux adresses figurant en tête des présentes, toute modification devant être portée à la connaissance de l'autre Partie.\n\nArticle 26 — Signature électronique\n\nLes Parties conviennent de signer le présent contrat par voie électronique au moyen d'un procédé garantissant l'identification du signataire et l'intégrité de l'acte. Elles lui reconnaissent la valeur probatoire attachée par les articles 1366 et 1367 du Code civil et renoncent à en contester la validité de ce seul chef.\n\nArticle 27 — Droit applicable et juridiction\n\nLe présent contrat est soumis au droit français. Le Bénéficiaire consommateur conserve la faculté de saisir, à son choix, la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou de la survenance du fait dommageable, ou l'une des juridictions territorialement compétentes en application du Code de procédure civile.\n\nFait le {{today}}, en deux exemplaires originaux, dont un remis à chaque Partie, précédé de la mention « Lu et approuvé ».\n\nLe Bénéficiaire : {{contact.firstName}} {{contact.lastName}}\nPour l'Organisme de formation : {{organization.legalRepresentativeName}}",
        conditions: null,
      },
    ],
  },
  {
    category: "convention",
    title: "Convention de formation professionnelle — paragraphes conditionnels",
    bodyText: "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
    blocks: [
      {
        bodyText:
          "CONVENTION DE FORMATION PROFESSIONNELLE\n\nConclue en application des articles L.6353-1 et L.6353-2 du Code du travail\n\nENTRE LES SOUSSIGNÉS :\n\n{{organization.name}}, {{organization.legalForm}} au capital social de {{organization.shareCapital}}, dont le siège social est sis {{organization.legalAddress}}, immatriculée au Registre du Commerce et des Sociétés de {{organization.rcsCity}} sous le numéro {{organization.rcsNumber}}, identifiée sous le numéro SIRET {{organization.siret}}, représentée par {{organization.legalRepresentativeName}}, dûment habilité(e) à l'effet des présentes,\n\nDéclarée en qualité d'organisme de formation sous le numéro d'enregistrement {{organization.activityDeclarationNumber}} auprès du préfet de la région {{organization.regionPrefecture}}. Conformément à l'article L.6352-12 du Code du travail, cet enregistrement ne vaut pas agrément de l'État.\n\nCi-après dénommée « l'Organisme de formation »,\n\nD'une part,\n\nET :\n\n{{company.name}}, dont le siège est sis {{company.address}}, identifiée sous le numéro SIRET {{company.siret}}, représentée par {{company.legalRepresentativeName}}, dûment habilité(e) à l'effet des présentes,\n\nCi-après dénommée « l'Entreprise »,\n\nD'autre part,\n\nCi-après dénommées ensemble « les Parties » et individuellement « la Partie ».\n\nIL EST PRÉCISÉ QUE : l'action de formation objet des présentes bénéficie à {{contact.firstName}} {{contact.lastName}}, salarié(e) de l'Entreprise (ci-après « le Bénéficiaire »), lequel n'est pas partie aux présentes et n'en signe pas les termes, sans préjudice des obligations qui pèsent sur lui à raison de sa participation, rappelées à l'article 13.",
        conditions: null,
      },
      {
        bodyText:
          "IL A PRÉALABLEMENT ÉTÉ EXPOSÉ CE QUI SUIT :\n\n(A) L'Organisme de formation exerce une activité de formation professionnelle continue au sens des articles L.6311-1 et suivants du Code du travail.\n\n(B) L'Entreprise souhaite faire bénéficier le Bénéficiaire de l'action de formation décrite à l'article 4 des présentes, dans le cadre de sa politique de développement des compétences.\n\n(C) Préalablement à la signature des présentes, l'Organisme de formation a remis à l'Entreprise, qui le reconnaît : le programme détaillé de la formation, les objectifs poursuivis et les prérequis exigés, les modalités et délais d'accès, les méthodes mobilisées et les modalités d'évaluation, le prix et les modalités de règlement, ainsi que les conditions d'annulation et leurs conséquences financières.\n\n(D) Les Parties reconnaissent que la phase précontractuelle s'est déroulée de bonne foi et qu'elles se sont mutuellement communiqué toute information dont l'importance est déterminante du consentement de l'autre, au sens de l'article 1112-1 du Code civil.\n\n(E) L'Entreprise, agissant en qualité de professionnel pour les besoins de son activité, déclare avoir la pleine capacité à s'engager et disposer, le cas échéant par l'intermédiaire de ses propres conseils, des moyens d'apprécier la portée de son engagement.\n\n(F) L'Organisme de formation a été informé du fait que la formation ne constitue ni un conseil personnalisé, ni une garantie de résultat professionnel ou commercial, l'Organisme de formation n'étant tenu qu'à une obligation de moyens.\n\nCECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :",
        conditions: null,
      },
      {
        bodyText:
          "Article 1 — Définitions\n\nLes termes ci-après, employés avec une majuscule, ont la signification suivante : « Annexes » désigne les documents annexés aux présentes ; « Formation » désigne l'action de formation décrite à l'article 4 ; « Jour ouvré » désigne tout jour autre que le samedi, le dimanche et les jours fériés légaux en France métropolitaine ; « Plateforme » désigne l'espace numérique de formation mis à disposition du Bénéficiaire par l'Organisme de formation ; « Supports » désigne l'ensemble des contenus pédagogiques mis à disposition au titre de la Formation.\n\nArticle 2 — Objet de la convention\n\nLa présente convention a pour objet de définir les conditions dans lesquelles l'Organisme de formation dispense la Formation au bénéfice du salarié désigné, ainsi que les droits et obligations réciproques des Parties. Elle est conclue en application des articles L.6353-1 et L.6353-2 du Code du travail.\n\nArticle 3 — Documents contractuels et hiérarchie\n\nLa convention est formée des présentes et de ses annexes : Annexe 1, programme détaillé de la Formation ; Annexe 2, règlement intérieur applicable aux stagiaires ; le cas échéant, autorisation d'utilisation de l'image, dont l'applicabilité est précisée à l'article correspondant.\n\nEn cas de contradiction entre le corps de la convention et une annexe, les stipulations du corps de la convention prévalent.\n\nAucun autre document, notamment aucun document commercial ou publicitaire, n'a valeur contractuelle.",
        conditions: null,
      },
      {
        bodyText:
          "Article 4 — Nature et objet de la Formation\n\n4.1 Intitulé. La Formation s'intitule : « {{course.title}} ».\n\n4.2 Nature. La Formation constitue une action de formation au sens de l'article L.6313-1, 1° du Code du travail.\n\n4.3 Objet. {{course.description}}\n\n4.4 Effectifs. La Formation est dispensée dans la limite de {{course.maxLearners}} participants par session.\n\nArticle 5 — Objectifs, compétences et prérequis\n\n5.1 Objectifs pédagogiques. À l'issue de la Formation, le Bénéficiaire sera en mesure de : {{course.objectives}}\n\n5.2 Compétences visées. Le détail des compétences travaillées et des critères d'évaluation figure en Annexe 1.\n\n5.3 Niveau de connaissances préalables. {{course.prerequisites}} L'Entreprise déclare s'être assurée que le Bénéficiaire dispose de ce niveau.\n\n5.4 Positionnement à l'entrée. L'Organisme de formation procède, avant l'entrée en formation, à un positionnement destiné à vérifier l'adéquation entre la situation du Bénéficiaire et les objectifs poursuivis.\n\nArticle 6 — Durée et dates\n\n6.1 Durée pédagogique. La durée totale de la Formation est de {{course.duration}}.\n\n6.2 Dates. Date d'entrée en formation : {{session.startsAt}}. Date de sortie de formation : {{session.endsAt}}.\n\n6.3 Assiduité. L'Entreprise s'assure de la disponibilité du Bénéficiaire pour suivre la Formation selon le calendrier communiqué.",
        conditions: null,
      },
      {
        bodyText:
          "Article 6 bis — Certification préparée\n\n6 bis.1 La Formation prépare à la certification « {{course.certificationName}} », enregistrée sous le numéro {{course.certificationCode}} au {{course.certificationRegistry}}, sous l'autorité de {{course.certifierName}}.\n\n6 bis.2 Modalités d'évaluation certifiante. Les épreuves, leurs conditions de passage et les critères de réussite figurent en Annexe 1.\n\n6 bis.3 Portée de l'engagement. L'Organisme de formation s'engage à préparer le Bénéficiaire aux épreuves et à l'y présenter. L'obtention de la certification demeure subordonnée à la réussite des épreuves ; le suivi intégral de la Formation ne la garantit pas.\n\n6 bis.4 Représentation. En cas d'échec, les conditions de représentation sont les suivantes : {{course.retakeConditions}}.",
        conditions: [{ questionKey: "certificationVisee", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 7 — Déroulement en présentiel\n\n7.1 Lieu. Les séances en présentiel se déroulent à l'adresse suivante : {{session.location}}.\n\n7.2 Horaires. Les horaires sont communiqués par la convocation adressée avant l'entrée en formation.\n\n7.3 Émargement. La présence est attestée par la signature, par le Bénéficiaire, d'une feuille d'émargement par demi-journée, dont copie est tenue à disposition de l'Entreprise sur demande.\n\n7.4 Règlement intérieur. Le Bénéficiaire se conforme au règlement intérieur figurant en Annexe 2, établi en application des articles L.6352-3 et R.6352-1 du Code du travail. L'Entreprise s'assure qu'il en a pris connaissance.",
        conditions: [{ questionKey: "modalite", in: ["IN_PERSON", "HYBRID"] }],
      },
      {
        bodyText:
          "Article 7 bis — Déroulement à distance\n\n7 bis.1 Modalités. Tout ou partie de la Formation est dispensée à distance, par classes virtuelles synchrones accessibles via {{session.meetingLink}} et par mise à disposition de Supports sur la Plateforme.\n\n7 bis.2 Mentions obligatoires. Conformément à l'article D.6313-3-1 du Code du travail, l'action à distance comprend une assistance technique et pédagogique appropriée, joignable à {{organization.publicContactEmail}} et au {{organization.publicContactPhone}}, aux jours et heures ouvrés, avec un délai de réponse maximal de deux jours ouvrés ; l'information du Bénéficiaire sur les activités pédagogiques à effectuer à distance et leur durée moyenne estimée, détaillées en Annexe 1 ; des évaluations jalonnant ou concluant l'action, décrites à l'article 9.\n\n7 bis.3 Prérequis techniques. Le suivi à distance suppose que le Bénéficiaire dispose d'une connexion internet, d'un équipement compatible, d'un micro et d'une webcam. L'Entreprise s'assure que le Bénéficiaire en dispose ; leur défaut ne saurait engager la responsabilité de l'Organisme de formation.\n\n7 bis.4 Preuve d'assiduité. La preuve de la réalisation à distance résulte des relevés de connexion à la Plateforme, des états de présence aux classes virtuelles et de l'émargement électronique.\n\n7 bis.5 Accès à la Plateforme. Les accès sont strictement personnels, nominatifs et incessibles. Ils sont ouverts pendant {{course.accessDelay}} et selon les modalités suivantes : {{course.accessModalities}}.",
        conditions: [{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }],
      },
      {
        bodyText:
          "Article 8 — Moyens pédagogiques et techniques\n\nLes méthodes mobilisées sont les suivantes : {{course.teachingMethods}}\n\nL'Organisme de formation met à disposition les Supports nécessaires à l'atteinte des objectifs, dans les conditions de l'article 20.\n\nArticle 9 — Contrôle des connaissances et sanction\n\n9.1 Modalités d'évaluation. {{course.evaluationModalities}}\n\n9.2 Sanction de la formation. À l'issue de l'action, l'Organisme de formation remet au Bénéficiaire une attestation de fin de formation mentionnant les objectifs, la nature et la durée de l'action ainsi que les résultats de l'évaluation des acquis.\n\n9.3 Certificat de réalisation. Un certificat de réalisation est délivré au Bénéficiaire et à l'Entreprise et, le cas échéant, au financeur — pièce justificative de l'exécution de la présente convention.\n\nArticle 10 — Intervenants\n\nLa Formation est dispensée par des formateurs justifiant des compétences, titres ou expériences professionnelles requis au regard de son objet. Les références de l'intervenant désigné sont portées à la connaissance de l'Entreprise dans le programme figurant en Annexe 1 et, sur demande, transmises par l'Organisme de formation, qui se réserve la faculté de le substituer par un intervenant de qualification équivalente sans que cela constitue une modification de la convention.\n\nArticle 11 — Accessibilité et situation de handicap\n\nL'Organisme de formation s'attache à rendre la Formation accessible aux personnes en situation de handicap. Le Bénéficiaire concerné, ou l'Entreprise en son nom, est invité à se manifester avant l'entrée en formation auprès du référent handicap, {{organization.referentHandicapName}}, joignable à {{organization.publicContactEmail}}, afin qu'un aménagement soit étudié.",
        conditions: null,
      },
      {
        bodyText:
          "Article 12 — Obligations de l'Organisme de formation\n\nL'Organisme de formation s'engage à : dispenser la Formation conformément au programme figurant en Annexe 1 ; mettre en œuvre les moyens humains, pédagogiques et techniques nécessaires ; assurer le suivi de l'exécution de l'action et la traçabilité de l'assiduité ; remettre les documents prévus à l'article 9 ; fournir, sur demande, les pièces justifiant la réalité et le bien-fondé des dépenses de formation engagées, notamment pour les besoins d'un contrôle de l'administration ou d'un financeur.\n\nL'Organisme de formation est tenu d'une obligation de moyens. Il ne garantit ni l'obtention d'un résultat professionnel pour le Bénéficiaire, ni, lorsque la Formation y prépare, la réussite aux épreuves de certification.\n\nArticle 13 — Obligations de l'Entreprise et du Bénéficiaire\n\n13.1 L'Entreprise s'engage à : s'assurer de la disponibilité du Bénéficiaire pour suivre la Formation ; régler le prix selon les modalités de l'article 15 ; informer sans délai l'Organisme de formation de tout événement de nature à affecter le déroulement de la Formation, notamment une modification de la situation du Bénéficiaire.\n\n13.2 Le Bénéficiaire s'engage à : suivre la Formation avec assiduité et accomplir les travaux demandés ; satisfaire aux formalités d'émargement et de traçabilité ; respecter le règlement intérieur figurant en Annexe 2 ; adopter un comportement respectueux et s'abstenir de tout propos ou comportement discriminatoire, injurieux ou contraire à l'ordre public.\n\nLe manquement grave ou réitéré du Bénéficiaire peut donner lieu aux sanctions prévues par le règlement intérieur, dans le respect de la procédure disciplinaire des articles R.6352-4 et suivants du Code du travail, l'Entreprise en étant tenue informée.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 — Prix\n\n14.1 Montant. Le prix de la Formation s'élève à {{course.price}}, exonéré de TVA en application de l'article 261-4-4° a du Code général des impôts.\n\n14.2 Contenu du prix. Ce prix couvre l'intégralité des prestations décrites aux présentes : conception et animation, mise à disposition des Supports et de la Plateforme, assistance, évaluation et délivrance des documents de fin de formation.\n\n14.3 Exclusions. Demeurent à la charge exclusive de l'Entreprise : les frais de déplacement, d'hébergement et de restauration du Bénéficiaire ; l'équipement informatique et la connexion ; les licences de logiciels tiers ; le cas échéant, les frais d'inscription aux épreuves de certification perçus par un organisme tiers.\n\n14.4 Fermeté. Le prix est ferme et définitif pour la durée de la Formation.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 bis — Prise en charge par un tiers financeur\n\n14 bis.1 Subrogation. Tout ou partie du prix est réglé directement à l'Organisme de formation par {{funder.name}}, dans le cadre d'une subrogation de paiement, sur présentation des justificatifs de réalisation de l'action.\n\n14 bis.2 Diligences de l'Entreprise. L'Entreprise fait son affaire de la constitution du dossier de prise en charge et transmet à l'Organisme de formation, en temps utile, les pièces requises.\n\n14 bis.3 Refus ou retrait de la prise en charge. En cas de refus, de retrait, de réduction de la prise en charge ou de défaut de paiement du financeur, les sommes correspondantes redeviennent exigibles auprès de l'Entreprise, selon l'échéancier de l'article 15, après information écrite préalable de l'Organisme de formation.",
        conditions: [{ questionKey: "subrogation", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 14 ter — Montant restant à la charge de l'Entreprise\n\nAprès imputation de la prise en charge, le montant restant dû par l'Entreprise s'élève à {{funding.remainder}}, réglé selon les modalités de l'article 15.",
        conditions: [{ questionKey: "resteACharge", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 15 — Modalités de règlement\n\n15.1 Principe. Sauf disposition contraire de la présente convention, le prix est exigible selon les modalités définies ci-après. Aucun plafond légal ne borne le montant appelable avant l'entrée en formation : l'article L.6353-6 du Code du travail, qui limite à 30 % le premier appel de fonds, ne s'applique qu'au contrat conclu avec une personne physique à titre individuel (article L.6353-3) et non à la présente convention.\n\n15.2 Moyens de paiement. Le règlement s'effectue par virement bancaire, à réception de facture, sauf modalités particulières convenues à l'article 15.5.\n\n15.3 Retard de paiement. Toute somme non réglée à l'échéance porte intérêt, de plein droit et sans mise en demeure préalable, à un taux égal à trois fois le taux d'intérêt légal, conformément à l'article L.441-10 du Code de commerce. Tout retard de paiement donne lieu, de plein droit, au paiement d'une indemnité forfaitaire de recouvrement de 40 €, sans préjudice d'une indemnisation complémentaire sur justification si les frais de recouvrement exposés lui sont supérieurs.\n\n15.4 Suspension. L'Organisme de formation peut suspendre l'accès à la Plateforme après un préavis de huit jours resté sans effet, sans préjudice des dispositions qui précèdent.",
        conditions: null,
      },
      {
        bodyText:
          "15.5 Échéancier. Le prix est réglé en une échéance unique, à réception de facture émise à l'issue de la Formation, sauf accord contraire des Parties.",
        conditions: [{ questionKey: "paiement", in: ["comptant"] }],
      },
      {
        bodyText:
          "15.5 Échéancier. Le prix est réglé selon l'échéancier annexé aux présentes, librement convenu entre les Parties et établi en considération du déroulement de l'action. L'Entreprise informe l'Organisme de formation de toute modification affectant ses coordonnées de facturation.",
        conditions: [{ questionKey: "paiement", in: ["echelonne"] }],
      },
      {
        bodyText:
          "Article 16 — Absence de droit de rétractation\n\n16.1 La présente convention est conclue entre deux professionnels, chacun agissant pour les besoins de son activité. L'Entreprise n'a pas la qualité de consommateur ni, s'agissant d'un achat directement utile à son activité professionnelle, celle de non-professionnel au sens liminaire du Code de la consommation.\n\n16.2 En conséquence, ni le délai de rétractation de dix jours prévu à l'article L.6353-5 du Code du travail (qui ne bénéficie qu'au cocontractant personne physique du contrat de l'article L.6353-3), ni le délai de rétractation de quatorze jours prévu à l'article L.221-18 du Code de la consommation (réservé aux contrats conclus avec un consommateur) ne trouvent à s'appliquer à la présente convention.\n\n16.3 La convention prend effet à sa signature par les deux Parties.",
        conditions: null,
      },
      {
        bodyText:
          "Article 17 — Annulation avant le début de la Formation\n\n17.1 Par l'Entreprise. L'Entreprise peut annuler ou reporter l'inscription du Bénéficiaire : plus de sept jours ouvrés avant la date d'entrée en formation, sans frais ; sept jours ouvrés ou moins avant cette date, une indemnité forfaitaire de {{contract.cancellationFeePercent}} du prix convenu (soit {{contract.cancellationFeeAmount}}) demeure acquise à l'Organisme de formation au titre des frais d'organisation déjà exposés.\n\n17.2 Par l'Organisme de formation. L'annulation par l'Organisme de formation, pour quelque cause que ce soit, n'ouvre droit à aucune somme à son profit ; les sommes déjà versées sont intégralement restituées et un report est proposé lorsque cela est possible.\n\n17.3 Réciprocité. L'annulation par l'Organisme de formation moins de sept jours ouvrés avant l'entrée en formation, hors force majeure, ouvre droit au profit de l'Entreprise à une indemnité d'un montant égal à celle prévue au 17.1.",
        conditions: [{ questionKey: "indemniteAnnulation", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 17 — Annulation avant le début de la Formation\n\n17.1 Par l'Entreprise. L'Entreprise peut annuler ou reporter l'inscription du Bénéficiaire à tout moment avant la date d'entrée en formation, sans frais. Les sommes déjà versées sont intégralement restituées.\n\n17.2 Par l'Organisme de formation. L'annulation par l'Organisme de formation, pour quelque cause que ce soit, n'ouvre droit à aucune somme à son profit ; les sommes déjà versées sont intégralement restituées et un report est proposé lorsque cela est possible.",
        conditions: [{ questionKey: "indemniteAnnulation", in: ["non"] }],
      },
      {
        bodyText:
          "Article 18 — Interruption et abandon en cours de Formation\n\n18.1 Principe. En cas d'inexécution totale ou partielle de la Formation imputable à l'Organisme de formation, celui-ci restitue à l'Entreprise les sommes correspondant aux prestations non réalisées, conformément au droit commun des contrats (article 1231-1 du Code civil).\n\n18.2 Abandon du Bénéficiaire. En cas d'abandon du Bénéficiaire en cours de formation pour une cause qui ne relève pas de l'Organisme de formation, seules les prestations effectivement réalisées à la date de l'abandon sont dues, calculées au prorata de la durée pédagogique accomplie.\n\n18.3 Force majeure. Lorsque l'abandon procède d'un cas de force majeure dûment justifié touchant le Bénéficiaire, seules les prestations effectivement dispensées sont dues, à due proportion de leur valeur prévue à la convention.\n\n18.4 Interruption du fait de l'Organisme de formation. En cas d'interruption imputable à l'Organisme de formation, celui-ci propose une session de rattrapage ; à défaut, la convention est résiliée et les sommes correspondant aux prestations non réalisées sont restituées.",
        conditions: null,
      },
      {
        bodyText:
          "Article 19 — Force majeure\n\n19.1 Définition. Constitue un cas de force majeure tout événement répondant aux conditions de l'article 1218 du Code civil.\n\n19.2 Illustrations. Sont notamment assimilés à des cas de force majeure, lorsqu'ils réunissent ces conditions et paralysent l'exécution : épidémie ou pandémie et les mesures administratives qui en découlent ; grève, conflit du travail interne ou externe, lock-out ; pénurie affectant les moyens nécessaires à l'exécution ; insurrection, attentat, acte de terrorisme, guerre ; incendie, inondation, tempête, séisme et autres catastrophes naturelles ; cyberattaque, intrusion, rançongiciel ou virus informatique ; coupure prolongée d'électricité ou de télécommunications ; décision d'une autorité publique faisant obstacle à l'exécution. Cette énumération n'est pas limitative.\n\n19.3 Effets. L'exécution des obligations affectées est suspendue pour la durée de l'empêchement, sans indemnité de part ni d'autre. Lorsque l'empêchement se prolonge au-delà de soixante jours, chaque Partie peut résilier la convention par lettre recommandée avec avis de réception, le règlement s'opérant alors conformément à l'article 18.3.\n\n19.4 Substitution de modalité. Lorsqu'un événement de force majeure affecte une séance prévue en présentiel, l'Organisme de formation peut la reporter ou la dispenser à distance, après information de l'Entreprise, sans que cette adaptation constitue une inexécution.\n\nArticle 20 — Résiliation pour manquement\n\n20.1 En cas de manquement par une Partie à l'une de ses obligations essentielles, l'autre Partie peut résilier la convention quinze jours après une mise en demeure demeurée infructueuse, adressée par lettre recommandée avec avis de réception et énonçant précisément le manquement reproché.\n\n20.2 En cas de manquement d'une gravité telle qu'il rend impossible la poursuite de la convention, la résiliation peut intervenir sans préavis, par lettre recommandée avec avis de réception motivée.\n\n20.3 La résiliation produit les effets de l'article 18.2, sans préjudice des dommages et intérêts que la Partie lésée serait fondée à réclamer.",
        conditions: null,
      },
      {
        bodyText:
          "Article 21 — Propriété intellectuelle\n\n21.1 L'Organisme de formation demeure titulaire exclusif de l'ensemble des droits de propriété intellectuelle attachés aux Supports, à la Plateforme et à toute méthode communiquée. La convention n'emporte aucune cession de ces droits.\n\n21.2 L'Entreprise et le Bénéficiaire disposent d'un droit d'usage personnel, non exclusif, non cessible, limité aux besoins de la Formation.\n\n21.3 Sont interdits, sauf autorisation écrite préalable : la reproduction, l'adaptation ou la diffusion des Supports à des tiers, y compris au sein d'un groupe de sociétés dont l'Entreprise ferait partie ; leur exploitation à des fins de formation interne ou commerciale.\n\nArticle 22 — Confidentialité\n\nChaque Partie s'oblige à tenir confidentielle toute information non publique portée à sa connaissance à l'occasion de l'exécution de la convention, notamment les informations commerciales, techniques ou stratégiques de l'autre Partie, et à ne l'utiliser que pour les besoins des présentes. Cet engagement demeure en vigueur pendant trois ans à compter du terme de la convention.",
        conditions: null,
      },
      {
        bodyText:
          "Article 23 — Sous-traitance et conformité au Référentiel National Qualité\n\n23.1 Lorsque tout ou partie de la Formation est confiée à un sous-traitant ou à un intervenant extérieur, l'Organisme de formation demeure seul responsable, à l'égard de l'Entreprise, de la bonne exécution de la convention.\n\n23.2 L'Organisme de formation s'engage à ce que tout sous-traitant exerce sa mission dans le respect des exigences du Référentiel National Qualité applicables à la prestation sous-traitée (information du public, adaptation aux publics, évaluation des acquis, accessibilité aux personnes en situation de handicap), conformément à l'indicateur 27 du référentiel Qualiopi, et à fournir à l'Entreprise, sur demande motivée, tout justificatif utile.",
        conditions: null,
      },
      {
        bodyText:
          "Article 24 — Assurance\n\nL'Organisme de formation déclare être titulaire d'une assurance responsabilité civile professionnelle couvrant les conséquences pécuniaires de sa responsabilité civile susceptible d'être engagée à raison de l'exécution de la présente convention, et s'engage à la maintenir en vigueur pendant toute sa durée. Une attestation est transmise à l'Entreprise sur demande.",
        conditions: null,
      },
      {
        bodyText:
          "Article 25 — Protection des données à caractère personnel\n\n25.1 Responsable de traitement. L'Organisme de formation traite les données du Bénéficiaire en qualité de responsable de traitement, au sens du Règlement (UE) 2016/679 et de la loi n° 78-17 du 6 janvier 1978 modifiée.\n\n25.2 Finalités et bases légales. Les données du Bénéficiaire sont traitées pour les finalités suivantes, chacune sur la base légale indiquée : la gestion de l'inscription et l'exécution de la convention, sur le fondement de l'exécution du contrat (article 6.1.b du RGPD) ; le suivi de l'assiduité, l'évaluation et la délivrance des attestations, sur le fondement de l'exécution du contrat et d'une obligation légale (article 6.1.b et c) ; la justification auprès des financeurs et des autorités de contrôle, sur le fondement d'une obligation légale (article 6.1.c) ; la facturation et la comptabilité, sur le fondement d'une obligation légale (article 6.1.c).\n\n25.3 Destinataires. Les données sont destinées aux services habilités de l'Organisme de formation, à ses sous-traitants agissant sur instruction documentée, à l'Entreprise pour les seules données nécessaires au suivi de l'exécution, aux financeurs concernés et, le cas échéant, aux organismes certificateurs et autorités de contrôle.\n\n25.4 Durées de conservation. Les données relatives à l'exécution de la formation sont conservées pendant la durée de la relation, puis archivées pendant la durée des prescriptions applicables ; les pièces justificatives requises par la réglementation de la formation professionnelle sont conservées conformément aux durées légales.\n\n25.5 Droits. Le Bénéficiaire dispose des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Il les exerce auprès de {{organization.publicContactEmail}}. Il peut introduire une réclamation auprès de la CNIL.\n\n25.6 Transferts. Aucun transfert hors Union européenne n'est réalisé sans garanties appropriées au sens du chapitre V du RGPD.",
        conditions: null,
      },
      {
        bodyText:
          "Annexe 3 — Autorisation d'utilisation de l'image et de la voix\n\nCette autorisation est facultative et distincte de la convention. Le refus du Bénéficiaire est sans incidence sur sa participation à la Formation.\n\nJe soussigné(e) {{contact.firstName}} {{contact.lastName}} autorise {{organization.name}} à capter, enregistrer, reproduire et diffuser mon image et ma voix, ainsi que mes nom et prénom, dans les conditions suivantes : ☐ J'accepte ☐ Je refuse\n\n1. Objet. L'autorisation porte sur les captations réalisées à l'occasion de ma participation à la Formation ou de tout événement organisé par l'Organisme de formation et expressément porté à ma connaissance.\n\n2. Supports et étendue. L'exploitation peut intervenir sur les sites internet et espaces de l'Organisme de formation ainsi que sur ses comptes de réseaux sociaux, à des fins de présentation de ses activités.\n\n3. Durée et retrait. L'autorisation est consentie pour une durée de trois ans à compter de sa signature. Je peux retirer mon consentement à tout moment, sans motif, par simple demande adressée à {{organization.publicContactEmail}}.\n\n4. Absence de rémunération. La présente autorisation est consentie à titre gratuit.\n\nFait à ………………, le ………………  Signature :",
        conditions: [{ questionKey: "droitImage", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 26 — Réclamations\n\nToute réclamation est adressée à {{organization.publicContactEmail}}. L'Organisme de formation en accuse réception sous cinq jours ouvrés et y répond dans un délai de trente jours.\n\nArticle 27 — Dispositions générales\n\n27.1 Intégralité. La convention et ses Annexes expriment l'intégralité de l'accord des Parties et annulent tout engagement antérieur de même objet.\n\n27.2 Modification. Toute modification fait l'objet d'un avenant écrit et signé.\n\n27.3 Nullité partielle. La nullité d'une stipulation n'affecte pas la validité des autres, les Parties s'engageant à lui substituer une stipulation d'effet économique équivalent et licite.\n\n27.4 Non-renonciation. Le fait de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.\n\n27.5 Notifications. Les notifications sont valablement effectuées aux adresses figurant en tête des présentes.\n\nArticle 28 — Signature électronique\n\nLes Parties conviennent de signer la présente convention par voie électronique au moyen d'un procédé garantissant l'identification du signataire et l'intégrité de l'acte. Elles lui reconnaissent la valeur probatoire attachée par les articles 1366 et 1367 du Code civil et renoncent à en contester la validité de ce seul chef.\n\nArticle 29 — Droit applicable et attribution de compétence\n\n29.1 La présente convention est soumise au droit français.\n\n29.2 Tout litige relatif à la formation, l'exécution ou l'interprétation de la présente convention qui n'aurait pu être résolu amiablement sera soumis à la compétence exclusive du Tribunal de commerce de {{organization.rcsCity}}, y compris en cas de pluralité de défendeurs ou d'appel en garantie, sous réserve que l'Entreprise ait elle-même la qualité de commerçant.\n\n29.3 À défaut, la compétence est celle des juridictions de droit commun, déterminée conformément au Code de procédure civile.\n\nFait le {{today}}, en deux exemplaires originaux, dont un remis à chaque Partie, précédé de la mention « Lu et approuvé ».\n\nPour l'Entreprise : {{company.legalRepresentativeName}}\nPour l'Organisme de formation : {{organization.legalRepresentativeName}}",
        conditions: null,
      },
    ],
  },
  {
    category: "needs_assessment",
    title: "Recueil des besoins",
    bodyText:
      "RECUEIL DES BESOINS\n\n" +
      "Merci de compléter les informations suivantes afin que nous puissions adapter au mieux la formation à votre situation.\n\n" +
      "1. Votre situation actuelle et votre expérience en lien avec la thématique de la formation.\n\n" +
      "2. Vos objectifs et attentes vis-à-vis de cette formation.\n\n" +
      "3. Les difficultés ou contraintes particulières dont l'organisme devrait avoir connaissance (rythme, disponibilités, besoins d'adaptation...).\n\n" +
      "4. Toute autre information utile pour personnaliser votre parcours.",
  },
  {
    category: "convocation",
    title: "Convocation",
    bodyText:
      "CONVOCATION\n\n" +
      "Vous êtes convoqué(e) à la session de formation suivante :\n\n" +
      "Intitulé : [TITRE DE LA FORMATION]\nDate(s) : [DATES]\nHoraires : [HORAIRES]\nLieu / lien de connexion : [LIEU OU LIEN VISIO]\nFormateur : [NOM DU FORMATEUR]\n\n" +
      "Merci de vous munir de [DOCUMENTS OU MATÉRIEL À APPORTER, LE CAS ÉCHÉANT].\n\n" +
      "En cas d'empêchement, merci de nous prévenir dans les meilleurs délais.",
  },
  {
    category: "eval_hot",
    title: "Évaluation à chaud",
    bodyText:
      "ÉVALUATION À CHAUD\n\n" +
      "À compléter à l'issue de la formation.\n\n" +
      "1. Les objectifs annoncés de la formation ont-ils été atteints ? (Pas du tout / Partiellement / Totalement)\n\n" +
      "2. Qualité des supports et méthodes pédagogiques utilisés.\n\n" +
      "3. Qualité de l'animation par le formateur.\n\n" +
      "4. Organisation logistique (lieu, horaires, matériel).\n\n" +
      "5. Points forts et axes d'amélioration.\n\n" +
      "6. Recommanderiez-vous cette formation ? (Oui / Non / Sans avis)",
  },
  {
    category: "eval_cold",
    title: "Évaluation à froid",
    bodyText:
      "ÉVALUATION À FROID\n\n" +
      "À adresser quelques semaines/mois après la fin de la formation.\n\n" +
      "1. Avez-vous pu mettre en pratique les acquis de la formation dans votre activité ?\n\n" +
      "2. Quels changements concrets avez-vous constatés dans votre pratique professionnelle ?\n\n" +
      "3. Quels freins avez-vous rencontrés, le cas échéant, dans la mise en application ?\n\n" +
      "4. Auriez-vous besoin d'un accompagnement complémentaire ?",
  },
  {
    category: "welcome_booklet",
    title: "Livret d'accueil",
    bodyText:
      "LIVRET D'ACCUEIL\n\n" +
      "Bienvenue chez [NOM DE L'ORGANISME].\n\n" +
      "1. Présentation de l'organisme — activité, valeurs, équipe : [À COMPLÉTER].\n\n" +
      "2. Vos interlocuteurs — référent pédagogique, référent handicap, contact administratif : [COORDONNÉES].\n\n" +
      "3. Modalités pratiques — horaires, accès aux locaux ou à la plateforme à distance, matériel nécessaire : [À COMPLÉTER].\n\n" +
      "4. Règlement intérieur — se référer au document dédié remis séparément.\n\n" +
      "5. Accessibilité — les personnes en situation de handicap peuvent contacter le référent handicap : [COORDONNÉES].\n\n" +
      "6. Modalités d'évaluation et de suivi — évaluations à chaud/à froid, suivi de la progression e-learning le cas échéant.\n\n" +
      "7. Réclamations — comment signaler une difficulté ou déposer une réclamation : [PROCÉDURE].",
  },
  {
    category: "attendance_sheet",
    title: "Feuille d'émargement",
    bodyText:
      "FEUILLE D'ÉMARGEMENT\n\n" +
      "Formation : [TITRE DE LA FORMATION]\n" +
      "Date : [DATE]\n" +
      "Horaires : [HORAIRES]\n" +
      "Formateur : [NOM DU FORMATEUR]\n" +
      "Lieu / modalité : [LIEU OU « À DISTANCE »]\n\n" +
      "Pour une session à distance, l'émargement électronique réel est disponible depuis la fiche de session " +
      "(classe virtuelle) une fois la présence enregistrée par connexion effective des participants.\n\n" +
      "Nom / Prénom | Matin (arrivée/départ) | Après-midi (arrivée/départ) | Signature\n" +
      "[À COMPLÉTER EN PRÉSENTIEL]",
  },
  {
    // Les deux bilans portent l'assiduité, les acquis et la note d'UNE
    // personne : ils se génèrent par apprenant (voir documentScope.ts). Le
    // stagiaire, la formation et les dates se remplissent donc tout seuls,
    // et seule l'appréciation reste à écrire — c'est le seul endroit où le
    // formateur apporte quelque chose que Jalon ne sait pas.
    category: "interim_report",
    title: "Bilan intermédiaire",
    bodyText:
      "BILAN INTERMÉDIAIRE\n\n" +
      "Stagiaire : {{contact.firstName}} {{contact.lastName}}\n" +
      "Formation : {{course.title}}\n" +
      "Période couverte : du {{session.startsAt}} au {{session.endsAt}}\n" +
      "Organisme : {{organization.name}}\n\n" +
      "1. Progression par rapport aux objectifs initiaux : [à compléter].\n\n" +
      "2. Modules ou compétences déjà validés : [à compléter].\n\n" +
      "3. Points de vigilance ou difficultés identifiées à date : [à compléter].\n\n" +
      "4. Ajustements envisagés pour la suite du parcours, le cas échéant (individualisation) : [à compléter].\n\n" +
      "5. Prochaine échéance de suivi : [date].",
  },
  {
    category: "final_report",
    title: "Bilan final",
    bodyText:
      "BILAN FINAL\n\n" +
      "Stagiaire : {{contact.firstName}} {{contact.lastName}}\n" +
      "Formation : {{course.title}}\n" +
      "Durée : {{course.duration}}\n" +
      "Période : du {{session.startsAt}} au {{session.endsAt}}\n" +
      "Organisme : {{organization.name}}\n\n" +
      "1. Objectifs de la formation : {{course.objectives}}\n\n" +
      "2. Atteinte des objectifs — synthèse des résultats obtenus : [à compléter].\n\n" +
      "3. Assiduité — taux de présence sur l'ensemble du parcours : [à compléter].\n\n" +
      "4. Évaluation finale des acquis — résultats, le cas échéant note ou validation de compétences : [à compléter].\n\n" +
      "5. Recommandations et suites possibles (formation complémentaire, mise en pratique...) : [à compléter].\n\n" +
      "Fait à [lieu], le [date].\n" +
      "Pour {{organization.name}} — {{organization.legalRepresentativeName}}",
  },
  {
    category: "results_summary",
    title: "Relevé de résultats",
    bodyText:
      "RELEVÉ DE RÉSULTATS\n\n" +
      "Bénéficiaire : [NOM ET PRÉNOM]\n" +
      "Formation : [TITRE DE LA FORMATION]\n" +
      "Période : [DATES]\n\n" +
      "Épreuve / module | Résultat obtenu | Seuil de réussite | Validé\n" +
      "[À COMPLÉTER — une ligne par module ou évaluation]\n\n" +
      "Résultat global : [À COMPLÉTER]\n\n" +
      "Fait à [VILLE], le [DATE].\n" +
      "Signature du responsable pédagogique : [SIGNATURE]",
  },
  {
    category: "subcontractor_contract",
    title: "Contrat sous-traitant / intervenant",
    bodyText:
      "CONTRAT DE SOUS-TRAITANCE / PRESTATION PÉDAGOGIQUE\n\n" +
      "Entre [NOM DE L'ORGANISME], d'une part, et [NOM DU PRESTATAIRE / INTERVENANT], d'autre part.\n\n" +
      "Article 1 — Objet : le présent contrat a pour objet la réalisation, pour le compte de l'organisme, de tout ou partie de la prestation de formation suivante : [INTITULÉ DE LA FORMATION / MISSION].\n\n" +
      "Article 2 — Durée : [DATE DE DÉBUT] au [DATE DE FIN, le cas échéant].\n\n" +
      "Article 3 — Obligations du prestataire : qualifications et moyens mobilisés, respect du programme et des modalités pédagogiques définis par l'organisme : [À COMPLÉTER].\n\n" +
      "Article 4 — Engagement de conformité au Référentiel National Qualité (RNQ) — indicateur 27 : le prestataire s'engage à exercer sa mission dans le respect des exigences du RNQ applicables à la prestation sous-traitée (information du public, adaptation aux publics, évaluation des acquis, accessibilité aux personnes en situation de handicap notamment), et à fournir à l'organisme, sur demande, tout justificatif permettant d'en attester dans le cadre d'un audit de certification.\n\n" +
      "Article 5 — Rémunération et modalités de règlement : [À COMPLÉTER].\n\n" +
      "Article 6 — Confidentialité : le prestataire s'engage à ne pas divulguer les informations dont il aurait connaissance dans le cadre de sa mission, notamment les données personnelles des bénéficiaires.\n\n" +
      "Article 7 — Résiliation : conditions de résiliation anticipée du présent contrat par l'une ou l'autre des parties : [À COMPLÉTER].",
  },
  {
    category: "trainer_contract",
    title: "Contrat de prestation de services de formation — formateur indépendant",
    bodyText: "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
    blocks: [
      {
        bodyText:
          "CONTRAT DE PRESTATION DE SERVICES DE FORMATION\n\n(intervenant / formateur indépendant)\n\nENTRE LES SOUSSIGNÉS :\n\n{{organization.name}}, {{organization.legalForm}} au capital social de {{organization.shareCapital}}, dont le siège social est sis {{organization.legalAddress}}, immatriculée au Registre du Commerce et des Sociétés de {{organization.rcsCity}} sous le numéro {{organization.rcsNumber}}, identifiée sous le numéro SIRET {{organization.siret}}, représentée par {{organization.legalRepresentativeName}}, dûment habilité(e) à l'effet des présentes,\n\nCi-après dénommée « l'Organisme »,\n\nD'une part,\n\nET :\n\n{{subcontractor.name}}, immatriculé(e) sous le numéro SIRET {{subcontractor.siret}}, dont l'adresse est {{subcontractor.address}}, agissant en qualité de prestataire indépendant,\n\nCi-après dénommé(e) « le Prestataire »,\n\nD'autre part,\n\nCi-après dénommées ensemble « les Parties » et individuellement « la Partie ».",
        conditions: null,
      },
      {
        bodyText:
          "IL A PRÉALABLEMENT ÉTÉ EXPOSÉ CE QUI SUIT :\n\n(A) L'Organisme exerce une activité de formation professionnelle continue au sens des articles L.6311-1 et suivants du Code du travail.\n\n(B) Le Prestataire exerce, à titre indépendant et sous sa propre responsabilité, une activité de formateur, d'intervenant ou de conseil en lien avec le domaine d'expertise décrit à l'article 2, pour le compte d'une clientèle qui lui est propre et dont l'Organisme ne constitue qu'un client parmi d'autres.\n\n(C) Les Parties se sont rapprochées afin que le Prestataire intervienne, en toute indépendance, pour le compte de l'Organisme dans les conditions définies aux présentes.\n\n(D) Les Parties déclarent agir en qualité de professionnels indépendants l'un de l'autre, sans lien de subordination, conformément à la présomption de non-salariat attachée aux personnes immatriculées prévue par l'article L.8221-6 du Code du travail.\n\nCECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :",
        conditions: null,
      },
      {
        bodyText:
          "Article 1 — Définitions\n\nLes termes ci-après, employés avec une majuscule, ont la signification suivante : « Mission » désigne l'ensemble des prestations décrites à l'article 2 ; « Apprenants » désigne les stagiaires, élèves ou bénéficiaires auprès desquels le Prestataire intervient pour le compte de l'Organisme ; « Supports » désigne l'ensemble des contenus pédagogiques créés par le Prestataire dans le cadre de la Mission.\n\nArticle 2 — Objet du contrat\n\nLe présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire réalise, pour le compte de l'Organisme et en toute indépendance, la Mission décrite ci-après, ainsi que les droits et obligations réciproques des Parties. Il ne constitue en aucun cas un contrat de travail.",
        conditions: null,
      },
      {
        bodyText:
          "Article 3 — Nature de la Mission : accompagnement individualisé\n\n3.1 Objet. Le Prestataire assure, au bénéfice des Apprenants désignés par l'Organisme, un accompagnement individualisé (tutorat, suivi personnalisé, correction de travaux) dans le domaine suivant : [DOMAINE D'INTERVENTION].\n\n3.2 Modalités. Les modalités pratiques (fréquence, durée et format des interventions) sont convenues d'un commun accord entre les Parties, dans le respect de l'autonomie d'organisation du Prestataire rappelée à l'article 5.\n\n3.3 Moyens. Le Prestataire mobilise son propre matériel, ses propres outils et abonnements pour la réalisation de la Mission ; leur coût demeure à sa charge exclusive, sauf stipulation contraire convenue par écrit.",
        conditions: [{ questionKey: "missionFormateur", in: ["individualise"] }],
      },
      {
        bodyText:
          "Article 3 — Nature de la Mission : animation de sessions collectives\n\n3.1 Objet. Le Prestataire assure l'animation, au bénéfice des Apprenants inscrits par l'Organisme, de sessions de formation collectives dans le domaine suivant : [DOMAINE D'INTERVENTION].\n\n3.2 Contenu et validation. Le contenu pédagogique et les supports utilisés sont, préalablement à chaque session, communiqués à l'Organisme, qui s'assure de leur conformité au programme et aux exigences du Référentiel National Qualité. Cette vérification porte sur le contenu et n'emporte aucune immixtion dans les méthodes pédagogiques du Prestataire.\n\n3.3 Comportement en session. Le Prestataire s'engage à adopter, envers les Apprenants et les autres intervenants, un comportement respectueux, et à s'abstenir de tout propos ou comportement discriminatoire, injurieux ou contraire à l'ordre public.\n\n3.4 Moyens. Le Prestataire mobilise son propre matériel, ses propres outils et abonnements pour la réalisation de la Mission ; leur coût demeure à sa charge exclusive, sauf stipulation contraire convenue par écrit.",
        conditions: [{ questionKey: "missionFormateur", in: ["collectif"] }],
      },
      {
        bodyText:
          "Article 3 bis — Enregistrement des sessions et droit à l'image du Prestataire\n\n3 bis.1 Enregistrement. Les sessions animées par le Prestataire sont enregistrées par l'Organisme en vue de leur mise à disposition différée auprès des Apprenants, dans les conditions convenues entre les Parties (fréquence, format, délai de livraison le cas échéant).\n\n3 bis.2 Autorisation d'image et de voix. Le Prestataire autorise l'Organisme à capter, enregistrer, reproduire et diffuser son image, sa voix et son nom dans le cadre de ces enregistrements, sur les supports et selon les modalités convenues entre les Parties, conformément à l'article 9 du Code civil.\n\n3 bis.3 Portée. Cette autorisation est strictement limitée aux besoins de la Mission et ne s'étend à aucun usage publicitaire ou promotionnel distinct sans l'accord exprès du Prestataire.\n\n3 bis.4 Consentement des Apprenants. Lorsque des Apprenants sont susceptibles d'apparaître ou de s'exprimer au cours d'une session enregistrée, l'Organisme recueille leur consentement préalable et exprès selon ses propres modalités, distinctement du présent contrat ; le Prestataire n'a pas à en connaître ni à en assurer la collecte.",
        conditions: [{ questionKey: "enregistrementSessions", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 4 — Obligations de l'Organisme\n\nL'Organisme s'engage à : communiquer au Prestataire les informations nécessaires à la bonne réalisation de la Mission (programme, effectifs, contraintes calendaires) ; régler la rémunération convenue selon les modalités de l'article 9 ; respecter l'indépendance du Prestataire dans l'exercice de la Mission.",
        conditions: null,
      },
      {
        bodyText:
          "Article 5 — Obligations du Prestataire\n\n5.1 Indépendance. Le Prestataire exerce la Mission en toute indépendance, sans lien de subordination juridique à l'égard de l'Organisme. Il détermine librement son organisation et ses méthodes de travail, sous la seule réserve du respect du programme et des exigences qualité rappelées à l'article 6.\n\n5.2 Non-exclusivité. Le présent contrat n'est pas exclusif : le Prestataire demeure libre d'exercer son activité pour le compte d'autres clients, y compris d'autres organismes de formation, sans que l'Organisme puisse s'y opposer.\n\n5.3 Diligence. Le Prestataire s'engage à mettre en œuvre tout le soin, le professionnalisme et les compétences nécessaires à la bonne exécution de la Mission. Il est tenu d'une obligation de moyens ; le présent contrat ne comporte aucune garantie de résultat pédagogique.\n\n5.4 Salariés et préposés. Si le Prestataire fait appel à ses propres salariés ou préposés pour l'exécution de la Mission, il demeure seul responsable de leurs actes à l'égard de l'Organisme et des Apprenants.",
        conditions: null,
      },
      {
        bodyText:
          "Article 6 — Conformité au Référentiel National Qualité\n\nLe Prestataire s'engage à exercer la Mission dans le respect des exigences du Référentiel National Qualité applicables à la prestation qui lui est confiée (information du public, adaptation aux publics, évaluation des acquis, accessibilité aux personnes en situation de handicap notamment), conformément à l'indicateur 27 du référentiel Qualiopi, et à fournir à l'Organisme, sur demande, tout justificatif permettant d'en attester dans le cadre d'un audit de certification.",
        conditions: null,
      },
      {
        bodyText:
          "Article 7 — Vigilance et lutte contre le travail dissimulé\n\n7.1 Le Prestataire remet à l'Organisme, à la signature puis tous les six mois pendant la durée du contrat, conformément au devoir de vigilance de l'article L.8222-1 du Code du travail : un extrait Kbis ou, pour une personne physique, l'attestation d'immatriculation correspondante ; une attestation de fourniture des déclarations sociales de moins de six mois (article L.243-15 du Code de la sécurité sociale) ; le cas échéant, la liste nominative des salariés étrangers soumis à autorisation de travail (article D.8254-2 du Code du travail).\n\n7.2 À défaut de production de ces documents, l'Organisme peut suspendre le règlement des sommes dues jusqu'à régularisation, sans que cette suspension ouvre droit à indemnité au profit du Prestataire.",
        conditions: null,
      },
      {
        bodyText:
          "Article 8 — Durée\n\nLe présent contrat est conclu pour une durée déterminée courant du {{subcontractor.contractStartDate}} au {{subcontractor.contractEndDate}}. Il est renouvelable par accord exprès et écrit des Parties, à l'exclusion de toute reconduction tacite.",
        conditions: null,
      },
      {
        bodyText:
          "Article 9 — Rémunération et facturation\n\n9.1 Montant. La Mission est rémunérée selon les modalités convenues entre les Parties (forfait, taux horaire ou par session), précisées en annexe.\n\n9.2 Facturation. Le Prestataire adresse à l'Organisme une facture mensuelle détaillant les prestations réalisées. Le règlement intervient dans un délai de trente jours à compter de la réception de la facture.\n\n9.3 Retard de paiement. Tout retard de paiement porte intérêt de plein droit, sans mise en demeure préalable, à un taux égal à trois fois le taux d'intérêt légal, conformément à l'article L.441-10 du Code de commerce, et donne lieu à une indemnité forfaitaire de recouvrement de 40 €, sans préjudice d'une indemnisation complémentaire sur justification.",
        conditions: null,
      },
      {
        bodyText:
          "Article 10 — Propriété intellectuelle\n\n10.1 Supports préexistants de l'Organisme. Les Supports et méthodes préexistants de l'Organisme, mis à disposition du Prestataire pour les besoins de la Mission, demeurent sa propriété exclusive et ne sont concédés en usage que pour la durée de la Mission.\n\n10.2 Créations du Prestataire. Les Supports créés par le Prestataire spécifiquement pour la Mission sont cédés à l'Organisme au fur et à mesure de leur règlement, pour le monde entier et pour la durée légale de protection des droits d'auteur, conformément à l'article L.131-3 du Code de la propriété intellectuelle. Cette cession porte sur le droit de reproduction, de représentation et d'adaptation, aux fins de dispense de la Formation par l'Organisme et de communication de son offre.\n\n10.3 Droit moral. Le droit moral du Prestataire sur les Supports qu'il a créés n'est pas cédé et demeure attaché à sa personne, conformément à l'article L.121-1 du Code de la propriété intellectuelle.\n\n10.4 Base de données. La base de données constituée par l'Organisme (fichier des Apprenants, historique des sessions) demeure sa propriété exclusive ; le Prestataire s'interdit toute extraction ou réutilisation à des fins étrangères à la Mission.",
        conditions: null,
      },
      {
        bodyText:
          "Article 11 — Confidentialité\n\nChaque Partie s'oblige à tenir confidentielle toute information non publique portée à sa connaissance à l'occasion de l'exécution du contrat, notamment les informations commerciales, pédagogiques ou techniques de l'autre Partie et les données des Apprenants, et à ne les utiliser que pour les besoins des présentes. Cet engagement demeure en vigueur pendant trois ans à compter du terme du contrat.",
        conditions: null,
      },
      {
        bodyText:
          "Article 12 — Protection des données à caractère personnel\n\n12.1 Qualité des Parties. Pour les données des Apprenants auxquelles il accède dans le cadre de la Mission, le Prestataire agit en qualité de sous-traitant au sens de l'article 28 du Règlement (UE) 2016/679, sur instruction et pour le compte de l'Organisme, responsable de traitement.\n\n12.2 Obligations du Prestataire. Le Prestataire s'engage à ne traiter ces données que pour les besoins strictement nécessaires à l'exécution de la Mission, à garantir leur confidentialité et leur sécurité, à ne pas les conserver au-delà de la durée de la Mission sauf obligation légale contraire, et à les détruire ou les restituer au terme du contrat, sur instruction de l'Organisme.\n\n12.3 Sous-traitance ultérieure. Le Prestataire ne peut recourir à un sous-traitant ultérieur pour le traitement de ces données sans autorisation écrite préalable de l'Organisme.",
        conditions: null,
      },
      {
        bodyText:
          "Article 13 — Non-sollicitation de la clientèle\n\nPendant la durée du contrat et pendant les deux années suivant son terme, le Prestataire s'interdit de démarcher directement, pour son propre compte ou celui d'un tiers, les Apprenants et les clients de l'Organisme dont il aurait eu connaissance dans le cadre de la Mission.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 — Assurance\n\nLe Prestataire déclare être titulaire d'une assurance responsabilité civile professionnelle couvrant les conséquences pécuniaires de sa responsabilité civile susceptible d'être engagée à raison de l'exécution du présent contrat, et s'engage à la maintenir en vigueur pendant toute sa durée. Une attestation est transmise à l'Organisme à la signature puis sur demande.",
        conditions: null,
      },
      {
        bodyText:
          "Article 15 — Résiliation\n\n15.1 Résiliation pour manquement. En cas de manquement par une Partie à l'une de ses obligations essentielles, l'autre Partie peut résilier le contrat quinze jours après une mise en demeure demeurée infructueuse, adressée par lettre recommandée avec avis de réception et énonçant précisément le manquement reproché.\n\n15.2 Résiliation pour faute grave. En cas de manquement d'une gravité telle qu'il rend impossible la poursuite du contrat — notamment violation de la confidentialité, atteinte aux droits de propriété intellectuelle de l'Organisme, ou comportement gravement inapproprié envers les Apprenants —, la résiliation peut intervenir sans préavis, par lettre recommandée avec avis de réception motivée.\n\n15.3 Restitution. En fin de contrat, quelle qu'en soit la cause, le Prestataire restitue à l'Organisme, dans un délai de sept jours, tout document, matériel et accès mis à sa disposition.",
        conditions: null,
      },
      {
        bodyText:
          "Article 16 — Clause pénale\n\nTout manquement du Prestataire aux obligations de confidentialité, de propriété intellectuelle ou de non-sollicitation prévues aux articles 10, 11 et 13 donne lieu, de plein droit et sans mise en demeure préalable, au versement d'une indemnité forfaitaire dont le montant est précisé en annexe, sans préjudice de la réparation du préjudice réellement subi si celui-ci excède ce montant. Conformément à l'article 1231-5 du Code civil, cette indemnité peut être modérée ou augmentée par le juge si elle est manifestement excessive ou dérisoire.",
        conditions: null,
      },
      {
        bodyText:
          "Article 17 — Force majeure\n\nAucune des Parties ne pourra être tenue responsable envers l'autre de l'inexécution ou du retard dans l'exécution d'une obligation du présent contrat lorsque cette inexécution ou ce retard résulte d'un cas de force majeure au sens de l'article 1218 du Code civil. La Partie empêchée en informe l'autre sans délai et met en œuvre les moyens raisonnables pour en limiter les effets.",
        conditions: null,
      },
      {
        bodyText:
          "Article 18 — Dispositions générales\n\n18.1 Intégralité. Le contrat exprime l'intégralité de l'accord des Parties et annule tout engagement antérieur de même objet.\n\n18.2 Modification. Toute modification fait l'objet d'un avenant écrit et signé.\n\n18.3 Nullité partielle. La nullité d'une stipulation n'affecte pas la validité des autres, les Parties s'engageant à lui substituer une stipulation d'effet économique équivalent et licite.\n\n18.4 Non-renonciation. Le fait de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.\n\n18.5 Cession. Le contrat est conclu intuitu personae à l'égard du Prestataire et ne peut être cédé par lui sans accord écrit préalable ; l'Organisme peut le céder à toute structure qui lui succéderait dans son activité de formation.",
        conditions: null,
      },
      {
        bodyText:
          "Article 19 — Signature électronique\n\nLes Parties conviennent de signer le présent contrat par voie électronique au moyen d'un procédé garantissant l'identification du signataire et l'intégrité de l'acte. Elles lui reconnaissent la valeur probatoire attachée par les articles 1366 et 1367 du Code civil et renoncent à en contester la validité de ce seul chef.\n\nArticle 20 — Droit applicable et juridiction\n\nLe présent contrat est soumis au droit français. Tout litige relatif à sa formation, son exécution ou son interprétation qui n'aurait pu être résolu amiablement sera porté devant les juridictions compétentes en application des règles de droit commun du Code de procédure civile.\n\nFait le {{today}}, en deux exemplaires originaux, dont un remis à chaque Partie.\n\nLe Prestataire : {{subcontractor.name}}\nPour l'Organisme : {{organization.legalRepresentativeName}}",
        conditions: null,
      },
    ],
  },
  {
    category: "video_shoot_contract",
    title: "Contrat de tournage — intervenant filmé",
    bodyText: "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
    blocks: [
      {
        bodyText:
          "CONTRAT DE TOURNAGE\n\n(intervenant filmé)\n\nENTRE LES SOUSSIGNÉS :\n\n{{organization.name}}, {{organization.legalForm}} au capital social de {{organization.shareCapital}}, dont le siège social est sis {{organization.legalAddress}}, immatriculée au Registre du Commerce et des Sociétés de {{organization.rcsCity}} sous le numéro {{organization.rcsNumber}}, identifiée sous le numéro SIRET {{organization.siret}}, représentée par {{organization.legalRepresentativeName}}, dûment habilité(e) à l'effet des présentes,\n\nCi-après dénommée « l'Organisme »,\n\nD'une part,\n\nET :\n\n{{subcontractor.name}}, immatriculé(e) sous le numéro SIRET {{subcontractor.siret}}, dont l'adresse est {{subcontractor.address}}, agissant en qualité de prestataire indépendant,\n\nCi-après dénommé(e) « le Prestataire »,\n\nD'autre part,\n\nCi-après dénommées ensemble « les Parties » et individuellement « la Partie ».",
        conditions: null,
      },
      {
        bodyText:
          "IL A PRÉALABLEMENT ÉTÉ EXPOSÉ CE QUI SUIT :\n\n(A) L'Organisme exerce une activité de formation professionnelle continue et souhaite, à ce titre, produire du contenu vidéo pédagogique destiné à ses Apprenants.\n\n(B) Le Prestataire est un professionnel reconnu dans son domaine d'expertise, apte à intervenir à l'écran pour la réalisation de ce contenu.\n\n(C) Les Parties se sont rapprochées afin que le Prestataire prête son concours, en qualité d'intervenant filmé, à la réalisation d'une ou plusieurs vidéos dont l'Organisme conserve la maîtrise de la production.\n\nCECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :",
        conditions: null,
      },
      {
        bodyText:
          "Article 1 — Définitions\n\n« Vidéo » désigne chaque œuvre audiovisuelle issue du tournage, dans sa version finalisée après montage. « Contenu » désigne les propos, apports intellectuels et éléments de script fournis ou tenus par le Prestataire à l'occasion du tournage, indépendamment de leur fixation dans la Vidéo. « Apprenants » désigne les stagiaires et bénéficiaires des formations de l'Organisme.\n\nArticle 2 — Objet du contrat\n\nLe présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire prête son concours au tournage, par l'Organisme, d'une ou plusieurs Vidéos, ainsi que le régime des droits portant sur celles-ci. Il ne constitue en aucun cas un contrat de travail et n'emporte aucun lien de subordination, conformément à la présomption de non-salariat attachée aux personnes immatriculées prévue par l'article L.8221-6 du Code du travail.",
        conditions: null,
      },
      {
        bodyText:
          "Article 3 — Organisation du tournage\n\n3.1 Maîtrise de la production. L'Organisme assure la maîtrise de la production : choix du lieu, du matériel, du calendrier et des conditions techniques de tournage, ainsi que du montage final de la Vidéo.\n\n3.2 Calendrier. Les dates de tournage sont fixées d'un commun accord entre les Parties. Tout report est notifié dans un délai raisonnable ; des reports répétés et injustifiés du fait du Prestataire peuvent constituer un manquement au sens de l'article 13.\n\n3.3 Script et préparation. Lorsqu'un script ou un plan de tournage est fourni par l'Organisme, le Prestataire s'engage à en prendre connaissance préalablement et à le respecter, sous réserve de son apport d'expertise sur le fond.",
        conditions: null,
      },
      {
        bodyText:
          "Article 4 — Autorisation d'utilisation de l'image, de la voix et du nom\n\n4.1 Conformément à l'article 9 du Code civil, le Prestataire autorise expressément l'Organisme à capter, fixer, reproduire et diffuser son image, sa voix, son nom et son prénom dans le cadre de la Vidéo.\n\n4.2 Étendue. Cette autorisation couvre l'exploitation de la Vidéo sur les supports et selon les modalités convenues entre les Parties (site internet, plateforme de formation, réseaux sociaux de l'Organisme), pour la durée précisée à l'article 9.\n\n4.3 Limites. Cette autorisation ne s'étend à aucun usage publicitaire pour le compte d'un tiers, ni à aucune association avec un contenu portant atteinte à la réputation, à la dignité ou à la vie privée du Prestataire.",
        conditions: null,
      },
      {
        bodyText:
          "Article 4 bis — Consentement des Apprenants filmés\n\n4 bis.1 Lorsqu'un ou plusieurs Apprenants apparaissent ou s'expriment dans la Vidéo aux côtés du Prestataire, l'Organisme recueille leur consentement préalable, exprès et écrit avant le tournage, selon ses propres modalités.\n\n4 bis.2 L'Organisme demeure seul responsable, en qualité de responsable de traitement au sens du Règlement (UE) 2016/679, de la collecte et de la conservation de ce consentement. Le Prestataire n'a pas à en connaître ni à en assurer la collecte, et ne peut lui-même exploiter l'image ou la voix des Apprenants ainsi captées en dehors du cadre du présent contrat.",
        conditions: [{ questionKey: "stagiairesApparaissent", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 5 — Obligations du Prestataire\n\nLe Prestataire s'engage à : se rendre disponible aux dates de tournage convenues ; adopter une tenue et un comportement conformes à l'image professionnelle de l'Organisme ; apporter son expertise et signaler à l'Organisme toute erreur ou approximation qu'il constaterait dans le script ou les supports fournis ; respecter les consignes techniques raisonnables données pendant le tournage.\n\nLe Prestataire est tenu d'une obligation de moyens ; il ne garantit aucun résultat en termes d'audience, d'usage ou d'exploitation commerciale de la Vidéo.",
        conditions: null,
      },
      {
        bodyText:
          "Article 6 — Obligations de l'Organisme\n\nL'Organisme s'engage à : communiquer au Prestataire, en temps utile, le script ou le plan de tournage lorsqu'il en existe un ; assurer des conditions de tournage raisonnables ; régler la rémunération convenue selon les modalités de l'article 7 ; ne pas dénaturer, par le montage, les propos tenus par le Prestataire d'une manière qui en altérerait le sens.",
        conditions: null,
      },
      {
        bodyText:
          "Article 7 — Rémunération\n\n7.1 La participation du Prestataire au tournage est rémunérée selon les modalités convenues entre les Parties (forfait par vidéo, par demi-journée de tournage, ou autre base), précisées en annexe. Cette rémunération inclut, sauf stipulation contraire, la cession et la licence de droits prévues aux articles 8 et 9.\n\n7.2 Le Prestataire facture l'Organisme selon les modalités convenues ; le règlement intervient dans un délai de trente jours à compter de la réception de la facture. Tout retard porte intérêt de plein droit, conformément à l'article L.441-10 du Code de commerce, et donne lieu à une indemnité forfaitaire de recouvrement de 40 €.",
        conditions: null,
      },
      {
        bodyText:
          "Article 8 — Titularité des droits sur la Vidéo\n\n8.1 Conformément à l'article L.132-24 du Code de la propriété intellectuelle, l'Organisme, en sa qualité de producteur de la Vidéo, est présumé titulaire, à titre originaire, des droits d'exploitation de celle-ci, sans qu'il soit besoin d'une cession distincte à ce titre — la participation du Prestataire à sa réalisation étant, à cet égard, indifférente à la détermination de cette titularité.\n\n8.2 Cette présomption ne porte que sur la Vidéo en tant qu'œuvre audiovisuelle assemblée ; elle est sans effet sur les droits du Prestataire relatifs au Contenu, régis par l'article 9.",
        conditions: null,
      },
      {
        bodyText:
          "Article 9 — Licence sur le Contenu du Prestataire\n\n9.1 Concession. Le Prestataire concède à l'Organisme, à titre non exclusif, le droit de reproduire, représenter et adapter le Contenu qu'il a fourni ou tenu, dans le cadre de la Vidéo et de son exploitation par l'Organisme.\n\n9.2 Durée et étendue. Cette licence est consentie pour une durée de cinq ans à compter de la livraison de la Vidéo, pour une exploitation sur les supports et selon les modalités précisées à l'article 4.2, conformément aux exigences de l'article L.131-3 du Code de la propriété intellectuelle.\n\n9.3 Droit moral. Le droit moral du Prestataire sur le Contenu qu'il a personnellement conçu — droit à la paternité et au respect de son intégrité — n'est pas cédé et demeure attaché à sa personne, conformément à l'article L.121-1 du Code de la propriété intellectuelle. L'Organisme crédite le Prestataire dans les conditions usuelles pour ce type de contenu, sauf demande contraire de sa part.\n\n9.4 Absence de coauteur. Les Parties conviennent que le Prestataire, dont le rôle se limite à un apport de contenu oral dans le cadre défini par l'Organisme, n'acquiert pas la qualité de coauteur de la Vidéo au sens de l'article L.113-7 du Code de la propriété intellectuelle.",
        conditions: null,
      },
      {
        bodyText:
          "Article 10 — Vidéo constitutive d'une action de formation entière\n\n10.1 Lorsque la ou les Vidéos objet des présentes ne constituent pas un simple contenu complémentaire ou promotionnel, mais forment, à elles seules ou pour l'essentiel, une action de formation au sens de l'article L.6313-1 du Code du travail destinée à être commercialisée par l'Organisme, les Parties en tiennent compte pour la détermination du régime fiscal applicable.\n\n10.2 Le Prestataire est informé que l'exonération de TVA prévue par l'article 261-4-4° a du Code général des impôts, applicable aux prestations de formation professionnelle continue, suppose que le prestataire qui la facture soit lui-même déclaré organisme de formation. Il appartient aux Parties de vérifier, avant facturation, le régime de TVA applicable à la rémunération prévue à l'article 7 au regard du statut du Prestataire.",
        conditions: [{ questionKey: "contenuRevente", in: ["oui"] }],
      },
      {
        bodyText:
          "Article 11 — Confidentialité\n\nChaque Partie s'oblige à tenir confidentielle toute information non publique portée à sa connaissance à l'occasion de l'exécution du contrat — contenus non diffusés, informations commerciales ou pédagogiques de l'autre Partie — et à ne les utiliser que pour les besoins des présentes. Cet engagement demeure en vigueur pendant trois ans à compter du terme du contrat.",
        conditions: null,
      },
      {
        bodyText:
          "Article 12 — Données à caractère personnel\n\nL'Organisme, responsable du traitement au sens du Règlement (UE) 2016/679, traite les données d'image et de voix captées lors du tournage pour les seules finalités de production et de diffusion de la Vidéo dans les conditions prévues aux présentes. Le Prestataire s'interdit toute exploitation, extraction ou conservation de ces données en dehors du cadre du présent contrat.",
        conditions: null,
      },
      {
        bodyText:
          "Article 13 — Indépendance et non-exclusivité\n\nLe Prestataire exerce sa mission en toute indépendance, sans lien de subordination à l'égard de l'Organisme, et demeure libre d'exercer son activité pour le compte d'autres clients, y compris d'autres organismes de formation. Le présent contrat n'emporte aucune exclusivité, sauf stipulation contraire expressément convenue par écrit.",
        conditions: null,
      },
      {
        bodyText:
          "Article 14 — Résiliation\n\n14.1 En cas de manquement par une Partie à l'une de ses obligations essentielles, l'autre Partie peut résilier le contrat quinze jours après une mise en demeure demeurée infructueuse, adressée par lettre recommandée avec avis de réception et énonçant précisément le manquement reproché.\n\n14.2 En cas de manquement grave — notamment violation de la confidentialité ou atteinte aux droits de propriété intellectuelle de l'Organisme —, la résiliation peut intervenir sans préavis, par lettre recommandée avec avis de réception motivée.\n\n14.3 La résiliation avant tournage ne remet pas en cause les droits déjà acquis par l'Organisme sur les Vidéos déjà tournées et livrées.",
        conditions: null,
      },
      {
        bodyText:
          "Article 15 — Force majeure\n\nAucune des Parties ne pourra être tenue responsable de l'inexécution ou du retard dans l'exécution d'une obligation résultant d'un cas de force majeure au sens de l'article 1218 du Code civil. La Partie empêchée en informe l'autre sans délai.",
        conditions: null,
      },
      {
        bodyText:
          "Article 16 — Dispositions générales\n\n16.1 Le contrat exprime l'intégralité de l'accord des Parties et annule tout engagement antérieur de même objet. 16.2 Toute modification fait l'objet d'un avenant écrit et signé. 16.3 La nullité d'une stipulation n'affecte pas la validité des autres. 16.4 Le contrat est conclu intuitu personae à l'égard du Prestataire et ne peut être cédé par lui sans accord écrit préalable.\n\nArticle 17 — Signature électronique\n\nLes Parties conviennent de signer le présent contrat par voie électronique au moyen d'un procédé garantissant l'identification du signataire et l'intégrité de l'acte, et lui reconnaissent la valeur probatoire attachée par les articles 1366 et 1367 du Code civil.\n\nArticle 18 — Droit applicable et juridiction\n\nLe présent contrat est soumis au droit français. Tout litige qui n'aurait pu être résolu amiablement sera porté devant les juridictions compétentes en application des règles de droit commun du Code de procédure civile.\n\nFait le {{today}}, en deux exemplaires originaux, dont un remis à chaque Partie.\n\nLe Prestataire : {{subcontractor.name}}\nPour l'Organisme : {{organization.legalRepresentativeName}}",
        conditions: null,
      },
    ],
  },
  {
    category: "handicap_partners",
    title: "Répertoire des partenaires handicap",
    bodyText:
      "RÉPERTOIRE DES PARTENAIRES HANDICAP\n\n" +
      "Réseau national d'acteurs mobilisables pour l'accueil, l'accompagnement et le maintien en formation des " +
      "personnes en situation de handicap — à compléter avec vos contacts locaux et à tenir à disposition de " +
      "votre référent handicap et de vos équipes (Qualiopi indicateur 26).\n\n" +
      "AGEFIPH (Association de gestion du fonds pour l'insertion professionnelle des personnes handicapées) — " +
      "financements et appuis pour l'emploi et la formation en milieu ordinaire (secteur privé). agefiph.fr\n\n" +
      "FIPHFP (Fonds pour l'insertion des personnes handicapées dans la fonction publique) — équivalent Agefiph " +
      "pour le secteur public. fiphfp.fr\n\n" +
      "Cap emploi — réseau d'accompagnement vers et dans l'emploi des personnes handicapées, présent dans " +
      "chaque département. Cap emploi le plus proche : [À COMPLÉTER].\n\n" +
      "MDPH (Maison départementale des personnes handicapées) — reconnaissance des droits (RQTH notamment) et " +
      "orientation. MDPH du département : [À COMPLÉTER — coordonnées locales].\n\n" +
      "Pôle emploi / France Travail — référents handicap dédiés dans chaque agence pour l'accompagnement des " +
      "demandeurs d'emploi en situation de handicap.\n\n" +
      "Réseau Cheops (Coordination handicap et emploi des organismes de placement spécialisés) — fédère les " +
      "Cap emploi au niveau national. cheops-ops.org\n\n" +
      "Contact interne de l'organisme : le référent handicap désigné (voir fiche équipe) est le premier point " +
      "d'entrée pour toute demande d'aménagement, avant orientation vers l'un de ces partenaires si nécessaire.",
  },
];

// Upsert-by-title rather than create-only: these are Jalon's own authored
// rows (organizationId: null), never customer-edited (an org customizes its
// own fork instead — see ForkTemplateButton), so improving the wording here
// reaches every org's library view on the next seed run instead of needing a
// one-off manual DB fix.
//
// Blocks are replaced wholesale rather than diffed: they have no stable
// identity across seed runs (order + text is all there is), and these rows
// are ours to overwrite. An org's own fork is a separate row and is never
// touched.
export async function seedStarterTemplates(prisma: PrismaClient): Promise<number> {
  for (const template of STARTER_TEMPLATES) {
    const { blocks, ...templateData } = template;
    const existing = await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: template.category, title: template.title },
    });
    const row = existing
      ? await prisma.documentTemplate.update({ where: { id: existing.id }, data: templateData })
      : await prisma.documentTemplate.create({ data: { organizationId: null, ...templateData } });
    if (blocks) {
      await prisma.documentTemplateBlock.deleteMany({ where: { templateId: row.id } });
      if (blocks.length > 0) {
        await prisma.documentTemplateBlock.createMany({
          data: blocks.map((b, i) => ({
            templateId: row.id,
            order: i,
            bodyText: b.bodyText,
            conditions: b.conditions ?? Prisma.JsonNull,
          })),
        });
      }
    }
  }
  return STARTER_TEMPLATES.length;
}
