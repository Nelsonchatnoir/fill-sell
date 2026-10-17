# Republication, publication (unité et lot), cadence et quotas de republication

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 17/10 — « introuvable » sur l'annonce exacte (2 relevés complets) ; une republication naît avec son lien et garde sa copie (en fin de fichier)
- 17/10 — la limite du jour se dit en entier : minuit, « environ N jours » (exception à la règle du 16/10) (en fin de fichier)
- 16/10 nuit — une seule vérité sur les attentes : six mots d'état, une source, aucun temps estimé (en fin de fichier)
- 09-10/10 — publication en lot : page blanche (ex-L138-146)
- 08/10 — une republication dont la suppression est partie va au bout (ex-L250-263)
- 06/10 soir — une republication ne bute jamais sur une valeur que son annonce porte (ex-L317-322)
- 05/10 soir — gratuit = 50 republications par mois (ex-L329-332)
- 04/10 nuit — défauts clients (marque absente, texte de la fiche, colis) (ex-L347-358)
- 04/10 — cadence (plafond Premium, coin_config journalisé) (ex-L366-367)
- 03/10 nuit — marque, annonce de test, republication (ex-L384-395)
- Publication en lot (03/10) (ex-L453-454)

<!-- ex-CLAUDE.md L138-146 : 09-10/10 — publication en lot : page blanche -->
- **⛔ PUBLICATION EN LOT : PAGE BLANCHE (09/10 22:13 → 10/10, Nico et Louis)** :
  `EcranAvant` lisait `userId` (f06c91f, port Depop, 2.9.70) et `exclusDepop`
  (4b34f9e, 2.9.71) sans les recevoir → tout lot tombait à la fin de la
  préparation (bloc Livraison). Corrigé à la racine : props passées,
  `BarriereErreur` par moteur, article, ligne et bloc (article cassé = mis de
  côté, journal `usage_logs` `lot_article_mis_de_cote` / `lot_bloc_en_erreur` /
  `lot_ecran_en_erreur`), build qui refuse toute variable non définie
  (`selftest:variables-definies`). Poids du lot FACULTATIF comme à l'unité
  (Nico). Aperçu : `node scripts/apercu/capture-lot-publication.mjs`.

<!-- ex-CLAUDE.md L250-263 : 08/10 — une republication dont la suppression est partie va au bout -->
- **⛔ UNE REPUBLICATION DONT LA SUPPRESSION EST PARTIE VA AU BOUT (08/10, Louis)** :
  créneau fermé, plafond ou pause n'y changent rien (`retraitEngage`,
  `_shared/retenue-creneau.js`, `get-pending-jobs` v223) ; la remise en ligne
  n'a lieu que sur PREUVE de la suppression (extension). Migration
  **20261008140000 APPLIQUÉE** (08/10 11:20 UTC) : le balayage ne lance plus une
  republication qui ne peut pas finir dans le créneau (`republish_duree_estimee`).
  Extension **0.6.104** (BUILD_ID `2026-10-08T14:53:27Z+0cec9e6`, chargée chez
  Nico) : zip LIVRÉ (`build/CWS-0.6.104-A-TELEVERSER/` ; preuve de republication
  Beebs levée par Nico — option d, l'échec venait de la modération Beebs) ; un retrait Beebs ne se clôt plus « déjà retirée » pendant la modération
  (annonce jamais vue en ligne, dépôt < 72 h) ; handler-watch v94 relance une
  fois les tâches « sans démarrage » quand le poste a la 0.6.104 : preuve Beebs relue ~6 min par le background,
  aucun essai consommé sans preuve, relevé Beebs par le flux quand « Mes
  annonces » est peinte vide (`selftest:beebs-preuve-relue`).
  Selftest `selftest:republication-va-au-bout`.

<!-- ex-CLAUDE.md L317-322 : 06/10 soir — une republication ne bute jamais sur une valeur que son annonce porte -->
- **⛔ UNE REPUBLICATION NE BUTE JAMAIS SUR UNE VALEUR QUE SON ANNONCE PORTE
  (06/10 soir, dbz70)** : « EU N » ≡ « N » (jamais UK/US/IT/DE) — régression
  ca63277 (0.6.90) ; une valeur servie par le serveur n'atteint le formulaire
  qu'à une (re)capture (handler-watch recapture une fois) ; un remplissage
  lent mais vivant n'est jamais coupé (port de remplissage allumé pour un
  compte coupé à 5 min) ; une marque d'origine se reconnaît par son id.

