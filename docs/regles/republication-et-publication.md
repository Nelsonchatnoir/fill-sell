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
- **Cadence (04/10)** : ~~plafond Premium **50**/jour~~ — ⛔ **plus aucun plafond par jour depuis le 24/10** (décision
  de Nico, section en fin de fichier) ; tout changement de `coin_config` est daté et journalisé (`coin_config_journal`).

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
> ⛔ CADUQUE depuis le 24/10 : la limite du jour n'existe plus (section « 24/10 après-midi » en fin de fichier). Ce
> qui suit est l'historique ; la trace `retenue_republication` ne porte plus que le motif « pause ».
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
- **ÉTEINTE à la livraison (18/10 00:27)** : preuve réelle impossible cette nuit (la rédaction IA remplit déjà l'Univers de Mode ;
  0 question des champs retenus évitable depuis le correctif A10 du 11/10). Interrupteur fail-closed
  `profiles.beta_flags.memoire_categorie` puis `coin_config.memoire_categorie_ouverte` (`src/utils/memoireChamps.js`).

## Règles (18/10 — chantier « zéro orange »)
- **Pause anti-robot des LECTURES** (`_shared/pause-antirobot-vinted.js`, get-pending-jobs) : deux articles distincts
  de SA boutique (garde « boutique_ok », jamais une session absente) refusés par l'anti-robot après le dernier succès
  suffisent, même sonde du compte à 200, à mettre en pause les republications Vinted qui lisent leur annonce ; retraits,
  publications et recréations continuent ; une sonde toutes les 45 min ; jamais « à toi » au bout de 6 h dans ce cas.
- **Deux postes, deux boutiques** (`_shared/poste-extension.ts`) : la boutique Vinted est connue PAR POSTE (preuves de
  dépôt, gardes, poll 0.6.126 `vinted_identite` / `sessions_poste`) ; avec ≥ 2 postes vivants et ≥ 2 boutiques, un job
  Vinted va au poste ouvert sur la boutique de l'article ; le mur d'une plateforme est tenu par poste. La recréation
  d'une republication Vinted relit la boutique AVANT le formulaire (0.6.126) : autre boutique = attente, rien rempli.
- **Coupures techniques** : une seule signature (`CANAL_RE`, `_shared/etat-job.js`), lue sur le message ET
  `error_technique.brut` ; une republication avant retrait coupée repart seule (« En pause »), jamais un bouton « Relancer ».

## 18/10 après-midi — « zéro friction » : une question ne part que si l'information n'existe nulle part (rapport `docs/enquetes/zero-friction-1810/RAPPORT.md`)
- **Mesure** : `champ_requis_bloquant` nomme le champ depuis le 10/10 (pas de « ? ») ; depuis le 18/10 chaque ligne porte
  `champ_cle` et `affiche_le`, et « complete » / « retiree » disent **par qui** (`par` = personne : un geste dans le bloc de
  questions ou une réponse notée ; moteur : IA arrivée après, mémoire, rayon) et **au bout de combien** (`delai_s`). Une
  « vraie » question = levée par la personne, abandonnée ou partie sans la plateforme. Bilan :
  `questions_publication_bilan(debut, fin)` (avant le 18/10 : levée ≥ 20 s après l'affichage = la personne).
- **Taille enfant, tranche Vinted** (`childSizes.tailleEnfantSelonLeTexte`) : « 3-6 mois / 62 cm » (rangée par la table
  sur sa borne haute) suit le TEXTE du vendeur quand le titre, puis la description, nomme UNE seule des deux bornes, seule
  (« Pyjama 3 mois » → « 3 mois (54-60 cm) ») ; « 12-18 mois », « 3 à 6 mois », les deux bornes nommées : la table, comme
  avant ; jamais une taille hors de la tranche. Rejeu des 7 j : 11 → 5 tailles Beebs différentes du choix de la personne
  (les 5 restantes : titres « 12-18 mois », vraie ambiguïté — parc : 11 « 18 mois » / 7 « 12 mois »).
- **Dimensions eBay, UNE question** (`regles.questionsAPoser` → `questionDimensions`, `estDimensionEbay` : Longueur,
  Largeur, Hauteur, Profondeur, Épaisseur, Diamètre — noms exacts ; « Longueur de la robe » n'en est pas une) : deux
  dimensions ou plus forment la carte « Dimensions » (un champ par dimension), une ligne de télémétrie, une question dans
  « N questions ». Ce n'est pas devinable (39 des 42 décorations murales du 18/10 n'avaient aucune mesure dans le texte,
  les photos ni les autres annonces) : la question reste, regroupée. Une mesure n'est jamais inventée (garde
  `mesureLueDansLeContexte`).
