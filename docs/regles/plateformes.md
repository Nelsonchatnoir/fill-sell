# Plateformes : Depop, eBay, Leboncoin, Opla

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 11/10 nuit — Depop comme Opla (ex-L59-69)
- 11/10 midi — poids Leboncoin (remplacé) (ex-L105-112)
- 10/10 soir — champs eBay : l'IA remplit avant de demander (ex-L147-156)
- 10/10 nuit — eBay : un vêtement de mode ne part pas en sport (ex-L157-165)
- 09/10 nuit — Depop pour le seul compte de Nico (ex-L166-184)
- Sortie d'Opla / Depop pour tous (ex-L399-408)
- 09/10 soir — frais de port Depop (ex-L409-418)
- 09/10 soir — catégories interdites par Depop (ex-L419-429)
- 10/10 matin — republication automatique Depop (ex-L430-441)
- 16/10 soir — Leboncoin : comptes PRO (panneau des racines) et photos gratuites lues au dépôt
- 17/10 — eBay un seul état (plafond 0, retours refusés), Leboncoin pro au mur du paiement, Depop marque et configuration vendeur
- 17/10 soir — la marque de l'annonce fait foi (toutes plateformes)

<!-- ex-CLAUDE.md L59-69 : 11/10 nuit — Depop comme Opla -->
- **⛔ 11/10 nuit — DEPOP COMME OPLA** — rapport `docs/enquetes/depop-comme-opla-1110/RAPPORT.md` : ⛔ **jamais de
  file silencieuse** — trace `extension_postes[…].depop_acces` (gpj), « Autoriser Depop » posé par handler-watch
  (`_shared/acces-depop.js` : 15 min avec un poste sans accès, 1 h sans aucun poste autorisé, jamais si un poste
  du compte a l'accès), levé par gpj / l'extension / handler-watch ; bouton « Autoriser Depop » dans l'app ;
  ⛔ **le rayon Depop passe par le moteur** (`_shared/depop-rayon.js` v3 : feuilles officielles, libellés corrigés,
  resolve-categorie v14, garde-fous — vêtement jamais en chaussures, Enfants jamais sans indice, enfant ET adulte
  = question ; gpj ne sert jamais une publication Depop sans rayon du moteur, handler-watch recalcule) ; Depop
  **jamais pré-cochée** dans le lot ; connexion : « connecte-toi à Depop sur ton ordinateur ». 6 jobs Simon/Jake
  traités par la règle (5 rayons corrigés, 1 question) ; audit : 5 rayons faux, aucun parti. gpj **v239**, hw
  **v99**, ujs **v134**, rc **v14** ; OTA **2.9.85** ; extension inchangée ; parcours réel chez Nico PAS fait
  (aucune session fillsell.app dans le Chrome piloté).

<!-- ex-CLAUDE.md L105-112 : 11/10 midi — poids Leboncoin (remplacé) -->
- **(REMPLACÉ le 11/10 soir : poids FACULTATIF, ligne du lot de dix points) POIDS LEBONCOIN (11/10 midi, Louis)** — rapport
  `docs/enquetes/louis-poids-lot-1110/RAPPORT.md` : 9bdcfce (10/10 13:50, 2.9.75) avait rendu le poids du lot
  « facultatif » → 12 livres et 18 vêtements de Louis partis sans poids (Leboncoin : 100 g, S ; le lot de 19:44
  n'avait 500 g que par les fiches). Rétabli : lot = poids OBLIGATOIRE pour Leboncoin (une valeur pour le lot),
  « Confirmer » le demande si ni copie ni fiche n'en ont, get-pending-jobs **v234** ne sert JAMAIS une
  publication Leboncoin sans poids (needs_user « Poids du colis », réponse une fois pour le lot,
  `_shared/poids-leboncoin.js`) ; republication et Beebs inchangés. OTA **2.9.81**. Selftest
  `selftest:lot-poids-leboncoin`. Les 30 annonces parties : rien modifié chez Leboncoin (à corriger à la main).

<!-- ex-CLAUDE.md L147-156 : 10/10 soir — champs eBay : l'IA remplit avant de demander -->
- **⛔ CHAMPS eBay : L'IA REMPLIT AVANT DE DEMANDER (10/10 soir, cas Manon)** : lot de
  polaires importées de Vinted, 63862 « Manteaux, vestes » : `Style`/`Type` (FREE_TEXT, aucune
  entrée de la liste ne décrit une polaire) demandés → eBay abandonné. La seconde passe FREE_TEXT
  de la voie API (`remplirAspects`) manquait à la voie formulaire : `generate-listing` **v115**
  (`completerAspectsIA`, mode eBay seulement, première passe inchangée, seconde passe UN aspect par appel ; hors liste = mot LU dans
  le texte, sinon question) ; moteur : rien sur la liste d'une autre catégorie, une demande par
  aspect ET catégorie, appel raté retenté (`src/publication/moteur/aspectsEbayAuto.js`).
  Mesure `usage_logs` `ebay_aspects_ia`. ⛔ SELECTION_ONLY = liste seule ; colis jamais deviné.
  Enquête : `docs/enquetes/manon-ebay-aspects-1010/RAPPORT.md` (« gilet » → 177856 Cyclisme :
  corrigé le 10/10 nuit, ligne suivante). Selftests `ebay-aspects-seconde-passe`, `ebay-aspects-auto`.

<!-- ex-CLAUDE.md L157-165 : 10/10 nuit — eBay : un vêtement de mode ne part pas en sport -->
- **⛔ eBay : UN VÊTEMENT DE MODE NE PART PAS EN SPORT (10/10 nuit, Nico)** : « gilet » →
  Cyclisme › Gilets, « veste » → Cyclisme › Vestes, « sac » → Golf › Sacs, « basket » →
  Collections › Pins, « collier » → Animalerie › Colliers… étaient des feuilles EXACTES (sans
  IA). Règle (`src/utils/brancheSpecialiseeEbay.js`, eBay SEULEMENT) : un rayon « vêtement » de
  Sports (hors Vacances), Auto-moto, Bricolage, Animalerie, Collections n'est retenu que si le
  titre / la description / l'objet disent la spécialité (sous Sports : un sport nommé suffit) ;
  sinon icône, question ou suggestion eBay. ⛔ La question IA COMMUNE aux plateformes n'est
  jamais modifiée (écart après la réponse). 8 annonces déjà mal rangées (3 en ligne), RIEN modifié :
  `docs/enquetes/ebay-mode-hors-sport-1010/RAPPORT.md`. Selftest `branche-specialisee-ebay`.

<!-- ex-CLAUDE.md L166-184 : 09/10 nuit — Depop pour le seul compte de Nico -->
- **⛔ DEPOP POUR LE SEUL COMPTE DE NICO (09/10 nuit)** : base (mig 20261009020000,
  garde `depop_autorise` : drapeau `depop_ouvert` RESTÉ À 0 ou `beta_flags.depop` —
  Nico seul), moteur commun corrigé (9eab08f : « EUR » ≡ « EU », « Comme neuf » = très
  bon), serveur (gpj v224 : un job Depop ne va QU'au poste qui déclare `depop_acces`),
  extension **0.6.105** (hôte www.depop.com OPTIONNEL, « Autoriser Depop » ; zip
  `build/CWS-0.6.105-A-TELEVERSER/`), app (Depop « à venir », ouverte par
  `rpc depop_autorise`, fail-closed). ⛔ Toute liste de plateformes nomme Depop ou
  dit pourquoi (`selftest:depop-partout`) ; jamais de rayon Depop par libellé ;
  l'annonce « Scotch » 945704866 est CELLE DE NICO. Reprise :
  `docs/reprise/terminal-depop-0910.md` ; contrats réels : `docs/plateformes/depop/CARTOGRAPHIE.md` § 8.
  **09/10 fin de matinée** : `rapprochement` **v17** — l'identifiant d'un dépôt FillSell est
  rattaché AVANT le moteur v3 (prouvé en réel, motif `identifiant_avant_moteur`) ; mig
  **20261009100000 APPLIQUÉE** ; fiche en double 1791529881380 RÉPARÉE (inverse complet) ;
  mig **20261009110000 APPLIQUÉE** (GO nommé : sept déclencheurs retrait/relevé ouverts à
  Depop) ; get-pending-jobs **v227** (réponse « annonce partagée » tranchée = sortie de `choix`) ;
  **parcours réel VERT** (relevé, republication, retrait, croisé ; FIN relue : plus aucune
  annonce de test chez Depop, « Scotch » intacte) ; extension `02f9f67` (lecture Depop « réseau »
  reprise) prouvée en page, JAMAIS chargée, HORS du zip 0.6.105 (inchangé) ; **OTA 2.9.68 NON
  lancée** (dossier partagé sale + commits non poussés d'un autre terminal) ; push : Nico.

<!-- ex-CLAUDE.md L399-408 : Sortie d'Opla / Depop pour tous -->
- **Sortie d'Opla (Nico)** : BASCULE LE 10/10 à 00:00 Paris, interrupteur
  coin_config `opla_sortie_le` (0 = désactivée) ; avant, Opla comme avant ;
  après, plus aucune publication ni republication Opla, synchro gardée pour
  les comptes reliés (`_shared/opla-sortie.js`). **Même instant : Depop pour tous**
  (mig 20261009230000 : `depop_autorise` lit `opla_sortie_le` ; republication
  auto Depop ouverte) ; l'app ne la montre qu'à une extension ≥ 0.6.106
  (`src/utils/basculeOplaDepop.js`), le site bascule seul (`src/utils/siteAvecDepop.js`).
  (10/10 après-midi) Une copie Opla rédigée AVANT la bascule ne se repropose
  plus (écran « Confirmer » du stepper) : le moteur ne garde que les copies des
  plateformes que le compte voit (`src/publication/copiesProposees.js`).

<!-- ex-CLAUDE.md L409-418 : 09/10 soir — frais de port Depop -->
- **⛔ FRAIS DE PORT DEPOP (09/10 soir, Nico : zéro friction)** : en France Depop
  ne fournit aucune étiquette, le vendeur fixe le port (0 à 99,99 €) — jamais
  deviné. Prix par défaut dans Réglages › Expédition
  (`platform_settings.depop.frais_port_defaut`, fusion seulement) ; le stepper
  et le lot le pré-remplissent et le DEMANDENT avant l'envoi (lot : une fois) ;
  feuille « Envoi suivi en France » (tarifs officiels Colissimo 01/04/2026 et
  Mondial Relay 15/06/2026, `src/utils/envoiSuiviFrance.js`, à revoir au
  01/01/2027) ; gpj **v228** pose le défaut sur tout job Depop sans port, sinon
  une republication (annonce importée) passe en needs_user AVEC le champ, avant
  tout retrait (`_shared/port-depop.js`). Selftest `selftest:port-depop`.

<!-- ex-CLAUDE.md L419-429 : 09/10 soir — catégories interdites par Depop -->
- **⛔ CATÉGORIES INTERDITES PAR DEPOP (09/10 soir, Nico)** : UNE table,
  `_shared/depop-interdits.js` (icône de `detectObjectIcon` → règle + citation
  officielle, centre d'aide en-gb lu le 09/10 : électrique/électronique —
  « Items that use electrical power (including batteries and solar power) are
  not allowed » —, puériculture). Appareils photo et montres classiques
  autorisés ; aucune catégorie de mode bloquée (sauf ⏱️ montres connectées,
  nommées par Depop) ; ambigus NON bloqués (`DEPOP_A_VERIFIER` : jeux en
  disque, DVD, horloges…). App : case Depop grisée avec la phrase ; lot :
  exclus de Depop seulement, comptés avant l'envoi (`lot/ExclusDepop.jsx`) ;
  gpj **v230** : filet sur tout job Depop qui dépose → needs_user, jamais servi.
  Selftest `selftest:depop-interdits`.

<!-- ex-CLAUDE.md L430-441 : 10/10 matin — republication automatique Depop -->
- **⛔ REPUBLICATION AUTOMATIQUE DEPOP (10/10 matin, Nico)** : MÊME circuit que
  Vinted, Leboncoin, Beebs (balayage `republish_planifiee_sweep`, mêmes paliers,
  plafonds et quotas) ; app : ligne Depop dans « Republication automatique »
  seulement si l'app propose Depop au compte (`plateformesDuCompte`, extension
  ≥ 0.6.106), une plateforme active garde sa ligne ; gpj **v231** : les créneaux
  viennent de la liste DU SERVEUR (plus de liste en dur) ; une republication
  AUTO d'un article interdit par Depop est close sans question (annonce
  intacte, verdict `depop_interdit`) et l'article n'est plus jamais candidat
  (mig **20261010100000 APPLIQUÉE**, feu vert nommé : `<plateforme>_interdit`
  exclu des candidats). Preuve réelle chez Nico (job 7cd5edaf, parti seul au
  créneau, recréé, ancienne en 404, test retirée). Selftest
  `selftest:republication-auto-depop`.

## 16/10 soir — Leboncoin : comptes PRO et photos gratuites (règles du code du dépôt, lu le 16/10)

- **Le panneau des racines se reconnaît à ses racines, jamais à « Divers ».** Le sélecteur manuel de catégorie
  filtre l'arbre par type de compte (droits `private` / `pro` de chaque catégorie) ; « Divers » (id 37) n'a aucun
  droit pro : un compte PRO ne la voit jamais. L'ancien repère (« liste d'au moins 10 éléments qui contient
  Divers ») ne trouvait JAMAIS le panneau d'un pro → « Catégorie: panneau des racines introuvable » à chaque
  dépôt qui passait par le sélecteur manuel (PAUGUES, 9 dépôts le 15/10 ; MeMiniandMove le 21/09 — les deux
  seuls comptes touchés en 45 jours, deux comptes pro). Règle : `trouverPanneauRacinesLbc`
  (`content-scripts/leboncoin.js`) = la liste dont la plupart des éléments sont des racines connues (4 au moins),
  mise en page large ou étroite ; un chemin dont la racine est absente (pro + « Divers > Autres ») passe par les
  suggestions de Leboncoin (règle du 12/09, tracée `categorie_chemin_invalide`). Selftest
  `selftest:lbc-categorie-racines` (rejoue aussi l'ancien code : il échoue sur l'arbre d'un pro).
- **Photos : jamais plus que le gratuit, lu sur le formulaire AU DÉPÔT.** Au-delà, Leboncoin active son « Pack
  Photos supplémentaires » et n'offre plus que « Valider et payer ». Le nombre gratuit dépend de la catégorie ET
  du compte (`photosMinNumber` de la catégorie, sinon 3 pour un particulier, 5 pour un pro ; maximum payant
  `photosMaxNumber`) : l'extension n'a AUCUNE table. Elle lit la galerie avant tout envoi
  (`lireEmplacementsPhotosLbc` : libellé de la tuile d'ajout « Ajouter 20 photos » = tout gratuit, sinon les
  emplacements montrés, 10 au plus), deux lectures identiques (le pack de la catégorie arrive après elle), et
  n'envoie que les premières photos, dans l'ordre de la fiche ; illisible = 3 (le minimum de Leboncoin), dit dans
  les avertissements du dépôt ; le bilan part en `platform_fields.photos_lbc` `{gratuites, source, fiche, envoyees,
  at}` ; le pré-vol de recréation fait de même. Le plafond de l'APP (`LBC_FREE_PHOTO_QUOTA`, Divers > Autres = 3,
  posé à la création du job, et son encart) est laissé tel quel : c'est le filet des extensions d'avant (≤ 0.6.120,
  dont la version du Chrome Web Store) pendant la mise à jour ; avec une extension à jour il est redondant (elle
  lit 3 sur cette feuille). Le retirer quand `profiles.extension_build` des comptes actifs porte le correctif.
  Selftest `selftest:lbc-photos-gratuites`.
- **Le mur « Valider et payer » n'hérite jamais d'une question passée.** Le même écran finissait tantôt en
  `relancer`, tantôt en `champ_a_choisir` (23 dépôts d'un même compte le 14/10) : un `needsUserField` resté d'une
  question déjà tranchée faisait choisir `champ_a_choisir` au filet du serveur et rouvrait l'éditeur.
  `marquerAttenteUtilisateur` (`background.js`, `champsAttenteUtilisateur`) retire, pour les murs de
  `MURS_SANS_QUESTION` (`lbc_options_payant_seulement` seulement), les marqueurs de question (`needsUserField(s)`,
  `champs_a_completer`, `server_required_fields`, `needsUserBoucle`) et pose `needs_user_source = "relancer"` ; le
  motif reste `last_diagnostic.quoi` ; les autres attentes gardent l'écriture d'avant. Le mur survenu avec des
  photos dans le gratuit lu le dit (ce n'est pas le pack photos : forfait pro).

## 17/10 — eBay (un seul état du compte, retours), Leboncoin (compte pro au mur du paiement), Depop (marque, configuration vendeur)

Rapport : `docs/enquetes/dix-points-1710/RAPPORT.md` (points 1, 4, 5, 7, 9).

- **⛔ 17/10 — eBay : UN SEUL ÉTAT DU COMPTE, ET « PAS DE RETOUR » REFUSÉ PAR eBAY** — règle unique
  `supabase/functions/_shared/ebay-etat-compte.js` (`etatCompteEbay`), lue par l'app (carte du Stock, stepper, lot,
  Réglages › Compte eBay) et par le serveur (`_shared/ebay-voie.ts` → ebay-api-worker, handler-watch, ebay-account) :
  une politique est faite quand elle est RETENUE, jamais parce qu'elle existe chez eBay ; plafond de vente eBay
  (`seller_state.selling_limit`) à 0 en quantité OU en montant = jamais « prêt » (carte « eBay n'autorise pas encore
  ce compte à vendre » + Seller Hub ; le serveur parque avant tout appel, `ebay_a_finir.etape` plafond / vendeur /
  retours / parcours / conditions). Les lignes du relevé ne décident plus rien (Louis : Réglages « prêt », carte
  « 2 étapes », plafond 0/0). Refus 25002 `ReturnsAcceptedOption` (Fluxen, vendeur pro) : la politique de retours
  retenue est retirée (garde sur son id), job « compte à finir — retours » ré-armé par le circuit existant — FillSell
  ne choisit JAMAIS la politique à la place de la personne ; `creer_politique` met à jour la politique FillSell du
  même nom (PUT) au lieu de la recréer (les 3 essais « 30 jours » de Fluxen avaient échoué en 502 sur ce nom).
  Selftests `ebay-etat-unique`, `ebay-retours-obligatoires`.
- **⛔ 17/10 — Compte Leboncoin PRO au mur « Valider et payer » : une carte, un éclaireur, plus rien sur le mur.**
  DeadRoz, 14/10 : 26 murs et 5 dépôts passés, intercalés, avec les mêmes 10 photos. C'est le COMPTE, ni l'annonce
  ni le pack photos. Règle unique `_shared/lbc-forfait.js` : motif exact `last_diagnostic.quoi = lbc_options_payant_seulement` ;
  compte prouvé pro quand une erreur (courante ou archivée) d'un job Leboncoin porte `general_sales_condition`/`custom_ref` ;
  jamais un particulier. update-job-status : le mur n'hérite d'aucune question (toutes versions). get-pending-jobs :
  mur vu < 30 j sans publication passée depuis → publications et republications pas encore retirées retenues avant
  essai (needs_user, `forfait_lbc.retenue_le`, jamais un mur vu), un éclaireur à la fois. handler-watch : éclaireur
  (plus ancienne publication) au plus toutes les 12 h ; tout repart (45 s) dès qu'une publication passe après le
  dernier mur ; jamais soldé < 30 j. App : carte « Leboncoin : ton forfait pro » (« C'est fait » = un éclaireur).
  « ✋ Compléter » efface `needs_user_source = champ_a_choisir`. `selftest:lbc-forfait-pro`.
- **⛔ 17/10 — DEPOP : LA MARQUE N'EST JAMAIS UNE QUESTION, LA CONFIGURATION VENDEUR EST UN GESTE DE COMPTE**
  (Thibault, Romain, Héloïse ; rapport `docs/enquetes/dix-points-1710/RAPPORT.md` § 4-5). Marque
  (`_shared/marque-depop.js`, appliquée au dépôt par `content-scripts/depop.js` sur la liste vivante de Depop) :
  absence (« Autres », « Divers », « Sans »…) ou nom commun de vêtement (« Short », « T shirt »… ; jamais « gant »,
  « polo », « bob », « top ») → « Other » (`unbranded`) ; égalité EXACTE, casse, accents et espaces multiples ignorés,
  avec le nom ou l'identifiant d'UNE marque active → elle ; sinon « Other ». Jamais une autre marque, jamais une
  question ; le remplacement est dit (`depop_marque_other`). Extensions ≤ 0.6.122 (publications) : update-job-status
  et handler-watch (questions tranchées, règle 5) répondent « Sans marque » ; une question « Plusieurs marques… »
  attend le correctif `depop_marque_ambigue` (`BUILD_DEPOP_MARQUE`, build 0.6.123). Configuration vendeur
  (`_shared/vendeur-depop.js`, patron de `lbc-identite.js`) : motif `depop_vendeur_a_configurer` → source
  `depop_vendeur` et message unique ; get-pending-jobs ne sert plus aucune publication Depop du compte (retenue
  `vendeur_depop.retenue_le`, jamais un mur vu ; retraits jamais retenus ; éclaireur servi) ; UNE carte « À régler »
  (`EcranVendeurPlateforme`, « C'est fait ») ; reprise sur preuve (publication passée au-delà du contrôle vendeur
  depuis le dernier mur vu, ou sonde `extension_sessions.depop_vendeur`, 0.6.123), sinon éclaireur au barème ;
  jamais soldé à 72 h (moins de 30 j). Selftests `depop-marque`, `depop-vendeur-mur`.

## 17/10 soir — LA MARQUE DE L'ANNONCE FAIT FOI (toutes plateformes)

- **⛔ Consigne de Nico (17/10)** : « Chic Me » reste « Chic Me » ; jamais « Other » ni « sans marque » tant que la
  plateforme accepte de la poser ; une plateforme qui la refuse VRAIMENT se signale à Nico, on ne tranche pas. Rapport
  `docs/enquetes/marques-1710/RAPPORT.md`. Mesuré le 17/10 (formulaires, comptes de Nico, rien enregistré) : **Vinted
  accepte de nouveau une marque hors catalogue** (« Utiliser "X" comme marque », T-shirts et Encadrements ; absente
  chez patrick et Romain les 14-16/10 : l'offre varie, l'extension la lit à chaque dépôt), **eBay** oui (texte libre),
  **Depop, Leboncoin, Beebs non** (listes fermées, « Other » / « Autre »).
- **Jamais une autre marque** : une marque n'est jamais rapprochée d'une voisine par ses mots (« Daily paper » →
  « Paper », « Chicago Bulls » → « BULLS » mesurés sur eBay). App : `estChampMarque` (`src/publication/moteur/listes.js`)
  — présence = ok, écriture exacte de la liste si elle y est, sinon la marque telle quelle ; eBay FREE_TEXT jamais
  « invalide » ; SELECTION_ONLY = vrai refus, la personne choisit (`gardeAspectsEbay`, Marque `sansRapprochement`).
  Selftest `publication-moteur` [M]. Extension (prochaine version, feu vert de Nico) : Leboncoin et Beebs en égalité
  exacte sinon « Autre » (plus d'inclusion, plus de choix par IA dans la liste) ; Depop : égalité qui ignore espaces,
  tirets, points, apostrophes (jamais `&` ni `+`), plusieurs candidates → l'exacte, sinon « Other ».

## 18/10 — Leboncoin, compte PRO hors forfait : FillSell prépare le dépôt, la personne clique « Valider et payer » (décision de Nico)
- Remplace la règle du 17/10 (publications retenues + éclaireur toutes les 12 h) pour les postes qui ont la nouvelle
  extension ; l'ancienne règle reste telle quelle pour les postes d'avant (motif `lbc_options_payant_seulement`).
  Règle et motifs EXACTS : `supabase/functions/_shared/lbc-forfait.js`.
- PUBLICATION d'un compte prouvé PRO (preuve `general_sales_condition` / `custom_ref` sur ses jobs, dite à l'extension
  par `platform_fields.compte_pro` dans la réponse de get-pending-jobs, ou vue sur le formulaire) au mur « Valider et
  payer » : l'extension laisse le dépôt tel quel sur cet écran, ne clique JAMAIS le paiement, pose le motif
  `lbc_valider_et_payer` (needs_user, aucune tentative consommée, `attente_paiement.depuis`) ; le background détache
  l'onglet de la fenêtre de travail, le déplace dans la fenêtre de la personne et l'active (sans voler le focus), puis
  le surveille : page de confirmation (`/deposer-une-annonce/confirmation`) ou page de l'annonce → job `published`
  (`lbc_depot.preuve = paiement_utilisateur`, numéro lu sur la page s'il y est) ; onglet fermé → `onglet_ferme_le`.
  Un seul dépôt préparé par cycle de l'extension.
- UNE publication à la fois par compte (get-pending-jobs) : aucune tant qu'une attente de paiement est vivante (moins
  de 24 h, onglet ouvert) ou close SANS paiement (onglet fermé, 24 h passées) ; après un paiement, la plus ancienne
  publication retenue ou au mur revient en file toute seule ; les autres publications restent en file SANS écriture ;
  la publication que la personne a demandé de « Préparer à nouveau » (carte) passe toujours.
- REPUBLICATION pas encore retirée d'un compte pro au mur : retenue (needs_user, `MSG_FORFAIT_LBC_REPUBLICATION_RETENUE`)
  — un redépôt payant retirerait l'annonce en ligne ; elle repart quand une publication du compte passe SANS paiement.
  Un dépôt payé par la personne (`paiement_utilisateur`) ne lève jamais le mur (gpj, handler-watch).
- App : une carte « Leboncoin : ton forfait pro » par compte (`EcranForfaitLbc`), deux parcours ; état de plateforme
  « prête sur Leboncoin : clique « Valider et payer » dans l'onglet… » (`a_payer_lbc`). Un particulier ne voit aucune
  différence (son mur payant reste le pack photos, annonce par annonce).
- Garde-fous : aucun paiement par FillSell ; aucun redépôt automatique après un onglet fermé ; un compte non prouvé
  pro n'entre jamais ; le relevé Leboncoin d'un compte pro lit 0 annonce (route particulier) — les dépôts faits à la
  main par la personne ne sont pas vus par FillSell (cas DeadRoz, 14/10 : non vérifiable, rien redéposé d'office).
- Selftest : `lbc-forfait-pro` (§ 8).

## 18/10 — La vraie marque, toujours, partout (règle de Nico ; extension 0.6.124)
- La marque de la fiche part TELLE QUELLE sur toutes les plateformes. Comparaison tolérante UNIQUEMENT sur la casse, les
  espaces, la ponctuation et les accents (« Chic Me » = « ChicMe », « Grain de Blé » = « Grain de ble ») ; jamais une marque
  contenue ou voisine (« Chic » pour « Chic Me », « Bonobo » ≠ « Bonobos », « Paper » pour « Daily paper ») ; « & » et « + »
  comptent (H&M ≠ H&M+). Blocs `⟦marque-exacte⟧` de `leboncoin.js` et `beebs.js` ; `depopCleMarqueExacte` / `cleMarqueDepopCompacte`.
- Marque libre acceptée (Vinted « Utiliser "X" comme marque », eBay texte libre) : la marque exacte, inchangé.
- Liste fermée sans la marque (Depop, Leboncoin, Beebs) : « Other » / « Autre », plus la marque écrite UNE fois dans la
  description (« Marque : X »), pas de doublon si la description la nomme déjà (mot entier, ou plusieurs mots écrits
  collés) ; l'article est publié quand même. Jamais « Sans marque » pour une vraie marque. Leboncoin (Mode, menu à
  recherche) : « Autre » cherché à son tour ; Beebs : jamais l'IA pour une marque ; Depop : deux marques sous la même forme
  compacte → l'écriture exacte gagne, sinon « Other » (ambiguë).
- Selftests : `marques-exactes` (62, dix marques du protocole), `depop-marque` (forme compacte), `champs-lbc-etat-marque`.

## Règles (18/10 — eBay EAN, Leboncoin texte refusé)
- **eBay, EAN exigé** (25002, paramètre « EAN ») : l'EAN de la fiche s'il est lisible (EAN-8/13 à clé juste, ISBN-13),
  sinon **« Non applicable »** — le texte officiel d'eBay France pour un produit sans identifiant (developer.ebay.com,
  product identifier text). « Ne s'applique pas » vaut pour le MPN seulement : eBay l'a refusé pour l'EAN le 18/10.
  Une seule nouvelle publication (marque `ebay_api.ean_non_applicable.valeur`), puis la question EAN.
- **Leboncoin, texte refusé** (« mention d'un site », « règles de contenu ») : la copie Leboncoin retire les mentions
  de site (« instagram » ajouté le 18/10) ; un texte déjà refusé n'est jamais renvoyé (empreinte du texte servi) :
  une reprise si le texte servi a changé, sinon la question avec les mots exacts de Leboncoin. Fiche et marque jamais touchées.

## 18/10 soir — Depop, Leboncoin PRO (chantier « finition »)
- **Depop** : un slug contient « _ » (33 sur 37 chez thibault.andrieux) — toutes les lectures `/products/<slug>` prennent
  `[A-Za-z0-9_]` (serveur, SQL `identifiant_annonce_depuis_lien` / `annonce_id_depuis_url`, extension 0.6.128). Un
  retrait sans identifiant le retrouve seul : slug de son lien, puis slug et `depop_product_id` de son dépôt
  (`arme_par.depot`, même compte, même fiche) — jamais le titre (`_shared/depop-identifiant-retrait.js`).
- **Leboncoin PRO** : le formulaire PRO n'a pas la case livraison ; ses critères (poids du colis) arrivent tard — la sonde
  attend 15 s, la seconde passe tourne sans elle, et le verdict repose toute valeur du job présente dans la liste
  (extension 0.6.128). Un mur « paiement » vu lors d'un passage PRÉCÉDENT ne déclasse plus la question (update-job-status).

## ⛔ 22/10 — Opla : plus rien ; Depop : deux écritures de la même taille (rapport `docs/enquetes/cinq-points-2210/RAPPORT.md` § 3-4)
- Aucun job Opla ne naît plus : `armer_retrait_job_pour`, le filet de suppression et l'app n'arment plus de retrait Opla,
  `garde_opla_sortie_jobs` n'écrit pas un retrait Opla inséré (ancienne app) ; l'information « retire-la toi-même sur
  Opla » est posée UNE fois sur la copie (`platform_fields.opla_a_retirer`, `opla_copie_a_retirer_noter`) ; « C'est fait »
  la marque. Le moteur de rapprochement ne lit, n'importe ni ne rattache plus aucune annonce Opla orpheline.
  Migration `20261022100000` ; tout est borné par `opla_sortie_passee()`.
- Depop : pointure enfant nue (« 33 », « EUR 33 ») = « EU 33 » (grille 104) ; « EU n » = « n » sur les grilles EUR paires
  9 / 81 / 40 (jamais la 62 : W ambigu, question). get-pending-jobs pose la taille de la FICHE sur une copie Depop VIDE
  (publication seulement), traduite par `tailleDepop` ; le connecteur demande hors grille.
- (22/10 soir) **Une œuvre d'art n'est jamais un cosmétique** (`src/utils/oeuvreDArt.js`, miroir exact dans l'extension,
  selftest `oeuvre-d-art`) : type Maison, icône 🖼️, jamais refusée par Leboncoin ; Vinted : Peintures (3847) ou Affiches
  et reproductions (3849). Ne prend que le « Beauté » / l'icône de soin (jamais au-dessus d'un autre type).
- (22/10 soir) **Le rayon (genre) Beebs / Vinted à choisir est une question avec ses boutons** (`moteur/genreAChoisir.js`) :
  seuls les rayons qui résolvent une vraie catégorie ; posé seul quand c'est sûr, et dit ; tracé `genre_rayon`.

## 23/10 — eBay : toutes les photos, en pleine taille (Thierry ; rapport `docs/enquetes/lot-2210-soir/RAPPORT.md` § « 23/10 »)
- Une même photo eBay existe en 140 px (vignette de la liste), 400 px (GetItem, `$_1.JPG`) et en ORIGINAL
  (`i.ebayimg.com/images/g/<clé>/s-l1600.jpg`, ce que rend Browse) : `_shared/ebay-photos.js` prend toujours l'original,
  dans l'ordre de l'annonce, sans doublon (lectures GetItem et Browse, complétion des fiches en base : `ebay_cle_image`).
- La page eBay lue par l'extension (ld+json) ne donne que 5 photos : la lecture la plus riche l'emporte
  (`annonce_capture_complete_fiche`), et une fiche qui porte encore ce que la base lui a mis reçoit la lecture plus riche
  (`fiche_completer_photos_capture`, mode `lecture_plus_riche`, migration 20261023130000).
- Le relevé API lit d'abord le détail des annonces dont une publication attend (60 par relevé, 150 sur une demande de
  lecture d'origine, suite redemandée tant qu'il en reste) ; le rapatriement sert d'abord les fiches dont une tâche
  attend (handler-watch, 48 photos par passage).

## 24/10 — eBay, Depop (rapport `docs/enquetes/lot-2410/RAPPORT.md`)
- **Vêtement traditionnel → « Vêtements traditionnels, du monde »** (eBay 155240 et ses feuilles par région, relevées
  sur ebay.fr le 23/10 : 155253 Moyen-Orient, 155241 Afrique, 155242 Asie orientale, 155246 Asie du Sud, 155252
  Amérique latine, 163145 Europe) — `src/utils/vetementTraditionnel.js`, branché dans `resolutionPublication.js` pour
  eBay seul. Mots sûrs (djellaba, qamis, takchita, abaya, boubou, sari, hanbok, yukata, dirndl…) ; mots que la mode
  emprunte (caftan, kimono, kurta, poncho, kilt, pagne) seulement avec leur origine collée ; jamais un kimono d'art
  martial, jamais un objet (poupée, figurine, tissu) ; deux régions = rien. Rejeu 30 j : 1 changement (la djellaba de
  Sébastien), 4 vêtements bien rangés, 0 robe « caftan » de mode basculée.
- **Une annonce eBay arrêtée sur eBay n'est pas un refus** : si la veille a lu sa fin (`fin_ebay.fin`, aucune vente),
  la publication est close « arrêtée sur eBay le … — pas par FillSell », sans rouge (`trancher_publications_sans_lien`,
  migration `20261024140000`). Cas : jocabroc8, deux annonces que le vendeur a arrêtées 2 et 17 min après leur mise en
  ligne (« car elle comportait une erreur », pages eBay relues le 23/10).
- **Un dépôt sans lien dont l'article est en ligne ailleurs** (même fiche, ou compte FillSell relié) n'est jamais
  « Publication non confirmée » : clos sans rouge, comme dans `trancher_publications_sans_lien`
  (`fail_publish_without_listing_url` + `article_en_ligne_ailleurs`, migration `20261024140000`).
- **Depop : la présignature d'une photo se réessaie** (extension ≥ 0.6.132, `depopEnvoyerPhoto`) : un « Failed to
  fetch » (refus CORS intermittent, ≈ 5 % des photos) est repris 3 fois (1, 2,5 et 5 s) ; la création de l'annonce
  n'est jamais rejouée. Johan (tiblancdeshaut) : sa publication passera avec la 0.6.132.

## 24/10 matin — eBay vêtement traditionnel au serveur ; Leboncoin pro (rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 matin »)
- ⛔ **Un vêtement traditionnel ne part jamais en « Costumes »**, quel que soit le chemin (copie d'avant le 23/10,
  relance, remise en vente, catalogue Vinted, suggestion d'eBay) : `ebay-api-worker` (v95) joue la règle de l'app en
  tête de `resoudreCategorie`, avant toute suggestion d'eBay ; jamais sur un rayon choisi par la personne
  (`choix_humain`) ni sur un rayon déjà dans la branche 155240 (`_shared/ebay-rayon-traditionnel.js`, selftest
  `ebay-rayon-traditionnel`).
- **Corriger le rayon d'une annonce eBay en ligne** : eBay est hors republication (17/09) ; le circuit est le
  rangement par la règle d'aujourd'hui (`reviser_annonce`, mode `rayon_regle`, décision de Nico du 11/10) : lecture
  à blanc, sauvegarde `_backup_DDMM_ebay_*` (droit SELECT à service_role), écriture gardée par l'empreinte, relecture.
  Appel par la base : `net.http_post` avec `public.cron_secret()` (jamais écrit). Une table créée juste avant l'appel :
  `NOTIFY pgrst, 'reload schema'` d'abord, sinon « sauvegarde absente » (cache de l'API).
- **Leboncoin pro** : un dépôt sur un compte pro sans le circuit pro (extension < 0.6.123 : pas de `compte_pro`)
  n'est jamais mis en ligne par Leboncoin — recrutementgroupezk704, 14/10 : 5/5 avec la 0.6.110, puis 150 déposés et
  0 refusé avec la 0.6.128. Le motif exact d'un refus de modération n'existe que dans le mail de Leboncoin au vendeur.

## 24/10 nuit — eBay : l'état du rayon ; Leboncoin : le « Sans marque » du vendeur (rapport `docs/enquetes/lot-2410-nuit/RAPPORT.md`)
- **L'état est TOUJOURS rempli dans le brouillon eBay** (décision 4 de Nico) : l'URL de dépôt (chemin Chrome) ne pose
  plus 3000 partout — les rayons Livres et Jeux vidéo n'ont pas 3000 (1000/2750/4000/5000/6000, lu chez eBay) et eBay
  ignorait l'état (« — », mesuré sur un brouillon de Nico). Le poste (0.6.140, `poserConditionEbay`) demande au serveur les
  états du rayon (`fetch-ebay-aspects` v18, `{ conditions_category }`, Metadata eBay, lecture seule) et choisit dedans :
  l'état de la famille d'avant s'il est accepté (rien ne change là où ça marchait), sinon le plus fidèle (même table que
  la voie API, `PREFERENCES_ETAT`) ; serveur muet → la famille d'avant. Trace : `platform_fields.ebay_condition_choix`.
