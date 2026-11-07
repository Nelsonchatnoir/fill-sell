# Plateformes : Depop, eBay, Leboncoin, Opla

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 04/11 soir — Depop : refus « PayPal à relier » (1216) = mur du compte ; eBay : annonces API non modifiables sur eBay (en fin de fichier)
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
  **Corrigé le 29/10 nuit (0.6.157), essai réel 3297848873 sur le compte de Nico** : la frappe VIDE le champ et la
  recherche est restée muette (menu « 1 enfant, texte vide ») → « Nike » effacé, annonce partie SANS marque (la 0.6.155
  gardait « Nike »). Règle : un pré-rempli que l'article NOMME n'est jamais tapé par-dessus (gardé, aucune frappe) ; un
  pré-rempli que l'article ne nomme pas (marque devinée, règle P8 du 15/10) n'est gardé que si une recherche qui a
  répondu ne trouve ni notre marque ni « Autre » — recherche muette → champ vide, jamais la marque devinée. Le
  diagnostic dit aussi l'état de l'onglet (`visibilityState`). RESTE : faire répondre la recherche (piste non prouvée :
  liste virtualisée non dessinée dans un onglet en arrière-plan).
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

## 29/10 (lot C partie 4) — Leboncoin : la marque posée par son IDENTIFIANT
- Prouvé le 29/10 (compte de Nico, onglet visible, dépôt quitté sans brouillon) : le champ Marque est une combobox Spark
  dont la liste ENTIÈRE est dans la page (1 503 marques en Mode : `answerChoiceIdentifier` / `answerChoiceLabel` dans
  `questionDefinition`), filtrée côté page (aucun appel réseau à la frappe) et jamais dessinée dans la fenêtre de travail
  minimisée — d'où « la recherche ne répond jamais » (0 sur 601). La pose se fait par le gestionnaire du composant
  (`onValueChange(id)`), lu et appelé dans le monde MAIN (`LBC_MAIN`, `listerChoixCritere` / `poserChoixCritere`).
- La décision reste `decisionMarqueRechercheLbc` (notre marque exacte, sinon « Autre » + marque dans la description) ;
  un pré-rempli que l'article nomme reste (règle du 29/10) ; liste illisible ou pose non relue → la voie d'avant (frappe).
- Essai réel : dépôt 3297910134 (999 €, titre sans marque) → « Zara posée par son identifiant (zara, liste de 1 503
  marques, formulaire zara) », page publique « Marque : Zara », retiré. Selftest `champs-lbc-etat-marque` § 7.
## 30/10 (lot E, thecloset72000) — Leboncoin : nouvelle page de dépôt et ville ; eBay : caractéristiques et modification ; genre
- **Photos gratuites Leboncoin, nouvelle page** (« Dites-nous en plus sur votre article », composant
  `dynamic-deposit-input-photo-v2`, relevée le 30/10 sur le compte de Nico) : plus de tuile « Ajouter N photos » ni de
  case d'emplacement avant envoi, une zone « Cliquez et déposez jusqu'à N photos » (N = le gratuit ; avec un pack payant :
  « Cliquez et ajoutez des photos », sans chiffre — code de la page : `maxPhotos = max(basicPhotoLimit,
  maxPackPhotoLimit)`, `hasExtraPhotosOffer`). L'ancienne lecture rendait « illisible » et la lecture « stable » acceptait
  deux « illisible » de suite → repli silencieux à 3 photos : 203 dépôts amputés du 20/10 16:42 au 30/10, 19 comptes
  (192 encore en ligne le 30/10, 524 photos manquantes). Règle (`leboncoin.js`, 0.6.160) : le nombre se lit d'abord dans
  la page (`packPhotoConfig.basicPhotoLimit`, propriété React du composant photos, monde MAIN —
  `LBC_MAIN_FONCTIONS.lireQuotaPhotos`), puis sur les libellés des deux pages ; seule une lecture CHIFFRÉE est stable
  (12 essais, ~8 s) ; vraiment illisible et plus de 3 photos sur la fiche → RIEN ne part, le dépôt est quitté sans
  enregistrer, attente `lbc_photos_quota_illisible` (relancer), phrase dans l'app. Jamais d'annonce amputée en silence.
  Selftest `selftest:lbc-photos-gratuites` (§ 1, 3, 7). Remise à niveau des annonces déjà en ligne : PROPOSÉE, non
  exécutée (`scripts/reparations/20261030_lbc_photos_amputees_PROPOSITION.sql`).
- **Ville de l'annonce Leboncoin** : réglage par défaut `platform_settings.leboncoin.ville_publication` = { code_postal,
  ville } (Réglages › Expédition ; absent = la ville de l'adresse, comme avant), changeable sur la carte Leboncoin à la
  publication (`platform_fields.ville_publication_lbc`, ou « adresse »). Règle `src/publication/villeLbc.js` ;
  l'extension localise alors l'annonce à la COMMUNE (« ville code_postal », repli commune du barreau 3) ; une
  republication garde la localisation d'origine. `pf.adresse` reste réécrite par get-pending-jobs / le background
  (adresse des Réglages) : la ville choisie vit dans une autre clé.
- **eBay, caractéristiques** (`_shared/ebay-publication.ts`, `assemblerAspects`) : un aspect FACULTATIF part quand sa
  valeur est CONNUE (fiche, analyse photo — `attributs_visibles` lus : saison, coupe, pointure, matériau, référence —,
  rayon), recalé sur la liste eBay ; liste fermée sans correspondance = rien ; jamais un défaut, jamais l'IA, jamais une
  question (avant : seuls les aspects obligatoires partaient). Le Département vient du rayon genré (« Femme : vêtements »)
  avant le genre ; un Département contraire au rayon est recalé.
- **eBay, modification d'une annonce en ligne** : une annonce publiée par l'Inventory API ne se modifie PAS dans Seller
  Hub (règle d'eBay) — elle se modifie depuis FillSell (Stock › menu de l'article › « Modifier sur eBay », titre,
  description, prix). `ebay-account` action `modifier_annonce` → `_shared/ebay-modifier-annonce.ts` : offre et article
  relus en entier, seuls les champs demandés réécrits (PUT inventory_item puis PUT offer : eBay révise EN PLACE, même
  numéro), un champ inconnu = rien n'est écrit ; la tâche suit (title, description, price, `modifications_ebay`).
- **Genre écrit dans l'article** (`_shared/genre-du-texte.js`) : un seul genre adulte nommé dans le titre (puis titre +
  description) remplace un Homme/Femme DEVINÉ contraire sur toutes les copies avant la résolution des rayons (app,
  `resoudrePublication`) ; le moteur Depop n'en compte plus le genre deviné contre le texte (`indicesAgeGenre`).
  Cas : « Lee … Femme Jean » sorti en « Homme » partout (rédaction « tranche toujours »), Hommes > Jeans proposé sur
  Vinted, eBay, Beebs, Depop.