- **Leviers IA (banc `scripts/bancs/zero-friction/banc-ia.mjs`)** : l'existant (Haiku 4.5, texte) ne change pas ; une
  CASCADE ne part que sur les champs qu'il laisse vides, champ par champ (`ia_leviers_bascule`, nés « fantome », bascule et
  retour arrière automatiques — `docs/regles/base-supabase-et-fonctions.md`) : Leboncoin Produit / Support / Univers
  (hors feuilles Maison & Jardin) → Haiku 5.5 texte, liste entière ; Beebs Âge → lecture des photos puis texte. Non
  branchés (en recul au banc) : paires « Univers et produit », Genre des livres, photo directe, Sonnet. Le client envoie
  `plateforme`, `categorie`, `inventaire_id`, `photos`, `feuille_dependante` et la clé de chaque champ ; un client d'avant
  garde le chemin d'hier. Selftests `zero-friction`, `ia-leviers`.

## 18/10 soir — « finition » : une remise en ligne Vinted se prouve par l'annonce, jamais par l'adresse (Régis ; rapport `docs/enquetes/finition-1810/RAPPORT.md`)
- **Vinted, depuis au moins le 12/10, renvoie vers `/member/<vendeur>` après un dépôt réussi** (plus vers /items/<numéro>) :
  le content script meurt avant de répondre (« canal coupé ») sur ≈ 100 % des recréations du parc ; elles sont prouvées par
  la relecture du dressing. **Le dressing vu par son propriétaire liste les BROUILLONS d'abord** : un compte à ≥ 96
  brouillons (Régis : 99) a une page 1 sans aucune annonce active — la copie n'y est jamais vue.
- **Règle** : un dépôt réussi se reconnaît par la PRÉSENCE de l'annonce (numéro inconnu, même titre, même boutique, mise en
  ligne pendant un de NOS envois [envoi − 2 min, envoi + 20 min], jamais avant le retrait), jamais par l'URL d'arrivée.
  Sur un compte dont la page 1 du dressing est pleine de brouillons (≥ 90) et dont l'extension est d'avant la 0.6.128
  (sa relecture ne lit que la page 1), une republication Vinted retirée dont un essai a eu lieu n'est **plus resservie
  automatiquement** : un relevé AUTOMATIQUE n'importe aucun article neuf (règle du 05/10), il ne prouve donc rien — vu en
  réel le 18/10 (Régis, 18:56 : relevé « serveur:verif_redepot » 188/188, 0 créé, recréation resservie, 2e copie). Seul un
  relevé fait par la personne (Synchroniser) importe la copie, que la base rattache (`inventaire_a_rattache_recreation_vinted`,
  une copie de plus part par le circuit de retrait) ; sinon la question au bout de 6 h. Tout autre compte : servi comme
  avant. Une copie déjà au stock = la question. Modules : `_shared/recreation-vinted-verifiee.js` (get-pending-jobs),
  `_shared/recreation-vinted-envois.js` (update-job-status). Selftest `recreation-vinted-verifiee`.
- **L'heure du retrait est celle de Vinted** (en-tête Date du /delete, `suppression_verdict.date_serveur`) ; ses repères
  (`deleted_at_serveur`, `deleted_at_client`) ne s'effacent plus (défaut corrigé : posés sans « touche », ils étaient
  jetés quand `deleted_at` était égal) ; **tous** nos envois sont gardés (`recreation_envois`, 30 au plus).
- Extension 0.6.128 : la reconnaissance saute les brouillons et lit jusqu'à la première page qui contient des actives ;
  `/member/<id>` ne conclut jamais à l'échec (`depot_incertain`, sans retentative comptée).