- **« Switch & Go » (VTech) n'est jamais la console** : jouet 🦸 (shared.js, jeuxVideo.js) — la fiche de sos.cuisine
  partait en « Jeux » eBay avec « Plateforme : Nintendo Switch ».
- **Leboncoin — « Sans marque » déclaré par le vendeur n'est jamais remplacé par une marque de l'IA** (décision 3 de
  Nico, insert Zombicide de louis refusé par la modération) : la fiche « Sans marque » gagne sur chaque copie
  (`sansMarqueDeLaFiche`, aux trois arrivées de l'écran Publier) ; plus de « Autre » + « Marque : <éditeur> » pour un
  accessoire non officiel. Non tranché : `toy_type` de l'IA posé par-dessus le pré-rempli précis de Leboncoin.
- Preuves : `selftest:lot-2410-soir` § 1, 2, 5 ; `selftest:jeux-video` (corpus +5).

## 24/10 nuit (clôture) — Leboncoin : le pré-rempli précis de Leboncoin bat l'IA ; « Switch & Go » en Jeux & Jouets
- **Une valeur devinée par l'IA n'écrase jamais un pré-rempli précis de Leboncoin** (décision 3 de Nico, insert Zombicide
  de louis : « Jeux de société » remplacé par « Loisirs créatifs ») : l'app marque chaque valeur d'une passe IA
  (`platform_fields.lbcAspectsOrigine[clé] = « ia »`, « dedie:lbcProduit » pour le champ dédié ; toute autre écriture
  efface la marque, src/utils/origineLbc.js) ; l'extension 0.6.141 (`fillCriterionSafe`, `origineIa`) garde alors le
  pré-rempli de Leboncoin. La valeur du vendeur (texte, réponse, annonce d'origine rejouée) garde la main ; marque : règle
  à part. Une valeur précise jamais pré-remplie part comme avant.
- **« Switch & Go » (VTech) → Leboncoin « Loisirs > Jeux & Jouets »** (même règle que eBay, icône 🦸).
- **Beebs Bijoux (femme) : « Taille » est OBLIGATOIRE** (relevé DOM 11/10) → la question reste (décision 5 de Nico).


## 25/10 nuit — Beebs : cycle de dépôts entier, copie réalignée sur le relevé, rayon de la famille ; Leboncoin : « EU N » = « N » (rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 1c et 5)
- Beebs, dépôts coupés d'un même cycle (Ciddjy, 20/10) : `jugerCycleDepots` (`_shared/depot-sans-numero.js`) — photos pour
  tous les dépôts du cycle, rattachements d'abord, puis le reste ; plus jamais une question qui cite les annonces d'AUTRES
  fiches rattachées dans la même seconde.
- Beebs, lien et copie contradictoires (Glowik 6d95f4eb) : get-pending-jobs réaligne la copie quand le relevé le prouve
  (annonce mise en ligne par CE job, l'ancienne datée disparue), sinon arrêt avant retrait au message vrai ; l'extension dit
  la vraie cause de son abstention.
- Beebs, rayon : une famille maison (Lens `maison_deco`) filtre les feuilles candidates du mot ; jamais un repli sur les
  jouets (`familleFiltreDesCandidates` ; sebbastien1 « poisson bois gravé » → « Décorations murales »).
- Leboncoin (et Beebs « Pointure », Vinted chaussures) : sur un champ de pointure SEULEMENT, « EU N » est l'option « N »
  nue (`estChampPointure` / `pointureNuePourEu`, `src/publication/moteur/listes.js`) — jamais UK/US, jamais une
  demi-pointure arrondie, jamais une taille de vêtement (régression du 28/09, Marta « EU 37.5 » ; selftest
  `pointure-eu-nue`).
- eBay voie clic (Fleur de Lotus, 22-23/10), NON codé : l'extension ne vérifie pas qu'eBay a reçu les photos avant de
  cliquer ; un refus de brouillon qui nomme l'élément manquant tombe en « motif inconnu » ; le mur « inscription vendeur »
  n'est pas étendu aux autres jobs du compte. À traiter (R1-R3 du rapport).

## 25/10 matin — Leboncoin réservé à la France, eBay hors France clos, Depop « EU N », Beebs, eBay (rapport `docs/enquetes/matin-2510/RAPPORT.md`)
- **Leboncoin seulement pour une adresse en France (décision de Nico, Marta / Rapallo)** : le code postal de l'adresse
  de remise doit être dans la base officielle (`_shared/codes-postaux-fr.js`, 6 310 codes, `npm run gen:codes-postaux-fr`
  le régénère) ; hors base → Leboncoin n'est plus proposé (app : `plateformesDuCompte(ouvertes, fermees)`, stepper,
  lot, Stock, Réglages, Lens, entrée), ni servi ni tenté (get-pending-jobs clôt ses publications/republications en
  `cancelled` + marque `lbc_hors_france`, message vrai, jamais `arret_utilisateur`) ; suivi de lot : état neutre
  « réservé à la France ». Sans adresse : rien ne change. Leboncoin SEUL (Beebs inchangé).
- **eBay hors d'eBay France** : ebay-api-worker clôt (message du site) au lieu d'une pause éternelle ; l'app grise eBay.
  **Plateforme écartée par la personne** : ses publications ne sont plus servies (laissées telles quelles).
- **Depop « EU N »** (OBSERVÉ le 25/10 : le filtre de recherche déclare « EUR » chaque grille de la région IT ; menu
  des bas femme = 24…34 tours de taille puis 36…48 paires) : « EU N » = « N » aussi sur les grilles 32, 98 et 24 (hors
  24…34) — connecteur seul (`depopTailleEquivalente`), après l'exacte et le moteur commun : le point G du 28/09 reste
  entier ailleurs ; 56 et 62 inchangées (question).
- **Beebs** : la republication reprend le rayon affiché par l'annonce (fil d'Ariane ld+json) quand la copie n'en a pas
  (chaouidz : « Mode › Garçon › Chaussures (garçon) › Baskets (garçon) », observé) ; message vrai « rayon absent de la
  copie » ; retrait : page 404 sans fiche + absente de « en vérification » lue en entier, deux constats à ≥ 6 h →
  absence prouvée malgré l'index (boncoin59300 : page 404 observée) ; retrait d'une annonce en vérification > 72 h
  (DeadRoz, aucun geste possible chez Beebs — observé sur le compte de Nico) : message daté vrai, servi toutes les 12 h ;
  refus de la vérification Beebs prouvé à 7 jours (`_shared/beebs-sortie-verification.js`, 18 annonces mises en ligne
  48 à 126 h après leur sortie de vérification : jamais avant).
- **eBay** : la Taille est une liste FERMÉE pour l'IA (24 valeurs fausses en 30 j) ; un refus de brouillon qui nomme
  « retours » → question au niveau du compte, « Photos » → 2 reprises puis arrêt nommé ; compte non vendeur → les autres
  dépôts voie clic du compte attendent (un seul éclaireur). Photos (OBSERVÉ le 25/10 sur un brouillon de test du compte
  de Nico : le geste de l'extension marche, la preuve de réception est le compteur « N/25 » et la vignette
  i.ebayimg.com) : mesure en mode « observer » dans la 0.6.143 (interrupteur `coin_config.ebay_photos_recues_bloquant`).

## ⛔ 25/10 soir — Leboncoin réservé à la France DÈS LA CRÉATION du job (migration `20261025181500`, appliquée à 18:08:28)
- `spend_coins_and_publish` refuse une publication Leboncoin d'un compte dont l'adresse de remise est hors de France, comme
  une plateforme en pause (`platform_paused`, motif `lbc_hors_france`, message de Nico) : rien créé, rien décompté, toutes
  versions de l'app (l'app 2.9.115+ ne le propose déjà plus). Verdict : `lbc_adresse_hors_france(uuid)` = celui de
  `_shared/lbc-adresse-france.js` (code postal, sinon le dernier nombre de 5 chiffres de l'adresse ; pas d'adresse ou code
  illisible → France, jamais retiré sur un doute) contre `codes_postaux_fr` (6 310 codes, outre-mer compris).