- **Matière d'un vêtement = l'étiquette** (`_shared/composition-matieres.js`) : l'analyse photo ne donne la matière d'un
  vêtement que si une étiquette de composition est LUE (jamais « Denim » pour un jean) ; la rédaction ne la déduit
  jamais du type d'article ; une composition part en matières dans l'ordre de l'étiquette : Vinted les coche (3 au plus,
  `fields.matieres`, 0.6.160), Leboncoin / Beebs / Opla / eBay prennent la première (la plus forte part).

## 30/10 soir — lot E finition et urgence Louis (`docs/enquetes/lot-e-3010/RAPPORT.md` § Finition, `docs/enquetes/louis-lbc-restreint-3010/RAPPORT.md`)

- **Leboncoin restreint l'accès d'un compte** (`_shared/blocage-leboncoin.js`) : au premier signe (« accès temporairement
  restreint », « robot sur le même réseau », HTTP 403, DataDome) lu au dépôt, aux relevés ou à la veille des commandes,
  `platform_settings.leboncoin.blocage_acces` est posé : plus AUCUNE action ni lecture Leboncoin du compte (serveur et
  extension 0.6.161), un message qui nomme le navigateur, un seul essai par jour (24 h, ou « Leboncoin remarche »), un
  essai refusé re-pose la pause (jamais de boucle), un essai réussi = reprise prudente (6 h, 10 min entre deux tâches).
- **Une machine virtuelle ne fait jamais Leboncoin** (`_shared/poste-virtuel.js`) : l'extension 0.6.161 envoie le moteur
  de rendu du poste ; un pilote graphique qui NOMME la machine virtuelle (VMware, VirtualBox, Parallels, QXL, virgl,
  Virtio, Hyper-V, Red Hat, Bochs) → les tâches Leboncoin du compte attendent un vrai poste du compte. Rendu logiciel
  seul (SwiftShader, llvmpipe) : noté, jamais bloquant. ⛔ Le poste Cloud a ses propres règles.
  ⛔ (02/11, Dayane) « Microsoft Basic Render Driver » SEUL n'est pas une machine virtuelle (pilote de secours de
  Windows : vrai PC sans pilote graphique, bureau à distance) — noté `pilote_de_base`, jamais bloquant. Une plateforme
  ne se bloque que sur un signal SÛR de virtualisation. Le message « machine virtuelle » s'efface des tâches Leboncoin
  servies à un poste réel (archivé). La délégation Leboncoin (louis-seller) ne dépend pas de ce signal.
- **Leboncoin refuse automatiquement une annonce « similaire à une annonce déjà en ligne »** (essai du 30/10 à 20:21 :
  12 photos de deux t-shirts déjà en vente → mail « refusée » à la seconde du dépôt) : la page de confirmation s'affiche
  quand même, le tableau de bord de Leboncoin ne liste pas les annonces refusées, la page « Corriger l'annonce » ne dit
  rien. FillSell ne voit qu'une absence aux relevés ; le motif est dans le mail de Leboncoin à la personne. ⛔ Un essai
  Leboncoin se fait avec des photos jamais publiées sur le compte.
- **adsubmit 2xx puis canal coupé** (0.6.161) : publié seulement si l'onglet est sur la page de confirmation ou sur
  l'annonce ; sinon la tâche reste en attente « dépôt non finalisé » (jamais « publié » sur une réponse seule) ; adresse
  illisible = question « incertain ».
- **Depop, matière** : la matière de la fiche (ou la composition de l'étiquette) part dans `attributes.material` (format
  relevé sur le formulaire de Depop le 30/10), 4 au plus, identifiants actifs seulement, sur les 84 types qui l'acceptent
  (jamais une robe, un bijou, une montre) ; source : copie Depop, valeur commune des autres copies, fiche
  (`champsDepop` → `depopMatieres`, `depopMatieresDuJob`). Selftest `depop-matiere`.
- **Vinted, accessoires** : sous « Accessoires de mode » (arbre servi à CERTAINS comptes, `_shared/vinted-catalogue-comptes.js`),
  la Taille n'apparaît qu'après « Pour qui ? » (Femmes 576, Hommes 575) : l'extension pose « Pour qui ? » avant la
  taille ; « Taille unique » (1435) s'y trouve.
- **Messages qui nomment le navigateur** (`_shared/navigateur-poste.js`, `nommerLeNavigateur`) : « dans Brave », « dans
  Edge »… selon le navigateur déclaré par le poste (Brave reconnu par `navigator.brave`), jamais « Chrome » d'office.