- **Titre Vinted « trop de symboles »** (décision de Nico : on corrige seul) : `_shared/titre-symboles-vinted.js` —
  « — » → « - », « … »/« ... » retirés, « – » collé à un symbole → « - », suite ≥ 3 symboles réduite ; marque masquée ;
  servi par get-pending-jobs (publication et republication), un refus « symboles » repart une fois en mode strict
  (pas-de-rouge, questions-tranchées règle 7). 0 titre accepté changé sur 70 555. Selftest `titre-symboles-vinted`.
- **Quota gratuit** : une republication compte UNE fois par article (exécutée ou en cours), jamais par essai ; un retrait
  n'est pas une republication (`quota_republication_free_etat`).

## 18/10 soir — L'ACCESSOIRE D'UN OBJET N'EST JAMAIS L'OBJET ; les bilans lisent « plateforme décochée » (feu vert de Nico)
- **Règle** (tout le parc, les quatre plateformes) : « housse de… », « taie de… » (et la faute « house de… ») suivis d'un
  objet nomment l'ACCESSOIRE, jamais l'objet (couette, coussin, canapé, oreiller, ordinateur…). Deux endroits, la même
  règle : (1) l'option d'une liste fermée qui dit CE QU'EST l'article (Type, Sous-type, Produit, Catégorie, Univers —
  `_shared/option-du-texte.js`) : l'option de l'objet ne vaut jamais ; seule une option qui nomme l'accessoire (Housse,
  Housse de coussin, Taie d'oreiller, Étui…) répond, sinon la QUESTION — jamais une autre option lue à côté (« Lot »,
  un personnage) ; (2) le mot du titre qui choisit la CATÉGORIE (`detectObjectKeywordDetail`, `src/utils/shared.js`) :
  le mot de l'objet n'est jamais celui de l'article, un titre qui COMMENCE par l'accessoire (« Housse pour objectif
  appareil photo », « Lot de 4 housses… ») ne nomme que lui ; une règle qui nomme l'accessoire (« housse de couette »,
  « taie d'oreiller », « drap housse ») reste. Les mots qui nomment l'accessoire lui-même (« de protection », « de
  transport », « étui ») se sautent jusqu'à l'objet ; un « pour … » juste après nomme un objet de plus ; sans « de »,
  seulement quand le texte commence par l'accessoire ; « drap(s) housse(s) » EST l'article ; un objet nommé AVANT
  l'accessoire (« Couvre-lit … avec taies ») reste l'article.
- ⛔ Les autres champs (Thème, Couleur, Matière, « Adapté à »…) ne changent pas : pour un accessoire, l'objet y est souvent
  la bonne réponse (« Housse pour iPad » → Adapté à : iPad ; « Housses de Noël pour coussins » → Thème : Noël).
- **Preuve** : banc du parc (sans IA, lecture seule, code d'avant au commit f0d74a8 puis d'après) : 420 titres qui disent « housse / taie / house », 47479 lectures — 675 changent, sur 73 titres (56 mots de catégorie, 87 feuilles des 4 plateformes, 532 options de listes), toutes l'objet de l'accessoire retiré ou l'accessoire posé ; 177830 lectures de 2 000 titres témoins : 0 changement ; vérité des vendeurs (Leboncoin, Beebs, 612 cas) : 100 justes / 23 faux avant, 100 / 23 après ; rejeu eBay de la semaine identique (156 → 27). Banc `scripts/bancs/accessoire/banc-accessoire.mjs` ; selftest `accessoire-objet`.
- **Bilans** (migration `20261018240000`, lecture seule) : une question disparue parce que la plateforme a été décochée
  (`plateforme_decochee`, app 2.9.103) compte dans les ABANDONS de `questions_publication_bilan` et de
  `champs_requis_veille`, avec sa colonne `plateformes_decochees`.

## 19/10 — LA TAILLE ÉCRITE DANS LE TITRE OU LA DESCRIPTION (DeadRoz, Ornella ; règle de Nico)
- **Règle** (tout le parc, Beebs, Vinted, Leboncoin, eBay ; aucun appel IA) : `_shared/taille-du-texte.js`. Quand la
  taille de la copie ne passe pas la grille (ou qu'elle est vide), la taille que la copie ET le texte du vendeur (titre,
  description ; fiche puis copie) disent, dans cet ordre : FR écrit (« FR50 », « W36 L34 (46) ») ; à défaut le W converti
  par la table que Vinted publie (`FR_PAR_TOUR_DE_TAILLE`, W hors table jamais deviné) ; l'âge en mois (« 24M »,
  « 18 mois »). Posée = UNE option exacte de la grille du rayon, placée par le jugement de l'écran (childSizes, tailles.js).