<!-- ex-CLAUDE.md L329-332 : 05/10 soir — gratuit = 50 republications par mois -->
- **⛔ Gratuit = 50 republications PAR MOIS** (05/10 soir, Nico ; plus « à vie ») :
  coin_config `quota_republication_free`, même cycle que `quota_annonces_free`
  (`debut_cycle_quotas` → `coin_wallets.next_grant_at`), compteur unique
  `quota_republication_free_etat` (exécutées + en file), mig 20261005173000.

<!-- ex-CLAUDE.md L347-358 : 04/10 nuit — défauts clients (marque absente, texte de la fiche, colis) -->
- **Défauts clients (04/10 nuit)** : une vente supprimée par la personne ne
  revient plus au relevé (`ventes_supprimees`, mig 20261004220000) ;
  l'absence de marque part en « Sans marque » sans question
  (`_shared/marque-absente.js`, liste FERMÉE, jamais une vraie marque) et la
  marque du catalogue choisie est retenue (`platform_settings.vinted.
  marques_retenues`) ; le texte qui part est celui de la FICHE au moment de
  l'envoi (`src/publication/texteDeLaFiche.js`) ; ⛔ aucun format de colis
  deviné (seul `format_colis_source: 'manuel'` part ; poids de la fiche et
  transporteurs retenus `platform_settings.leboncoin.transporteurs` posés au
  service ; lot : poids FACULTATIF depuis le 10/10, comme à l'unité — sans
  poids, Leboncoin et Beebs gardent leur estimation) ; prix/quantité des
  fiches modifiables en lot — les annonces en ligne ne suivent pas.

<!-- ex-CLAUDE.md L366-367 : 04/10 — cadence (plafond Premium, coin_config journalisé) -->
- **Cadence (04/10)** : plafond Premium **50**/jour ; tout changement de
  `coin_config` est daté et journalisé (`coin_config_journal`).

<!-- ex-CLAUDE.md L384-395 : 03/10 nuit — marque, annonce de test, republication -->
- **Marque (03/10 nuit)** : une réponse partagée atteint TOUTE plateforme qu'elle
  nomme (`moteur/reponsesPartagees.js`) ; la marque de la fiche n'est jamais
  redemandée ; ⛔ Vinted ne crée PLUS de marque libre (03/10) : marque exacte
  du catalogue, sinon une QUESTION, jamais « Sans marque » en silence.
  ⚠️ (17/10) Vinted OFFRE DE NOUVEAU « Utiliser "X" comme marque » (relevé compte de Nico, deux rayons) ;
  l'extension la prend quand elle nomme la marque, la question reste pour un vrai refus
  (`docs/regles/plateformes.md` § 17/10 soir).
  ⛔ Annonce de test : 999 € ou plus, jamais le tableau de Nico. **Republication** : âge et prix repris de L'annonce en ligne.
  Question « Marque » hors catalogue (`src/annonces/QuestionMarque.jsx`) : le
  pourquoi, « Sans marque » en un tap, recherche dans le catalogue Vinted
  (commande `CHERCHER_MARQUE`, 0.6.94) ; « Sans marque » jamais écrit sur la
  fiche. **Republication (0.6.94)** : l'annonce est RELUE avant tout retrait
  (`champs_lus_sur_l_annonce.lus`), la taille affichée l'emporte sur la copie
  (gpj v205). Exception de créneau : `creneau_exception` bornée, posée par
  réparation sur décision de Nico seulement.