## 31/10 soir (lot I) — Leboncoin : critères rendus tard sur « Dites-nous en plus sur votre article »
- Signature : juste après « La photo n° N a bien été ajoutée », la page n'a AUCUN `label[for]` (critères []), État
  introuvable, « Le wizard n'est pas passé à l'aperçu » (Ornella 5/5, Srideals passé au 2e essai, Jocabroc au 5e ; les
  mêmes rayons passent ailleurs). Extension 0.6.163 : si le job porte des critères et que la page n'en montre aucun,
  attente prolongée de 30 s au plus (bas du formulaire ramené à l'écran), puis l'état de la page est noté
  (`indicesChargementLbc` : visibilité, éléments occupés, barres, squelettes, photos). Jamais pour un rayon sans critère.

## 31/10 soir (lot J) — Leboncoin : pause levée, pause remise ; adresse de republication ; eBay hors de France
- **Essai prudent réussi = les ventes Leboncoin de nouveau surveillées** (`_shared/blocage-leboncoin.js`,
  `lecturesExtensionEnPause`) : en reprise prudente (6 h après la levée), get-pending-jobs ne dit plus rien à l'extension
  (`blocages.leboncoin` absent = libre pour toutes les versions) : veille des commandes, relevé des ventes et liens
  repartent ; seules les ACTIONS restent espacées (une toutes les 10 min). Pause et essai : lectures coupées, comme avant.
- **Un refus après la levée remet la pause, même délai** : `platform_settings_fusionner` FUSIONNE l'objet visé ; le blocage
  neuf de `blocagePose` gardait `leve_le` / `essai` de l'ancien → état « reprise », jamais de pause (Louis, levé le 31/10
  à 19:40). Les clés de l'ancien blocage absentes du neuf partent en `p_supprimer` (`clesARetirerAuBlocage`) dans
  handler-watch et update-job-status.
- **Reprise finie → blocage rangé** : `leboncoin.blocage_acces` présent = pause, essai ou reprise EN COURS ; 6 h après la
  levée, get-pending-jobs le range dans `leboncoin.blocage_acces_dernier` (`blocageArchive`).
- **Un poste en machine virtuelle ne fait jamais l'essai** (`essaiPossible`) : l'essai désigné chez lui ne partait pas
  et comptait pour un refus muet. Le compte d'une machine virtuelle garde sa pause tant que SON essai n'a pas réussi
  sur un vrai poste (louis-seller@ttfamily.fr).
- **(01/11, décision de Nico) Exception PAR COMPTE « Leboncoin autorisé sur machine virtuelle »** :
  `profiles.beta_flags.lbc_machine_virtuelle_autorisee = true` (booléen strict, jamais écrit par l'app), posée sur
  louis-seller@ttfamily.fr SEUL (`scripts/reparations/20261101_louis_seller_lbc_machine_virtuelle.sql`, inverse). Lue par
  get-pending-jobs (v316, `gardeVirtuelleLbc` de `_shared/poste-virtuel.js`) aux deux points de la garde : tâches,
  retraits, relevés et réponse `blocages` (qui coupe la veille de l'extension), et l'essai de levée de pause. Avec
  elle, le message « machine virtuelle » s'efface de ses tâches en attente (archivé). Sans elle — tous les autres
  comptes —, la garde à l'identique. La pause sur refus (`blocage_acces`) n'est pas touchée. Aucune extension à changer.
  Selftest `selftest:lbc-machine-virtuelle-exception [-- --prod]`.
- **La rue des Réglages que Leboncoin ne connaît pas n'est jamais servie à une republication**
  (`_shared/lbc-voie-des-reglages.js`, `repliCommuneDesReglages`, `decisionRueInconnueLbc`) : une publication Leboncoin
  PASSÉE du compte (14 jours) qui a dû se replier sur la commune avec l'adresse des Réglages (warning
  `adresse_barreau3_repli_commune`) prouve que Leboncoin ne connaît pas cette rue ET que son formulaire accepte la
  commune → la republication tape la commune (comme la publication, comme l'annonce d'origine) ; une rue déjà servie et
  gardée par le job (`voie_des_reglages`) est retirée (`voie_des_reglages_retiree`, jamais remise). Une rue lue sur
  l'annonce d'origine n'est jamais touchée. Cas : doriane-henri (Viviez 12110), 22 publications passées, republication
  en pause à 21:48 (contrôle avant retrait de l'extension, mode précis, aucune proposition).
- **Jamais « Vérifie tes Réglages » quand la même adresse vient de passer en publication** (update-job-status,
  `publicationAvecLaMemeAdresse`, `messageAdresseChezNous`) : c'est chez nous → reprise espacée (10 min, 1 h, 3 h), puis
  « Relancer » ; l'adresse tapée ou la commune où le repli l'a posée comptent.
- **eBay : un compte relié hors d'eBay France n'est jamais « compte à finir »** (ebay-api-worker) : le passage « voie
  extension → api » d'une publication créée AVANT la liaison (Rosa, « reginat8117 » sur eBay États-Unis, 4 publications
  du 31/10 19:16-19:54) la parquait « compte à finir » (lien ebay.fr) sans lire le site. Désormais : site connu hors
  d'eBay France → `clotureEbayHorsFrance` (cancelled, « FillSell publie seulement sur eBay France… », hors quota) ; filet
  `fermerAttentesEbayHorsFrance` à chaque passage pour toute attente (needs_user, pending ; jamais processing ni un
  retrait). La clôture archive le brut technique (`error_technique`) et retire `ebay_a_finir`. eBay France inchangé.
- App : l'état eBay (drapeau `ebay_voie_api` + compte) est relu au retour dans l'app (onglet visible, au plus une fois
  par minute) : un compte relié dans un autre onglet grise eBay au choix des plateformes avec sa phrase.

## 01/11 après-midi (décision de Nico, Louis) — DÉLÉGATION LEBONCOIN PAR COMPTE ; « ta connexion est bonne » prouvé
Rapport : `docs/enquetes/delegation-lbc-louis-0111/RAPPORT.md`.
- **Délégation Leboncoin** (`_shared/delegation-leboncoin.js`) : toutes les actions Leboncoin d'un compte (publication,
  republication, retrait, relevé des annonces, veille et relevé des ventes, essai de levée de pause) sont EXÉCUTÉES par
  l'extension d'un AUTRE compte, sur la session Leboncoin de son navigateur. Réglage serveur, posé DES DEUX CÔTÉS dans
  `profiles.beta_flags` (fermé en écriture au client) : propriétaire `delegation_leboncoin = { executant, nom }`,
  exécutant `execute_leboncoin_pour = [propriétaire]`. Un seul côté = rien. Posée sur louis-seller → Amiral SEULS
  (`scripts/reparations/20261101_louis_delegation_leboncoin.sql`, sauvegarde et inverse).