- ⛔ **La question reste** : copie et texte en désaccord, deux tailles, fourchette, W hors table, adulte + mois, âge hors
  étiquette, aucune option. ⛔ **Jamais** : une valeur que la grille porte déjà, une copie illisible (« EU 38 »), un nombre
  nu (« taille 38 »), EU/UK/US, les années, « 1M », une durée (« porté 3 mois »), une pointure (champ ou rayon chaussures).
- **Branchements** : `moteur/listes.js` (`jugerValeurContreListe` en dernier recours avec textes, `tailleDuJob` — copie vide
  avec textes —, `tailleDansListeEbay`, `tailleDeduiteDuTexte`) ; écran : ligne « missing » d'une taille = option déduite
  (`deduit.source = taille_du_texte`, jamais bloquante) posée sur la copie de la plateforme (`setPlatformDedicatedField`,
  trace `option_du_texte`) ; carte du rayon (`classerChamps` avec `textes`) ; handler-watch (`reponseTailleAuto(job,
  tailleFiche, textes)`, R5 après R0 → R4). Sans textes, chaque fonction rend exactement ce qu'elle rendait.
- **Preuve** : rejeu 7 j `scripts/bancs/tailles-titre/rejeu-tailles.mjs` (205 → 96 questions ; valeur connue 66 → 21 ;
  0 différente d'une réponse humaine) ; 90 j d'annonces publiées : 1 015 tailles qui passaient → 0 changée ; banc du
  moteur réel `scripts/apercu/capture-moteur-taille-titre.mjs`. Selftest `tailles-titre`. Rapport :
  `docs/enquetes/tailles-titre-1910/RAPPORT.md`.

## 19/10 soir — LA TAILLE UNIQUE (Sébastien ; règle de Nico)
- **Règle** (toutes plateformes, aucun appel IA) : `tailleUniqueDuVendeur` dans `_shared/taille-du-texte.js`, en tête de
  `tailleDuTexte` (mêmes branchements : écran, eBay, job, carte du rayon, handler-watch R5). Une taille unique écrite par
  le vendeur (« Unique », « TU », « T.U », « T. unique », « Taille unique (TU) », « One size », « OSFA » sur la copie ;
  copie VIDE : « taille unique », « taille universelle », « T.U », « one size », « TU » isolé en capitales dans le
  texte) → L'option de taille unique de la grille du rayon, écrite comme elle (« Taille unique », « Universel »,
  « One size », « TAILLE_UNIQUE »), une seule. Dictionnaire : `memeTaille` de `tailles.js` (non recopié).
- ⛔ **La question reste** : grille sans taille unique (eBay « Costumes » : la djellaba de Sébastien), autre taille dite à
  côté (« taille 38 », « T:36 », FR/W/mois, « Taille unique / L »), négation, deux options uniques. ⛔ **Jamais** : une
  copie qui porte une autre taille, « unique » seul (« pièce unique »), « universel » dans un texte, « TU » suivi d'une
  majuscule ou après un mot en capitales, une pointure.
- **Preuve** : rejeu symétrique `scripts/bancs/taille-unique/rejeu-taille-unique.mjs` (écran 7 j 99 → 99, serveur 7 j
  0 écart, 90 j publiées 0 changée) ; banc du moteur réel 8/8 ; selftest `taille-unique`. Rapport :
  `docs/enquetes/taille-unique-1910/RAPPORT.md`.

## 22/10 — la réponse à une plateforme ne réécrit jamais la fiche (Louis, DeadRoz ; rapport `docs/enquetes/cinq-points-2210/RAPPORT.md` § 4)
- « ✋ Compléter » (StockTab `NeedsUserModal`) ne remplit qu'une case VIDE de la fiche et n'écrit jamais « Autre » —
  comme l'écran Publier. Avant : la réponse dans la grille d'UNE plateforme écrasait la taille de la fiche au rang
  « manuel » (34 fiches en 30 j). Johan (21/10) : les questions venaient de fiches Lens SANS taille — rien à traduire.

