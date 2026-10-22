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