<!-- ex-CLAUDE.md L453-454 : Publication en lot (03/10) -->
- **Publication en lot (03/10)** : livrée ; `docs/publication-en-lot.md` ;
  migration 20261003010000 (un arrêt ne repart jamais) appliquée.

## ⛔ PLUS AUCUN « GESTE À FAIRE » QUE L'APP PEUT TRANCHER SEULE (15/10 soir, Nico)
- Une publication ou une republication lancée PART ; une question seulement si aucune donnée fiable n'existe
  (`_shared/questions-tranchees.ts`, handler-watch).
- **Boutique Vinted** (`_shared/boutique-publication-vinted.js`) : article lié → sa boutique ; sinon la boutique
  changée dans la file, puis la boutique par défaut (Réglages › Mes plateformes, `platform_settings.vinted.
  boutique_defaut`), puis la boutique ouverte dans le navigateur à l'envoi. Jamais une boutique hors du compte ;
  l'extension relit la boutique avant le dépôt. Plus de question « boutique_a_choisir ».
- **État** (`_shared/etat-correspondance.js`) : annonce capturée → fiche → autres plateformes, traduit dans la
  grille demandée ; jamais deviné (« État neuf » ≠ « avec / sans étiquette »).
- **Sans objet** : publication/republication non engagée d'un article à vente ENREGISTRÉE, republication
  orpheline → annulées, rien retiré.
- **Poids Leboncoin exigé** (compte PRO, « Poids du colis* » sans estimation) : noté sur preuve
  (`platform_settings.leboncoin.poids_exige`) → « Saisir le poids » d'office au lot et à l'unité, gpj ne sert
  jamais une publication sans poids ; « un poids pour tout le lot » règle aussi la question en tranche et les
  annonces du lot en file, modifiable article par article. Jamais une tranche apprise « sans format ».
- **La file** : le bouton mène à l'action en un tap (Répondre → mini-éditeur) ; AUCUNE heure ni durée promise
  (`sansEstimation`) ; une attente automatique (relevé à venir, pause technique avant retrait, eBay étranger,
  plateforme écartée) est une pause, jamais un geste.