## 22/10 soir — le contenu du vendeur part tel quel ; pause de la file ; synchro devant la file (rapport `docs/enquetes/lot-2210-soir/RAPPORT.md`)
- **Fiche importée pas encore lue = pas de départ** (`_shared/contenu-fiche.js`, `lectureOrigineEnAttente`, même règle au
  Stock, au lot et dans get-pending-jobs) : Vinted attend la description (détail lu par l'extension ≥ 0.6.130 ou l'app
  sur l'ordinateur) ; Leboncoin / Beebs / Depop attendent la capture de l'annonce d'origine (relevé de veille
  `serveur:lecture_origine`) ; eBay jamais (API). Jamais une attente sans fin : lecture faite (`lectures_origine_demandees.
  faite_le`), annonce Vinted disparue, annonce d'origine disparue ou déjà lue → on part. Phrase : « En cours de lecture
  de ton annonce d'origine… », jamais une erreur.
- **Au départ** (get-pending-jobs, `contenuAImposer`) : une copie rédigée AVANT la lecture du vendeur, ou avant la règle du
  21/09 (`REGLE_TEXTE_VENDEUR_LE`), reçoit son texte (conformé), son état (jamais dégradé ; Depop en vocabulaire Vinted)
  et toutes ses photos (chez nous seulement, sinon `photos_a_rapatrier`) ; la copie en base est corrigée
  (`contenu_du_vendeur`). Jamais au-dessus d'un choix (copie rédigée après la lecture, photos retouchées). Une
  republication VINTED n'est jamais retenue ni touchée (recréée depuis l'annonce en ligne). Selftest PERMANENT
  `contenu-du-vendeur`.
- **Pause** (`file_pause_basculer`, `platform_settings.file_pause`) : rien de ce qui n'a pas commencé ne part ; un retrait
  n'est JAMAIS en pause ; une republication retirée va au bout. **Synchro de la personne** (déclencheur bouton / app, < 10
  min) : servie devant la file, seuls retraits et republications retirées partent avec elle ; l'extension ≥ 0.6.130
  s'arrête entre deux tâches et relance un poll. **Garde absolue** : aucun relevé de la plateforme entre le retrait et la
  recréation d'une republication (déclencheur `garde_releve_pendant_republication`, get-pending-jobs).
- (22/10 nuit) **En republication, l'état de la fiche ne descend jamais** (`contenuAImposer`) : un état de copie plus BAS
  que celui de la fiche remonte, quelle que soit la date de lecture ; plus haut, jamais touché. Leboncoin : l'état qui part
  est `lbcAspects.condition` (posé avant `platform_fields.etat`) — c'est lui qu'on compare, et get-pending-jobs ne repose
  plus le critère « État » de l'ancienne annonce sur une copie marquée `contenu_du_vendeur` (raison `etat`).
- (22/10 nuit) **Vinted : la capture corrigée par la fiche** (`_shared/capture-corrigee.js`), seulement pour une annonce
  déposée par FillSell (jamais `vinted_sync`) : œuvre d'art hors du rayon des œuvres → « Peintures » / « Affiches et
  reproductions » ; état plus bas que la fiche → état de la fiche (`etat_fiche_avant_capture` noté à l'étape
  `a_capturer`, car la capture réécrit l'état de la fiche). Corrigée à l'étape `captured`, avant tout retrait.
- (22/10 nuit) Une annonce ne se republie pas deux fois en 24 h (`cadence_24h`) : une correction ratée attend la suivante.

## 23/10 — toutes les photos d'origine, en pleine taille ; retenue au départ ET au démarrage ; hors quota ; annonce morte jamais republiée ; questions au repos du moteur (rapport `docs/enquetes/lot-2210-soir/RAPPORT.md` § « 23/10 »)
- **Une fiche importée ne part jamais avant TOUTES les photos de son annonce d'origine** (`lectureOrigineEnAttente`,
  `_shared/contenu-fiche.js`) : eBay attend comme Leboncoin / Beebs / Depop — la LISTE eBay (relevé API ou Hub) ne porte
  qu'une vignette de 140 px ; le DÉTAIL (GetItem, Browse, page capturée) vaut lecture (`detail_le`). Lue, une annonce qui
  porte plus de photos que la fiche (restée à la vignette ou à sa copie chez nous) attend encore ses photos, 24 h au plus.
  La phrase : « En cours de lecture de ton annonce d'origine eBay… Rien à faire » — jamais une erreur.