- **Mécanique** : au poll de l'exécutant, get-pending-jobs rend `delegations` ; l'extension (≥ 0.6.164) obtient une
  session PROPRE du propriétaire (`extension-session`, `delegation_pour`, 403 sans délégation valide ; jamais de mot de
  passe), rangée à part, et fait un cycle « compte de travail » sous le verrou de flux : poll délégué (preuve = jeton de
  l'exécutant dans le corps, vérifié ; non prouvé → rien servi), tâches et relevés Leboncoin, relevé quotidien, veille
  (une commande Leboncoin neuve vue par la veille du navigateur → relevé du propriétaire), relevé des ventes (cadence à
  lui). Tout s'écrit avec le jeton du propriétaire : RLS, `auth.uid()`, quotas, garde « une annonce, un compte »
  (`annonces_plateforme_un_compte`, comptes liés) jouent comme avant — chaque annonce reste sur son compte.
- **Postes du propriétaire** (sa machine virtuelle) : plus aucune tâche, aucun relevé, aucun « Me connecter »
  Leboncoin ; `blocages.leboncoin = { etat: "delegue" }` coupe veille, ventes et liens (toutes versions), et dès la 0.6.164
  la sonde et le relevé quotidien Leboncoin. Ses tâches Leboncoin attendent le compte de travail (message posé seulement
  s'il n'a pas été vu depuis 2 h).
- **Pause** : le compte de travail suit la pause sur refus de l'EXÉCUTANT (son `blocage_acces`) en plus de la sienne,
  l'état le plus prudent gagne ; en reprise prudente, une action toutes les 10 min comptée sur l'exécutant. La règle de
  pause elle-même ne change pas. Navigateur de l'exécutant en pause → rien ne part pour le compte délégué.
- **Carte de synchro** du propriétaire : « Leboncoin passe par ton compte Amiral. » (ou « En attente de son
  ordinateur… », « Leboncoin n'est pas connecté sur son ordinateur. ») ; pastille Leboncoin = dernier relevé réussi
  (tous déclencheurs) au lieu de « — ».
- **« Ta connexion X est bonne » se prouve** (`_shared/session-prouvee.js`, tout le parc) : jamais devant une annonce
  vue « vue acheteur » ; la sonde compte si elle est de CE poste (ou du compte quand il n'a qu'un poste vivant), de moins
  de 30 min, postérieure au dernier mur vu par ce job ; un relevé réussi aux mêmes conditions. pas-de-rouge reçoit des
  sessions où un « connecté » non prouvé devient « inconnu ». Sinon le message d'attente de connexion (inchangé).
- Selftests `delegation-leboncoin` (`-- --prod`), `delegation-leboncoin-releves` (`-- --prod`), `session-prouvee`.

## ⛔ 02/11 (labrunettedu44, sebastien64310) — Leboncoin : une rue introuvable n'est jamais retapée à l'identique ; eBay : rayons médias
Rapport : `docs/enquetes/trois-rouges-0211/RAPPORT.md`.
- **Leboncoin, adresse de republication** (update-job-status **v167**, `_shared/lbc-voie-des-reglages.js`) : le contrôle
  avant retrait ne trouve aucune proposition pour l'adresse tapée → la tâche repasse pending (5 min, rien n'a été touché)
  avec l'écriture suivante : le numéro détaché (« 25bis » → « 25 bis »), puis la rue sans numéro, puis la COMMUNE de
  l'annonce seulement si une publication du compte a fait accepter CETTE commune (ville choisie ou repli) ; sinon la pause
  « Vérifie tes Réglages » reste, avec chaque écriture essayée. Les autres republications du compte qui tapent la MÊME rue
  (pending, pas retirées) suivent la même écriture. `localisation_origine.voies_essayees` garde la trace ;
  `voie_des_reglages_retiree` empêche get-pending-jobs de remettre la rue.
- **« Leboncoin a accepté cette même adresse »** ne se dit plus que d'une adresse ACCEPTÉE (`adressesAccepteesParPublication` :
  la ville choisie quand elle a primé, la commune d'un repli, sinon l'adresse tapée) — jamais de la rue refusée ni de
  `platform_fields.adresse` d'une publication passée par la ville. Selftests `lbc-rue-introuvable-0211`, `lot-j-3110` adapté.
- **eBay, famille `livres_medias`** (ebay-api-worker **v106**) : livres ET médias — un rayon média d'eBay (DVD, cinéma ;
  Films, DVD ; Musique, CD, vinyles) est dans la famille quand le TITRE nomme un support (vhs, dvd, cd, vinyle…), même si
  la description désarme le support (critique « roman noir »). Un livre sans support nommé au titre reste gardé « Livres ».
  Selftest `ebay-rayon-media-0211`.


## 03/11 — Leboncoin en pause : le bouton « Leboncoin remarche » existe (rapport `docs/enquetes/six-points-0311/RAPPORT.md` § 6)
- Le message de pause (`messageBlocageLbc`) promettait ce bouton depuis le 30/10 ; il n'existait pas. Bandeau
  `src/components/BandeauLeboncoinPause.jsx` (monté dans App, PC et téléphone), montré seulement quand
  `platform_settings.leboncoin.blocage_acces` tient (posé avec `depuis`, pas de `leve_le`). Le geste relit la ligne puis
  pose `essai_demande_le` (`platform_settings_fusionner`) → `etatBlocageLbc` « essai » : une seule action au prochain
  passage de l'ordinateur. ⛔ Jamais d'écriture sans pause en cours (elle créerait un blocage).