## 15/10 soir (3) — clôture du rouge (rapport `docs/enquetes/cloture-rouge-1510/RAPPORT.md`)
- **Jamais un deuxième dépôt Beebs à l'aveugle** (`_shared/depot-sans-numero.js`, gpj v252+) : une publication Beebs
  dont le dernier essai a PU partir (essai commencé sans fin relevée, formulaire muet après le clic, « non confirmé »
  avec une requête captée) est retenue : relevé du compte demandé, puis annonce apparue depuis (reliée à rien,
  numérotée après l'essai) aux photos de NOTRE copie → rattachée, aucune → redépôt autorisé (`depot_verifie`),
  doute → question (`depot_deja_parti`, une relance de la personne vaut réponse). « Non confirmé » SANS aucune
  requête = rien n'est parti : un nouvel essai n'est pas à l'aveugle.
- **Toute remise en ligne Beebs part avec ≥ 5 caractères de description** : la sienne (annonce capturée) → celle de
  la FICHE → les faits du job. Couleur/matière ajoutées aux publications seulement.
- **Une recréation bloquée repart seule quand la cause est levée** (`_shared/recreation-bloquee.js`,
  `CAUSES_LEVEES_PAR_LE_SERVEUR`, handler-watch v110+) : une fois par cause et par job, jamais sur une cause du
  compte ; message vrai sans durée.
- **Dépôt muet** (handler-watch v110+, `_shared/depot-muet.js`) : l'attente se compte depuis la DERNIÈRE REMISE EN
  FILE (création, fermeture précédente, `remis_en_file_le` posé par la base sur needs_user/failed/cancelled →
  pending — mig 20261015210000 —, relance de l'app, archive de relance). Une reprise technique n'en est pas une.
- **Feuille Leboncoin** (`_shared/lbc-feuille-corrigee.js`, gpj) : publication rangée dans une feuille Maison &
  Jardin sans paire réelle (fourre-tout) et dont aucun Produit n'est nommé dans l'annonce, quand UNE seule autre
  feuille porte un Produit nommé → cette feuille, avec sa paire (lampe Accolay → Décoration › Éclairage › Lampe à
  poser). Deux candidates : rien ne bouge.
- **Mots-clés Leboncoin** (décision de Nico, 15/10, remplace le 10/09) : une ligne « Mots-clés : / Keywords : /
  Tags : » compte dans les 5 ; au-delà (avec les hashtags restants), elle part du texte ENVOYÉ.
- **Marque Vinted hors catalogue** (ujs v137, gpj v252, extension 0.6.114) : la question « Sans marque ou une
  marque du catalogue » part UNE fois avant toute suppression (plus de reprise ni de champ retiré) ; la réponse
  (rangée sur l'article, servie en `marque_choisie`) prime sur la marque capturée à la recréation, l'ancien
  brand_id n'est plus transmis. (17/10 : remplacé, voir la ligne suivante.)
- **Fait (17/10, Nico — `_shared/vinted-marque-par-id.js`, extension 0.6.123)** : une republication reprend EXACTEMENT la marque
  de l'annonce en ligne — la ligne du menu si Vinted la propose, sinon son `brand_id` capturé, posé dans le corps du dépôt par la
  sonde (jamais d'écrasement) ; `brand_id` 1 = « Sans marque » natif. Aucune question ; pour une marque à identifiant, ni
  `marque_choisie`, ni `marques_retenues`, ni la fiche ne changent l'annonce (la question du 03/10 reste pour les publications
  neuves). L'une-passe ne retire l'annonce que si l'envoi direct est PROUVÉ (`marque_pose_envoi` : 2xx ET marque relue dans la
  réponse, sans refus depuis → gpj sert `marque_injection_prouvee`) et que `#brand` est vide ; sinon pause avant tout retrait
  (`pause_marque_par_id`, « En pause », jamais needs_user, aucune durée). Une recréation (annonce déjà retirée) pose l'identifiant
  sans attendre la preuve. Les arrêts « marque » des builds d'avant repartent seuls une fois (`CORRECTIFS_EXTENSION`
  `vinted_marque_par_identifiant`). ⚠️ Preuve à faire en réel (compte de Nico, annonce de test ≥ 999 €, protocole du rapport
  `docs/enquetes/dix-points-1710/RAPPORT.md` § 6) : tant qu'elle manque, aucune annonce n'est retirée pour ce motif.
  Selftest `selftest:vinted-marque-par-identifiant`.

## 16/10 nuit — UNE SEULE VÉRITÉ SUR LES ATTENTES (mission de Nico ; détail `docs/refonte/etape-1-attentes.md`)
- **Six mots, les mêmes partout** (app, extension, serveur, mails) : **En file** (ça partira seul, à son tour) ·
  **En cours** · **Fait** · **À toi de jouer** (question, connexion, autorisation, publication pas partie à relancer) ·
  **En pause** + la raison en une ligne (retenue, boutique à ouvrir, limite du jour, créneau, nouvel essai automatique,
  ordinateur éteint, mise à jour…) · **Arrêtée** (annulée, vendue, doublon). Chaque statut technique → UN mot
  (`ETATS`, `LIBELLES` de `supabase/functions/_shared/etat-job.js`). Interdits : « En attente », « Dans la file »,
  « Échec » pour un simple ré-armement, tout mot nouveau.
- **Une seule source** : `etatJob(job, ctx)` décide ; l'app (`src/utils/fileDesJobs.js` → FileDesJobs, barres,
  pastilles, EcranSuivi, SuiviLot, LotPublication, StockTab) et le popup de l'extension (copie GÉNÉRÉE
  `chrome-extension/etat-job.js`, `npm run gen:etat-job-extension`, divergence refusée par `selftest:etat-job`)
  ne font qu'afficher. Une nouvelle situation = une ligne dans `etat-job.js`, jamais un calcul local.