- **Retenue au démarrage** (`controler_job_extension`, migration 20261023110000) : une publication marquée
  `attente_lecture_origine` ne démarre pas, même déjà servie à une extension qui la tient en mémoire (≤ 0.6.129 ne relit
  pas la file entre deux tâches), et rien de ce poste n'y écrit (ni failed, ni needs_user, ni pending) ; un résultat réel
  (published) passe toujours. L'extension ≥ 0.6.131 lit ce refus (409) comme « laissé en file », sans rien écrire.
- **Au départ, la copie reçoit les photos de la fiche** quand la base les a remises sur la fiche APRÈS la copie
  (`photosRemplaceesLe` = journal `photos_origine_completees`), même nombre ou plus : vignette, version réduite → toutes
  les photos de la fiche, dans l'ordre, rapatriées chez nous d'abord. Vinted : à la recréation, `photosDeLaFicheALaRecreation`
  remplace les photos de la capture (étape `captured`, avant tout retrait ; photos pas encore chez nous → l'annonce reste
  en ligne, la recréation attend).
- **Hors quota** (migration 20261023120000) : une republication que FillSell fait pour réparer SA faute porte
  `platform_fields.hors_quota` (script de réparation seulement) et n'entre dans aucun compte de quota (plafond mensuel,
  quota gratuit, affichage, places). Les 35 republications de Thierry du 23/10 : prix 0, hors quota.
- **Une annonce dont l'absence est établie ne repart pas en republication automatique** (`republish_planifiee_candidats`,
  hors Vinted, migration 20261023140000, motif `annonce_introuvable`) : dépôt signalé « plus en ligne » (sale_signal
  `unavailable`) ou republication close « disparue » sur CET identifiant, et aucun relevé ne l'a revue depuis. Un relevé
  qui la revoit lève la garde. La question « vendue ? » du dépôt reste la seule (jamais une double vente manquée).
  L'extension ≥ 0.6.131 : une lecture incomplète (403) avant tout retrait ne pose JAMAIS de question — nouvel essai toutes
  les heures, close sans bruit après 24 h (annonce intacte) ; la plateforme est nommée.
- **Les questions attendent le repos du moteur** (stepper, `ListingPreviewScreen` + `EcranConfirmer`) : à l'arrivée sur
  « Confirmer », aucune question — ni à l'écran, ni au journal (`champ_requis_bloquant` « affiche ») — tant que le moteur
  n'est pas au repos (preparationAuRepos, la règle du lot) depuis 1,2 s (`REPOS_AVANT_LECTURE_MS`), 45 s au plus ; une
  fois montrées, elles restent. Au journal, rien de NOUVEAU non plus pendant un changement de rayon ou la relecture du
  catalogue des champs.
- **« Casque » seul ne dit pas quel casque** (`familleDuCasque`, `src/utils/shared.js`) : la marque (Oxelo, Decathlon,
  B'Twin, Quechua, Wed'ze… → ⛑️ ; Scorpion, Shark, Bullit… → 🪖 ; Sony, Bose, JBL… → 🎧), un tour de tête en cm (44-64), le
  contexte (vélo, ski, roller, chantier / moto, intégral / bluetooth, gaming…) ; UNE famille signalée donne son icône ;
  aucune, ou audio et protection ensemble : la règle d'avant. Rejeu : 572 fiches « casque », 16 changent (toutes des
  casques de protection ou de moto), 0 casque audio ne bascule.