## ⛔ 03/11 — Leboncoin en pause : une visite de contrôle légère, jamais une action, jamais de rafale (rapport § 7)
- Règle de Nico : pendant une restriction, UNE visite légère de contrôle de temps en temps (le relevé « Mes annonces »,
  lecture seule, posé par get-pending-jobs s'il manque, `controle_blocage_lbc`), 2 h après la dernière preuve
  (`ESSAI_APRES_MS`), ou à la demande (« Leboncoin remarche »). Jamais une tâche comme essai. Relevé lu en entier → levée,
  reprise prudente ; refus → visite suivante.
- Un relevé fini « done » (non « [incomplet] ») n'est JAMAIS une preuve de restriction, même si une relance interne a vu
  un 403 (handler-watch, verdict de l'essai).
- Extension (0.6.170) : un refus de Leboncoin sur une tâche arrête Leboncoin pour tout le cycle
  (`refusLeboncoinDuResultat`, `lbcRefusCeCycle`) ; la pause est relue avant chaque tâche Leboncoin ; un relevé lancé par
  l'extension elle-même ne part pas pendant une pause.
- Le message dit ce que Leboncoin a montré (`messageBlocageLbc(nav, depuis, signe)`) : vérification anti-robot, refus 403,
  ou « Accès temporairement restreint » — jamais ce dernier par défaut.
- Leboncoin « déposée » (point 5) : l'extension 0.6.170 garde le statut BRUT de chaque annonce du relevé (`statut_brut`,
  écrit seulement si la colonne existe — migration à décider) et compte toujours les statuts bruts dans le texte du relevé
  (« [statuts] … »). Le comportement « déposée » (garde-fous de Nico) se pose quand ces valeurs sont mesurées.

## 04/11 soir — Depop « PayPal à relier » ; eBay : les annonces de l'API Inventory ne se modifient pas sur eBay
Récit : `docs/enquetes/problemes-rouges-0411/RAPPORT.md` § 3, 4, 5.
- Depop : un refus de CRÉATION qui demande un geste sur le compte (`CODES_GESTE_COMPTE_DEPOP` — 1216 « collegare un
  account PayPal » —, ou le mot PayPal ; message de Depop en italien chez tous) = le mur « configuration vendeur »
  (`_shared/vendeur-depop.js`), message PayPal, aucune reprise. Un essai arrêté sur ce refus n'est jamais une preuve que
  le compte vend (`vendeur_depop.paypal_le`) ; la sonde canSell non plus tant que ce mur tient. Un code neuf de ce genre
  s'ajoute à `CODES_GESTE_COMPTE_DEPOP` ET à `DEPOP_CODES_GESTE_COMPTE` (content-scripts/depop.js).
- eBay : une annonce publiée par l'API Inventory n'est modifiable QUE par l'API Inventory (doc eBay ; « Cette opération
  n'est pas autorisée pour les objets de l'inventaire » sur le site). Toute modification passe par l'app (« Modifier
  sur eBay ») : titre, prix, description, caractéristiques, photos (voie a, décision de Nico du 04/11). À la
  publication, les caractéristiques écrites par la personne sont lues (`_shared/ebay-aspects-du-texte.ts`), recalées sur
  la liste eBay, jamais par-dessus une valeur connue ni pour une taille.
- eBay « compte pas prêt » étape `conditions` : un vendeur inscrit sans conditions EBAY_FR ne publie pas par l'API ;
  ⛔ (04/11, décision de Nico, remplace le 12/10) plus de renvoi vers ebay.fr : « Créer mes conditions eBay » dans
  l'app, valeurs lues sur SES annonces, prix de livraison jamais deviné, rien créé sans son clic (`proposer_conditions`
  lecture seule, `creer_conditions` au clic).

## 05/11 — Leboncoin : la visite de contrôle d'une pause n'est jamais avalée, jamais servie « devant »
- 'controle_blocage_lbc' doit figurer dans releve_est_veille (migration 20261105010000, feu vert de Nico) ; la visite est
  servie avec les relevés du cycle (bouton_distant + numéro de relevé), jamais `devant` (la 0.6.170+ refuse un relevé
  « serveur » pendant une pause).
- Délégation : quand le compte de travail est en pause Leboncoin, le propriétaire lit « Leboncoin y a restreint
  l'accès… » (`messageTacheDelegueeEnPause`), jamais « ouvre l'extension ».

## 05/11 matin — Délégation Leboncoin : la chaîne entière, et l'alerte quand elle recoince
- `selftest:delegation-leboncoin-chaine` suit retrait, republication et relevé du propriétaire jusqu'à l'extension de
  l'exécutant, la pause de l'exécutant, la levée (visite acceptée par la base, servie sans « devant », lancée en
  bouton_distant) et la reprise.
- Une file arrêtée alors que l'extension qui doit la faire (celle du compte, ou l'exécutant d'une délégation valide) est
  ouverte remonte en ROUGE dans l'ops-digest (support@fillsell.app) : `_shared/attente-extension-active.js`,
  `selftest:attente-extension-active`. Pas signalés : file qui avance, ordinateur éteint (ou pas vu depuis 24 h), tâche
  programmée, file en pause voulue, republication automatique pas engagée (créneau).

## 05/11 midi — Leboncoin : ventes lues par les transactions ; Beebs : « reçue puis retirée »
- L'API des transactions Leboncoin ne donne AUCUN numéro d'annonce : ses ventes (`source releve`, `commande_ref`) ne se
  rattachent jamais et peuvent doubler une vente déjà enregistrée par l'annonce (« Article vendu », numéro). En
  délégation, elles s'écrivent chez le compte qui relève. Correctif proposé le 05/11 (image de la transaction ↔ photo
  de l'annonce, numéro exact) : en attente de Nico — ne pas compter ces ventes comme preuves.