- **Plus AUCUN temps estimé devant la personne** : ni durée (« ~5 min », « quelques minutes », « toutes les 2 min »),
  ni heure prévue (« vers 14:05 », « prochain créneau à… »), ni compte à rebours (« Renvoyer dans 30 s »). On dit
  ce qui se passe et ce qui fera repartir ; `humanizeJobError` passe tout texte de job par `sansEstimation`
  (filet pour les anciens textes en base). Garde : `npm run selftest:aucune-estimation` (0 ligne, sources app +
  extension + serveur + mails). Gardés et marqués `estimation-ok:` : les faits passés (« depuis le 14/10 »), les
  dates imposées par un tiers ou un contrat (restriction Vinted « jusqu'au JJ/MM », relance Stripe, fin d'essai),
  les réglages eBay (retours sous 30 jours).
- **Loaders** : la phrase dit l'étape réelle (« Dépôt en cours sur Vinted, dans ton Chrome… »), jamais un délai ;
  Synchroniser = plateformes terminées sur visées + une ligne par plateforme. Ouvert (décision de Nico) : le
  pourcentage animé de `BarreProgression` (glisse sur des durées médianes) — maquette « étapes sans % » proposée.

## 17/10 — LA LIMITE DU JOUR SE DIT EN ENTIER (mission de Nico ; rapport `docs/enquetes/dix-points-1710/RAPPORT.md` § 3)
- **Exception écrite à la règle du 16/10 « aucun temps estimé »** (décision de Nico, 17/10) : la limite du jour dit
  qu'elle est atteinte, que la file **repart à minuit (heure de Paris)** — c'est la règle du plafond, le compteur du
  serveur repart au jour de Paris — et **combien de temps il faut pour écouler la file** (« ça prendra environ N
  jours », N = calcul sur la limite du palier, jamais une vitesse mesurée). Lignes marquées `estimation-ok:`.
- **Avant le clic** (feuille Republier, `partageRepublicationsDuJour`) : « Ta limite est de 50 republications par jour
  (toutes plateformes) : 50 partent aujourd'hui, les 635 autres à partir de minuit (heure de Paris), 50 par jour. Pour
  toute ta file, ça prendra environ 14 jours. » — la file déjà en attente passe avant.
- **Pendant la retenue** (`phraseLimiteAtteinte`, motif « plafond » seulement ; la pause de respiration garde sa
  phrase) : carte du haut du Stock (barre en pause), en tête de « Ta file », et ligne de la liste sur TOUTE la file
  (`repubJobsVivants`, plus le dernier lot seul). Chaque job dit « la file repart à minuit, celle-ci à son tour » —
  jamais l'heure de CE job. Un état lu avant minuit (écran resté ouvert) repart de 0 au changement de jour.
- **La trace `platform_fields.retenue_republication`** (get-pending-jobs) est une photo datée : vivante seulement si
  `status = 'pending'` ET `reprise > now()`. Périmée, elle se lève (gpj, 40 par poll, hors retenue). Le 17/10, 25
  traces « plafond » de nerema75 étaient périmées depuis 35 h : ses 25 republications attendent en fait une AUTRE
  boutique Vinted (« ouvre ta boutique @… »), ce que l'app dit déjà — normal.
- Aucun plafond changé (`coin_config` intouché). Selftest `selftest:republication-plafond-message` (texte, durée,
  câblage, levée de la trace).