- Essai annulé avant application : Marta (Italie) refusée, son Vinted et le Leboncoin de Nico non touchés ; 2 comptes hors
  de France au 25/10 (Belgique, Italie). Inverse : `supabase/rollbacks/20261025181500_lbc_hors_france_creation_INVERSE.sql`.

## ⛔ 26/10 — Leboncoin : le pré-rempli départagé (jamais un blocage) ; poids et couleur (rapport `docs/enquetes/lenteur-2610/RAPPORT.md` § 4-5)
- Remplace la règle du 24/10 nuit « le pré-rempli bat l'IA » (cause d'origine jamais prouvée ; 6 cas : nous 3, Leboncoin 2,
  les deux 1, 1 blocage — le pot à sucre de Jocabroc). `leboncoin.js` ⟦prerempli-ia⟧ `departagerPreRempliIa` : 1. jamais un
  blocage (liste Produit sous le Type pré-rempli sans notre Produit ni « Autre », Produit non pré-rempli → notre paire) ;
  2. la valeur que l'article nomme (mot propre, pluriel/féminin) ; 3. sinon le pré-rempli reste. Paires Type → Produit =
  `src/utils/lbcMaisonJardin.js`. Relance : `correctifs-extension` « lbc_prerempli_ia_blocage » (BUILD_LBC_PREREMPLI_IA).