- Beebs : un numéro vu « en vérification » au dépôt puis absent de deux relevés complets = retrait par la modération
  de Beebs (XEWER, louis-seller) ; comparer avec les dépôts acceptés du même jour avant de conclure.

## Leboncoin interdit cosmétique, médicament, parapharmacie (05/11, point 6 — Dylan62)
- Règle Leboncoin relue le 05/11/2026 (https://assistance.leboncoin.info/hc/fr/articles/360000030540, « Les produits
  interdits ») : « Cosmétique, médicament et parapharmacie ». Aucune catégorie Beauté chez Leboncoin.
- Source CERTAINE en plus du titre (règle du 11/08) : la catégorie Vinted de la fiche (`_shared/lbc-interdits.js`,
  feuilles consommables de Femmes > Beauté et Hommes > Soins ; jamais les accessoires ; 153 laissée au titre). Case
  Leboncoin grisée dans l'app (lbcCategoryStatus) avec la raison ; filet get-pending-jobs (republication pas engagée close,
  publication en needs_user). Jamais un rayon faux (« Décoration »).

## ⛔ 05/11 soir (décision de Nico) — Session Leboncoin PARTAGÉE (délégation) : un relevé, un budget, pas de nuit (0.6.175)
Pour TOUT navigateur dont la session Leboncoin sert plusieurs comptes FillSell (il exécute Leboncoin pour au moins un
autre compte : `rep.delegations`) ; un compte seul garde tout à l'identique. Code : bloc « SESSION LEBONCOIN PARTAGÉE »
de `chrome-extension/background.js` ; selftest `lbc-session-partagee-rythme`. Mesure d'origine (Louis, 05/11) : 277 + 110
annonces relues toutes les 2 h, ≈ 190 pages par heure jour et nuit ; « Mes annonces » lu deux fois en 30 s.
- **Un relevé** : une lecture de « Mes annonces » (et de la liste des ventes) sert tous les comptes de la session pendant
  15 min, sauf tâche Leboncoin, anti-robot ou pause depuis ; une lecture ratée n'est pas refaite pour un autre compte
  dans la fenêtre (une commande servie reste en file). Relevé quotidien et ventes de chaque compte ALIGNÉS sur la lecture
  quotidienne de la session (un compte relevé depuis ≥ 1 h la reprend, sans requête) ; la lecture des ventes s'arrête
  sur les commandes connues de TOUS les comptes de la session.