## 17/10 — « INTROUVABLE » TRANCHÉ SUR L'ANNONCE EXACTE ; UNE REPUBLICATION NAÎT AVEC SON LIEN ET GARDE SA COPIE (DeadRoz, Amiral ; rapport `docs/enquetes/dix-points-1710/RAPPORT.md` § 2 et § 8)
- **Pause « introuvable à confirmer »** (`_shared/introuvable-a-confirmer.js`, handler-watch) : la trace se lit par l'IDENTIFIANT
  EXACT (Vinted : `vinted_listing_snapshots` ou la fiche qui porte CE `vinted_item_id` ; autres : `annonces_plateforme`), jamais la
  fiche du job (elle peut porter une autre annonce, ou rester « active » figée par la garde É4 du relevé). Revue en ligne →
  reprise ; close sur fiche vendue, trace vendue/fermée, ou DEUX relevés complets (total connu, lus ≥ annoncés, NON vides, de
  SA boutique Vinted) sans elle, comptés depuis la première lecture ratée. Un relevé vide ne prouve rien. handler-watch lit les
  relevés de LA plateforme, non vides, du plus récent (le 16/10, 87 relevés Leboncoin vides cachaient le relevé Vinted).
- **Naissance d'une republication** (`spend_coins_and_republish`, mig 20261017110000) : hors Vinted, le lien et la copie désignent la
  même annonce (le lien suit le numéro quand ils se contredisent, comme le déclencheur `cross_post_jobs_lien_suit_identifiant`) ;
  lien inconnu ou annonce de deux fiches → refus `lien_annonce_incertain` avant tout décompte (refus d'article au créneau, qui
  passe au candidat suivant). Une copie hors Vinted n'est jamais retirée (`annonce_partagee_reprendre` la réaligne ; sans lien
  exact, arrêtée, rien retiré). Selftests `introuvable-a-confirmer`, `republication-nait-avec-son-lien`, `annonce-partagee-cascade`.

## 18/10 — CHAMPS DÉDUITS : CE QUE LA FICHE OU UNE PLATEFORME SAIT N'EST PLUS DEMANDÉ (lot 3, session sans Nico ; audit `docs/enquetes/session-sans-nico-1810/lot3-audit-champs.md`)
- **Taille enfant** : la fiche porte la taille dans le vocabulaire de la plateforme d'ORIGINE (synchro Vinted « 9-12 mois /
  74 cm » : 7 935 fiches en 30 j ; relevé Beebs « 9 mois (67-74 cm) » ; Leboncoin « 9 mois / 74 cm »). `src/utils/childSizes.js`
  reconnaît désormais ces libellés EXACTS comme la canonique (`parseChildSize`, index des libellés des quatre plateformes ;
  un nombre nu n'est toujours jamais reconnu, eBay « 98 » n'est pas indexé ; libellé partagé par deux lignes → la canonique
  qui l'ouvre, sinon l'axe mois). Le jugement de l'écran Publier (`moteur/listes.jugerValeurContreListe`) traduit d'abord
  par cette table vers la grille de la plateforme cible et n'accepte que l'écriture TELLE QUELLE de la grille (sinon : comme
  avant, le vocabulaire des tailles puis la question) ; `tailleDuJob` pose cette écriture sur le job ; l'insert
  (`toPlatformChildSize`) convertit aussi un libellé d'une autre plateforme. Jamais un rapprochement par cm entre
  plateformes : la table relevée fait foi. Résultat attendu : plus de question « Taille · Beebs » pour un vêtement enfant
  importé de Vinted (152 affichages, 131 articles, 123 fiches qui portaient la taille, 7 j au 17/10).
- **Âge Beebs** : l'âge que la fiche porte déjà (`inventaire.attributs.age`, relevé de l'annonce Beebs du même article — 129
  fiches) répond avant la question (`genericKnownSource` « Âge » → `ageDitSurLaFiche()`) et part sur la copie Beebs qui n'en
  a pas, au départ de la publication. Jugé contre la liste comme toute valeur (hors liste → question avec suggestion).
- **Télémétrie `champ_requis_bloquant`** : une ligne « affiche » ne s'ouvre plus pendant qu'une IA générique est en vol
  (seconde passe Leboncoin Univers/Produit, aspects Beebs) — même règle que la couleur et qu'eBay ; une ligne déjà ouverte
  reste active (jamais un faux « complete »). ≈ 35 des 55 « Produit · Leboncoin » de la semaine étaient cet artefact.