- « estimated_parcel_weight : contrôle introuvable » était FAUX en particulier (pas de critère, le poids passe par la
  livraison) : plus noté ; le formulaire PRO garde sa seconde passe.
- Couleur : une couleur ÉCRITE dans le titre (puis la 1re phrase) gagne toujours (`_shared/couleur-du-texte.js`, servie par
  get-pending-jobs aux publications Leboncoin) ; jamais une couleur de décor ; deux couleurs → rien ; une réponse de la
  personne n'est jamais remplacée.

## 29/10 — lot A stabilité (rapport `docs/enquetes/lot-a-stabilite-2910/RAPPORT.md`)
- **Leboncoin, critères rendus tard** (thecloset72000, 2 jeans, 9 essais) : un job qui PORTE des critères attend leur
  rendu 15 s (comme le formulaire PRO), et la seconde passe joue aussi sur un formulaire de particulier quand la sonde est
  muette ; un wizard qui n'avance pas dit sa page (titres, critères, boutons) dans le motif (`pageWizardLbc`).
- **Leboncoin, session fermée** : « Mes annonces n'a pas rendu sa liste » + jeton non renouvelé (session_fermee),
  adresse renvoyée vers la connexion ou formulaire de connexion = le mur de connexion (« Connecte-toi »), jamais un
  échec anonyme ; un relevé incomplet ne date jamais rien « disparu ».