- **Un budget** : pages d'annonce de routine (checkPublishedListings) à 60 par heure pour toute la session (rafale 8),
  réparties au prorata des annonces de chaque compte ; chaque annonce au plus toutes les max(2 h, annonces ÷ 60) — Louis,
  387 annonces : 6 h 27. Leboncoin lu à part (la fenêtre des 60 n'est jamais prise aux autres plateformes). Base du
  chiffre : sebastien64310 (452 annonces) 127 pages en 2 h ≈ 64/h ; jocabroc8 55/h, beautyandthedress 83/h (05/11 20:38).
- **Pas de nuit** (23:00–07:00 heure de Paris ; l'extension n'avait aucune définition de la nuit) : ni pages de routine,
  ni relevé quotidien, ni relevé des ventes. Jamais touchés : veille des transactions (10 min) et les relectures qu'elle
  désigne, relevés servis ou demandés, gestes (publication, retrait, republication) et leur cadence, sonde de session.
- Ventes : payées par Leboncoin (veille des transactions, relevé) — aucun effet ; « Vendu » posé à la main (main propre)
  — vu par la page de l'annonce jusqu'à 6 h 27 après le jour (≈ 3 h en moyenne ; avant ≤ 2 h, ≈ 1 h), au plus ≈ 14 h
  après s'il est posé le soir (nuit puis rattrapage du matin) ; le relevé quotidien le voit aussi.

## 06/11 après-midi — eBay : le mur « paiements » ; Vinted : « Accessoires de mode » est une racine (lot n° 2)
Récit : `docs/enquetes/lot-0611/RAPPORT.md`.
- **eBay, configuration des paiements du compte vendeur non terminée** (ayadi007, Business, 4 publications) : eBay
  redirige le formulaire de mise en vente vers son onboarding des paiements (`ebaypayonboardingweb.ebay.<tld>`,
  `account-status-error`). Ce n'est NI le cache (bfcache) NI une page d'inscription vendeur ordinaire. La page d'arrivée
  est reconnue (`estPagePaiementsVendeurEbay`, `_shared/ebay-page-vendeur.ts`) et fait poser le même mur que le compte
  vendeur inactif (needs_user `ebay_compte_vendeur_inactif`, mur « paiements ») avec un message vrai
  (`paiementsVendeurEbay`, textes-jobs : « Mon eBay → Paiements … Rien n'a été publié ») ; get-pending-jobs montre le
  message du DERNIER mur vu (`messageRetenueVendeurEbay`, `_shared/vendeur-ebay.js`) ; l'éclaireur relâche tout dès
  qu'une publication eBay aboutit. Selftests `ebay-paiements-mur`, `ebay-page-vendeur` (section 5).
- **Vinted a retiré le niveau « Accessoires »** (Jean-Luc LASSARAT : « Vinted ne propose pas « Accessoires » à cet
  endroit ») — arbre VIVANT relu le 06/11 (`/api/v2/item_upload/catalogs`, 2 874 nœuds) : racine « Accessoires de mode »
  #5496 SANS genre (écharpes, gants, lunettes de soleil, montres, ceintures, cravates, parapluies, porte-clés, bijoux
  #5498) ; sacs Homme sous « Hommes > Sacs et sacoches » #94 ; casquettes sous « Femmes/Hommes > Chapeaux et casquettes ».
  `src/utils/vintedCategories.js` : plus aucun segment « Accessoires » ; les bijoux prennent la feuille que le TITRE nomme
  (`feuilleBijouVinted`, mot entier, la plus précise d'abord), sinon la question (statut no_default, plus de feuille
  « Autres bijoux » devinée). Selftest `vinted-accessoires-de-mode` (chemins contrôlés sur les ids vivants).
  ⚠ Reste périmé : le sélecteur de rayon (`src/utils/arbres/vintedFeuilles.js`, généré de `docs/vinted-catalog-tree.txt`
  de juillet) — à régénérer depuis l'arbre vivant (proposé, non fait).

## 06/11 fin d'après-midi — eBay : l'éclaireur des publications en attente ; les retours selon le compte ; Vinted régénéré
- **Toutes les publications eBay d'un compte attendent le geste (mur « compte vendeur » ou « paiements »)** : l'éclaireur
  de get-pending-jobs ne se choisit que parmi les dépôts EN FILE — aucun ne repartait jamais. handler-watch (patron
  Depop) : preuve (publication eBay après le dernier mur) → tout repart ; sinon, poste vu dans les 30 min, la plus
  ancienne repart seule au barème (60, 180, 360, 720, 1440 min), jamais deux à la fois, jamais à côté d'un dépôt en file.
  ⛔ La mémoire du barème lit TOUS les jobs eBay récents du compte, quel que soit leur statut (v173 : un éclaireur garé
  par un autre mur sortait de la lecture → 6 essais en 15 min chez 9bcc16d0 ; corrigé v175). `eclaireurVendeurEbayEnAttente`
  (`_shared/vendeur-ebay.js`) ; selftest `ebay-eclaireur-attente`.
- **Retours eBay (Pascal Caffray)** : le type de vendeur est LU chez eBay (Trading GetUser, SellerBusinessType :
  Commercial = professionnel, Private = particulier, autre = inconnu ; checklist `type_vendeur`). « Pas de retour »
  n'est proposé — et accepté par ebay-account (creer_politique, creer_conditions, proposer_conditions) — qu'à un compte
  qu'eBay dit particulier ; l'écran propose 14, 30, 60 jours et envoie la durée choisie (`retours_jours`), que
  corpsCreation pose telle quelle (returnPeriod). `_shared/ebay-retours.js` ; selftest `ebay-retours`. ⚠ Reste : la
  question « Retours eBay » de la voie extension (`_shared/ebay-brouillon-refus.js`) propose encore « Pas de retour »
  (sans connexion API, le type n'est pas lisible ; l'extension ne sait poser que 30 jours ou rien) — à décider.
- **Vinted : sélecteur régénéré depuis l'arbre VIVANT du 06/11** (`docs/vinted-catalog-tree.txt` reconstruit = 09/09 +
  diff ligne à ligne lu dans la page, empreinte FNV identique à l'arbre servi ; `node scripts/gen-arbres-feuilles.mjs` → `vintedFeuilles.js`
  2 462 feuilles). 23 ajoutées (racine « Accessoires de mode »), 50 retirées (Accessoires Femmes/Hommes/Enfants, « Autres
  accessoires », « Autres bijoux »), 26 déplacées (même id : chapeaux, sacs Homme, porte-monnaie enfants). Autorité
  « Mode » (`vintedCatalogMode.js`) : +26 ids, aucun retiré (les fiches gardent les anciens). ⚠ Vinted bascule COMPTE PAR
  COMPTE : sur 48 h, 6 comptes republiaient encore avec l'ancien arbre, 7 avec le nouveau — sur un compte pas encore
  basculé, un accessoire publié passe par la question de l'extension (les vrais rayons du compte). Les annonces publiées
  gardent leur rayon (Vinted laisse l'ancien sur la page ; la republication relit le catalog_id réel — 55 republications
  réussies en 48 h sur ces fiches).
- **(15:10, décision de Nico) Vinted : le chemin selon l'arbre RÉEL du compte** — `_shared/vinted-arbre-compte.js` :
  table ancien ↔ nouvel arbre (26 déplacés par identifiant, 43 accessoires par libellé, renommages de Vinted compris ;
  7 sans équivalent jamais traduits). L'arbre du compte = le plus récent de ce que Vinted lui a montré : catalog_id du
  formulaire d'édition de ses republications (`republish_snapshot`, jamais `vinted_ids`) ou refus « Vinted ne propose
  pas « Accessoires » » (nouvel arbre) / « « Accessoires de mode » » (ancien). get-pending-jobs traduit au service
  (publication seule, réponse seule, trace `categoryPath_selon_arbre`) ; handler-watch reprend UNE fois une publication
  arrêtée sur ce refus si son chemin a un équivalent (genre de la fiche pour l'ancien arbre). Inconnu → rien ne change.
  Selftest `vinted-arbre-compte`.
- **(15:10, décision de Nico) Retours eBay, voie extension** : la question « Retours eBay » (`champRetoursEbay`,
  `_shared/ebay-brouillon-refus.js`) propose 14, 30, 60 jours, et « Pas de retour » seulement si le compte est lu
  particulier : GetUser (voie API, `seller_state.type_vendeur`) sinon une annonce eBay en ligne du compte par l'API
  Browse (`seller.sellerAccountType`, `_shared/ebay-type-vendeur.ts`) ; illisible → jamais. ⚠ L'extension ne pose
  toujours pas les retours sur le formulaire : le choix est rangé pour le compte (comme avant).

## ⛔ 06/11 soir (décision de Nico) — Un article « pour » une marque ne prend JAMAIS cette marque (Louis, « SEB »)
- Cause (essai réel de Louis, 3303702852 acceptée en retirant SEUL la marque) : ses rangements imprimés en 3D sont
  COMPATIBLES avec la yaourtière SEB Multidélices ; Leboncoin pré-remplit « SEB » (lu dans le texte) et la 0.6.175 le
  gardait (« notre valeur Sans marque est un repli générique », marque « nommée par l'article ») ; une fiche importée
  portait même « SEB ». Leboncoin refuse désormais une marque déclarée sur un produit qui n'est pas d'elle.
- Règle (`_shared/marque-compatible.js`, toutes plateformes, publication comme republication) : une marque que le titre
  et la description ne citent QUE derrière « pour », « compatible (avec) », « adapté à », « s'adapte sur », « convient
  à », « conçu / prévu / fait pour », « de / pour / à / sur votre… » (6 mots au plus, même proposition) part en « Sans
  marque ». Citée au moins une fois comme celle de l'objet (« Yaourtière SEB ») : gardée. « pour » + public (femme,
  enfant, chiens…) ou démonstratif (« pour ce sac ») : pas une compatibilité. Jeu vidéo (titre : jeu, game, PAL…) sous
  une marque de console : gardée. Marque non citée : rien n'est déduit.
- Branchements : get-pending-jobs (chaque tâche servie, trace `platform_fields.marque_compatible_retiree`, écrite une
  fois), ebay-api-worker (à la prise), extension Leboncoin 0.6.176 (copie identique de la règle : un pré-rempli de
  compatibilité n'est jamais « nommé par l'article » ni « convenable » → « Sans marque » posé par identifiant).
  Texte, photos, fiche : jamais touchés. Selftest `marque-compatible`.
- Mesure du 06/11 21:00 : 94 annonces en ligne ou en file, 7 comptes (Louis 84), aucune marque écrite par la personne
  elle-même (relevés Leboncoin, Beebs, Vinted). Refus de modération Leboncoin notés depuis le 25/10 : 8, dont 5 avec
  cette cause (tous chez Louis).

## 07/11 — eBay puériculture, Vinted « neuf seulement », dimensions du colis (rapport `docs/enquetes/lot-0711/RAPPORT.md` § 4, 5)
- eBay : la racine « Bébé, puériculture » n'est pas un rayon de genre (`brancheGenre`, src/utils/categorieParMot.js) :
  un doudou garde 148373 quel que soit le genre. Selftest `puericulture-genre-ebay`.
- Vinted : un rayon « neuf seulement » pour un article d'occasion se dit dès la première remontée (pas-de-rouge
  `vinted_rayon_neuf_seulement`, jamais de reprise) ; « Vinted exige les dimensions du colis » : FillSell ne sait pas les
  envoyer, la question sur une clé jamais relue tombe, message vrai (décision à prendre : saisie des dimensions).
- (07/11 soir) Taille eBay : `_shared/taille-ebay.js`, appelé seulement après la règle des tailles. E1 : âge anglais →
  français, même unité (« 11-12 yrs » → « 11-12 ans », « 18 months » → « 18 mois », « Newborn » → « Naissance ») ;
  E2, liste fermée seulement : préfixe de pays que la liste n'écrit pas (« 38 EU », « EU S », « UK 6 » sur « Pointure UK »).
  Jamais mois↔ans ni conversion de pays ; « FR 3 » (numérotation Lacoste) reste une question. Selftest `taille-ebay`
  (banc du parc : 680 identiques, 2 corrigées, 0 régression).
- (07/11 soir) Beebs : le bandeau « Voir dans l'appli / Télécharger l'application » de la fiche n'est plus lu comme un
  attribut (0.6.178). Une annonce d'origine SANS Taille/Âge garde la question (aucune valeur devinée).

## ⛔ 07/11 soir (urgence Goulvenk) — Leboncoin : une session FERMÉE n'est jamais une restriction (rapport `docs/enquetes/lot-0711/RAPPORT.md` § « Goulvenk »)
- Constat (lu en base) : pause posée le 06/11 à 01:33 sur un 403 de la veille des commandes, une heure après un relevé
  des ventes « compte absent de la page » ; ses 9 visites de contrôle ont lu « page de connexion » ; l'app disait
  « nouvel essai automatique, rien à faire » ; sa synchro de 18:10 restait en file sans un mot. Le contrôle disait vrai
  (session fermée jusqu'à sa reconnexion vers 19:11) ; c'est la RÈGLE autour qui était fausse.
- Règle (`_shared/blocage-leboncoin.js`, toutes versions, tous comptes) :
  1. un 403 à côté du mur de CONNEXION (`murConnexionLbc` : « page de connexion », « Connexion Leboncoin requise »,
     « En attente de ta connexion à Leboncoin »…) n'est jamais une restriction (`signeBlocageHorsConnexionLbc`, appelé
     par handler-watch et update-job-status) ; les signes vus sur la page (anti-robot, « Accès temporairement
     restreint ») restent des signes ;
  2. pause dont la dernière visite a vu la page de connexion (signe `session_fermee`) → les tâches retenues passent par
     le CIRCUIT CONNEXION (`attente_session`, marqueur `ATTENTE_SESSION_POSE_PAR_PAUSE_LBC`) : l'app dit « À toi de
     jouer : connecte-toi à Leboncoin sur ton ordinateur », le bandeau `BandeauLeboncoinPause` dit « Connecte-toi à
     Leboncoin sur ton ordinateur », jamais « restreint », jamais « rien à faire » ; levée de la pause = marqueur retiré ;
  3. une pause ne dure jamais contre une preuve : relevé Leboncoin lu en entier, ou dépôt publié par l'extension, APRÈS
     la dernière preuve → pause levée (`contrePreuvePauseLbc`) ;
  4. la synchro Leboncoin demandée par la personne pendant la pause EST la visite de contrôle (jamais muette en file) ;
     le compte revu connecté par l'extension après la dernière visite refusée rend la visite due tout de suite, au
     plus une toutes les 30 min (`ESSAI_SUR_PREUVE_MIN_MS`) — jamais pour une restriction anti-robot.
- Extension 0.6.179 : « compte vu » seulement avec un jeton `luat` non expiré (`leboncoin.js`, `jetonLuatValable`) ;
  aucune requête de la veille des commandes ni du relevé des ventes avec un jeton périmé (« jeton_expire ») ; la porte de
  connexion du relevé est confirmée deux fois à 1,2 s et nommée dans le run.
- Selftests : `lbc-session-fermee-circuit-connexion` (rejoue la chaîne de Goulvenk), `bouton-leboncoin-remarche` § 4.