## 24/10 — tailles des jeans, âge, rayon Beebs, relance après un dépôt mort (rapport `docs/enquetes/lot-2410/RAPPORT.md`)
- **Tour de taille d'un jean (W/L)** lu partout où il est écrit : fiche, titre, description (« 33/34 », « W33 L34 »,
  « W33 », « 33 US », « taille 33 »), jamais un prix, une dimension en cm, une année ou une pointure
  (`_shared/taille-du-texte.js`, `lireTourDeTaille`). Il se TRADUIT dans la grille de chaque plateforme (Vinted : table
  W → FR de `_shared/taille-de-service.js` ; Beebs, Leboncoin : la taille FR ; eBay : la valeur W de la liste ; Depop :
  le W lui-même sur les grilles « bottoms » 62 et 24, plafonds 40 et 34) — jamais une approximation lâche
  (`findMatchingOption` refuse un « 34 » pour un W34 tant que la grille n'est pas une grille de W). Certain = aucune
  question ; deux tailles différentes lues = la question reste.
- **Âge en années** (« 8 ans », « 10-12 ans ») lu dans le texte pour un article enfant ; jamais une durée (« porté 2
  ans », « garantie 3 ans ») ni un âge d'adulte.
- **Rayon Beebs « neuf seulement » ou enfant / adulte** : un état d'occasion sur un rayon neuf, ou une taille d'adulte
  sur un rayon enfant (et l'inverse), est dit sur la ligne du rayon (`rayonPublicIncoherent`, `messageRayonNeuf` avec
  la plateforme), jamais caché derrière une question de taille.
- **Une relance ne repart jamais avec l'annonce morte du dépôt d'avant** (`src/utils/relanceDepotMort.js`) : quand le
  dépôt précédent est PROUVÉ jamais en ligne (`platform_fields.depot_jamais_en_ligne`), « Relancer » efface son numéro,
  son lien et ses traces (lbc_depot, signaux de disparition…), archivés sous `relance_apres_depot_mort` ; « Relancer
  par copie » n'hérite plus de ces traces (`RELANCE_COPIE_CLES_RETIREES`). Sans cette preuve, rien ne change. Cas :
  Raiponce de louis-seller (relancée le 23/10, redéposée sous 3293872836, le job gardait 3290885485).

## ⛔ 24/10 matin — une republication ne repart jamais avec un tour de taille lu comme taille française (décision 1 de Nico ; rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 matin »)
- Une republication recopie la taille de l'ancienne copie (`spend_coins_and_republish`) ; celles d'avant le 23/10
  portaient le W ou la longueur d'un jean comme taille française (« W34 L34 (44) » → « 34 », un XS ; la grille Beebs
  homme a « 34 »). `get-pending-jobs` (v277), Beebs et Leboncoin, publication et republication : pour un bas au W
  CERTAIN (réponse de la personne « W34 | FR 44 » d'abord, sinon un seul W au titre ou à la description), un nombre
  nu égal au W ou à la longueur est servi en taille française du W (table publiée par Vinted), avec sa trace
  `taille_corrigee_par_le_w`. Tout le reste passe inchangé (autre nombre = choix de la personne, lettre, deux W,
  « 32/34 », W hors table). La fiche et la base ne sont jamais réécrites. `_shared/taille-corrigee-par-le-w.js`,
  selftest `taille-corrigee-par-le-w`.
- Leboncoin homme : grille en lettres seulement et aucune table homme publiée (règle du 28/09) — la taille reste au
  choix de la personne ; jamais « 34 ».
- Avant de republier pour une taille : la relire EN LIGNE (24/10 : les « 4 tailles 34 » n'étaient que dans les
  copies ; en ligne, une seule annonce sans taille méritait une republication).

## ⛔ 24/10 après-midi — PLUS DE PLAFOND DE REPUBLICATION PAR JOUR (décision de Nico ; rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 après-midi »)
- Aucun plafond par jour, pour aucun palier, nulle part : base (`republish_plafond_palier` supprimée, migration
  `20261024200000`), distribution (`get-pending-jobs` v278), configuration (clés `republish_plafond_jour*` retirées,
  `20261024210000`). Ne JAMAIS réintroduire un plafond journalier sans décision de Nico ; une « valeur énorme » en
  configuration n'est pas une suppression.
- Seul frein de distribution : la **pause de 2 h après 50 republications d'affilée** (`republish_pause_apres`,
  `republish_pause_duree_min`, séquence lue sur les republications réussies). Les quotas du mois, les espacements par
  plateforme et le disjoncteur d'échecs ne bougent pas.
- Republication planifiée : le nombre par jour d'une plateforme (et d'une boutique Vinted) est un choix FACULTATIF de
  la personne — NULL = sans limite, aucun maximum de palier ; un NULL ne doit jamais devenir 0 (`GREATEST(0, NULL)`
  vaut 0 : toujours un `CASE`).
- Textes : plus aucune phrase « limite du jour », « repart à minuit », « N par jour (toutes plateformes) » ; les
  phrases de la pause restent. Selftest `plus-de-plafond-par-jour`.