- **Veille** : `champs_requis_veille(p_jours, p_limite)` (migration 20261018020000, lecture seule, service_role) → ops-digest
  v37 « Champs obligatoires » : un champ `required` apparu depuis 7 j sur un rayon relevé depuis plus longtemps (= la
  plateforme a ajouté un champ, à déduire plutôt que demander ; `sans_liste` quand rien n'est relevé), et les questions
  posées par plateforme et champ, 7 j contre les 7 d'avant (mesure avant/après : 609 affichages du 11 au 17/10, 423 la
  semaine d'avant ; à relire autour du 25/10). Compteur `champs_requis` (nouveaux + champs qui doublent avec ≥ 20 affichages).
- **Ordre des sources** (inchangé, rappel) : valeur de la personne → fiche (copie d'une plateforme : `attributs.<champ>` posé
  par la synchro, un relevé, le Lens, la saisie) → mapping (tables `childSizes`, `tailles`, synonymes) → IA en dernier
  (micro-appels `resolve_aspects`, plafonds par palier, pas de cache hors Lens identify). **Non fait le 18/10 en journée — la mémoire est faite la nuit suivante, section plus bas** (décision
  Nico) : mémoire « réponse du compte pour cette catégorie » (aucune n'existe pour Univers, Produit, Taille, Âge, Couleur,
  Style, Longueur — seules Opla catégories, colis Vinted, marques retenues, poids/new_item_type Leboncoin existent) ;
  cache / regroupement des appels IA (`resolve-categorie` ≈ 3 appels par article, 3 689 / 7 j, sans cache). Coût mesuré :
  génération ≈ 0,011 $ par article (Haiku 4.5), import gratuit, 1 000 articles Business ≈ 12-15 $ ; plafond
  `resolve-categorie` 4 000 / 24 h atteint vers 1 300 articles.
- Selftest : `champs-deduits` (29).

## Mémoire « compte × catégorie » des réponses (18/10 nuit, point 1)
- **Règle** : une réponse donnée PAR LA PERSONNE à un champ requis qui dit le PUBLIC du rayon est retenue pour
  utilisateur × compte × plateforme × catégorie cible × champ (`memoire_champs_categorie`, RLS) et reposée seule sur le
  prochain article du même rayon. Liste exacte (CHECK de la migration 20261018030000) : Leboncoin `clothing_type`,
  `shoe_type`, `accessories_univers` ; eBay `Département`. Jamais un champ de l'article ni un Univers / Produit / Type /
  Genre qui nomme une famille d'objets (rejeu sur 60 j : Décoration 11/16 et 8/16, livres 0/5 ; Mode 59/59).
- **Ordre** : saisie → fiche (genre, catégorie Vinted, taille enfant, mot du titre) → texte → **mémoire** → IA → question.
  Champ VIDE et REQUIS seulement ; valeur hors de la grille du jour = ignorée ; texte qui nomme un autre public = rien.
  Retenue au clic Publier (plateformes envoyées, copie qui porte encore la réponse), jamais une ligne inchangée.
- **Visible et réversible** : questions (« Repris de ta dernière réponse… », modifiable), carte du lot, Réglages ›
  Préférences (« Oublier », « Tout oublier »). Mesure : `usage_logs` feature `memoire_categorie` (appliquee, modifiee,
  retenue) + `champs_requis_veille()`. Code : `src/publication/moteur/memoireCategorie.js`, `src/utils/memoireChamps.js`.
  Selftest `memoire-categorie`. Rapport : `docs/enquetes/session-nuit-1810-memoire-ia/RAPPORT.md`.
- **ÉTEINTE à la livraison (18/10 00:50)** : preuve réelle impossible cette nuit (la rédaction IA remplit déjà l'Univers de Mode ;
  0 question des champs retenus évitable depuis le correctif A10 du 11/10). Interrupteur fail-closed
  `profiles.beta_flags.memoire_categorie` puis `coin_config.memoire_categorie_ouverte` (`src/utils/memoireChamps.js`).