- **Beebs, refus de vérification** : un refus (`refus_verification_beebs`) vaut pour SON numéro ; un numéro refusé n'est
  jamais une remise en ligne « finie » (`_shared/republication-finie.js`). Un retrait sans numéro sur un dépôt Beebs de
  plus de 7 jours passe par le juge des relevés ; une attente inchangée n'est réécrite qu'une fois toutes les 6 h.

## 29/10 soir — clôture du lot A (rapport `docs/enquetes/lot-a-cloture-2910/RAPPORT.md`)
- ⛔ **eBay, modes d'envoi** : la liste vient de l'API Metadata `getShippingServices`
  (`GET /sell/metadata/v1/shipping/marketplace/EBAY_FR/get_shipping_services`, jeton APPLICATIF api_scope,
  `_shared/ebay-app-token.ts`), plus de GeteBayDetails (retiré par eBay le 15/03/2027). Repli sur GeteBayDetails
  (jeton du vendeur) journalisé `[ebay-shipping] repli` tant qu'eBay le sert ; tant qu'il vit, chaque remplissage du cache
  (1 h par isolat) compare les deux listes et journalise `comparaison … IDENTIQUES|DIFFÉRENTES`. Le code texte du service
  fait foi (le numéro ShippingServiceID n'existe plus). Les publications ne lisent jamais cette liste (elles portent la
  politique déjà posée). Selftest `ebay-modes-envoi-metadata`.
- **Leboncoin, relevé** : un résultat VIDE de la lecture de « Mes annonces » (document remplacé pendant l'attente du
  compteur, renvoi vers la connexion en cours) n'est jamais « liste rendue » ; l'adresse de l'onglet est relue toutes les
  500 ms pendant 5 s. La porte de connexion (auth.leboncoin.fr, /connexion, /login) n'est retenue que vue DEUX fois à plus
  d'1 s d'écart — au renouvellement du jeton (« session_fermee [lieu] ») comme après la lecture ; un passage éclair n'est
  pas une session fermée. Le libellé « « Mes annonces » n'a pas rendu sa liste » reste mot pour mot (lu par le serveur) ;
  la page quittée et son état s'y ajoutent. Selftest `lbc-jeton-releve`.
- **Beebs, logo** : nouveau logo (fond jaune #FAE368, « B » noir, badge Kiabi), relevé sur l'App Store le 29/10
  (`BeebsIcon.jsx`, `platform-logos/source/beebs-icon.png`, `chrome-extension/assets/beebs.png`, mails
  `public/email/logo-beebs-2910.png`). ⛔ Une image de fillsell.app change de NOM quand elle change de contenu
  (`vercel.json` : images « immutable » un an) ; l'ancien fichier reste pour les mails déjà envoyés. Le CDN de Beebs
  (cdn.beebs.app) sert encore l'ancien logo : ne rien y prendre. Captures du site : un logo seul se remplace au pixel près
  (même place, même taille, coins 28 %) ; un logo EMPILÉ (pastilles qui se chevauchent) se refait par
  `scripts/apercu/site-capture.mjs <clé>` ; puis `site:images`. Vidéo du site : `docs/seo/briefs/video-variante-site`
  (preparer → patch → logo remplacé dans `public/logos/` du dossier de travail, jamais dans fillsell-video → rendu.cjs A et
  B → encoder.sh → video-json.mjs A).
- ⛔ **Leboncoin, compte PRO prouvé aussi par son TYPE** (paugues.contact, 29/10) : `account/v2/members/me/account` →
  `account.type` « individual » = particulier, tout autre type (« business »…) = PRO. Le formulaire pro
  (`general_sales_condition`, `custom_ref`) n'apparaît pas dans tous les rayons (Maison > Décoration, Loisirs >
  Antiquités) : la preuve par les jobs ne suffit pas. Preuve serveur : `comptesLbcProParType` (`_shared/lbc-forfait.js`,
  usage_logs `releve_ventes` motif `compte_non_individual_<type>`, 30 jours) dans get-pending-jobs (compte_pro servi,
  retenue au mur) et handler-watch (carte, éclaireur) ; preuve de l'extension (≥ 0.6.155) : type lu au mur, noté
  `lbc_depot.type_compte`, circuit pro (`lbc_valider_et_payer`). Un compte pro hors forfait paie chaque dépôt (aide
  Leboncoin « Combien coûte le dépôt d'une annonce ? » : dépôt payant pour un pro en Maison, Loisirs, Multimédia…),
  quel que soit le nombre d'annonces en ligne ; FillSell ne paie jamais et ne relance jamais sur ce mur.

## 29/10 (lot B) — Leboncoin : la marque par la recherche ; le compte pro lu sur la session qui dépose ; Vinted en langue étrangère ; Beebs : un refus ne se relance pas à l'identique
- **Marque Leboncoin** (4.4, boncoin59300) : le champ Marque est une RECHERCHE (menu vide tant qu'on ne tape pas). Quand
  le pré-rempli de Leboncoin diffère de notre marque, on TAPE la nôtre (`decisionMarqueRechercheLbc`, `marquesEgales`) ;
  sinon, si le pré-rempli n'est pas cité dans l'article, « Autre » (la marque reste dans la description) ; le pré-rempli
  n'est gardé qu'en dernier ; « hors liste » ne s'écrit qu'après une recherche RELUE (sinon « recherche muette »).
  ⚠ Mesuré : 594 recherches par frappe depuis le 07/09, 0 trouvée — un diagnostic du menu est désormais noté.
- **Compte pro au mur « Valider et payer »** (partie 3) : l'extension lit TOUJOURS le type de la session qui dépose
  (`account/v2/members/me/account`) ; une lecture `individual` l'emporte sur la preuve du serveur et sur le formulaire pro
  (`decisionMurProLbc`) ; `lbc_depot.type_compte`, `type_compte_lu_le`, `type_compte_source` sur les deux parcours.
- **Vinted, page dans une autre langue** (4.1, mele.marta) : la langue se juge sur les racines du catalogue (3 racines
  d'une même langue ≠ fr) ; catalog_id connu → pose par identifiants avant toute question ; jamais « Vinted ne propose
  pas » sur une page étrangère ; une question de racines étrangères n'est pas un rayon refusé ; relance unique
  « vinted_categorie_page_etrangere » au build 0.6.153+ (`relance-apres-maj.js`), pause neutre en attendant.
- **Beebs, refus prouvé** (4.6, XEWER) : `empreinte_contenu` (titre, description, photos, rayon) posée au refus ;
  relancer à l'identique → needs_user `refus_beebs_meme_contenu` (« Change d'abord le texte, les photos ou le rayon »),
  jamais redéposé. Constat (non une cause prouvée) : 0/87 en ligne avec « Jeu testé aujourd'hui, le … et fonctionnel »,
  35/42 sans. Jeux vidéo : « xbox » seul n'est plus Beebs « Xbox Series » (Xbox originale → Retrogaming).
