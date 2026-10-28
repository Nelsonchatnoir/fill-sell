# Republication, publication (unité et lot), cadence et quotas de republication

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 26/10 nuit — « Ta file » : annuler ce qui attend (Tout annuler, par ligne) — jamais l'en cours, une annonce retirée ni un retrait (en fin de fichier)
- 26/10 nuit — la relecture avant redépôt passe devant, relancée puis dite ; en relecture, une annonce ne retient que sa plateforme (en fin de fichier)
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

## ⛔ 24/10 soir — « ZÉRO BLOCAGE » : ce qui se déduit se remplit, ce qu'une plateforme refuse n'entre pas en file (décision de Nico ; rapport `docs/enquetes/zero-blocage-2410/RAPPORT.md`)
- **Seules exceptions** : se connecter, finir son compte vendeur, compte restreint (et les gardes voulues : doublon
  possible, vente à confirmer). Tout le reste est de notre fait et se classe à part
  (`_shared/cause-blocage.js` : utilisateur / garde / plateforme / nous ; un abandon après un échec de notre fait est un
  ÉCHEC) — section rouge d'ops-digest, mesure `scripts/zero-blocage-mesure.mjs`.
- **B1 / B2 eBay (écran)** : le Département se recalcule pour la catégorie QUI PART (genre, ou Département posé pour
  une autre catégorie — table unique `moteur/departementEbay.js`) ; une liste fermée à UNE valeur se pose d'office
  (jamais marque, modèle, stockage, ni une taille écrite) ; MPN inconnu = « Ne s'applique pas » ; une valeur refusée
  remonte l'encart sur la catégorie du job. **B8** : jamais « Tout est complété » sous « Pas publié ».
- **B3 / pays** : un état Vinted se lit par son identifiant (15 langues) ; une liste d'états étrangère se lit en
  français (`utils/catalogueListes.etatsVintedEnFrancais`) ; couleurs des pages IT/ES/DE/NL/PT traduites
  (`utils/vintedColors.js`) ; « COULEUR INTROUVABLE » → une reprise, couleur recalculée depuis la fiche. Le catalogue
  partagé ne s'écrit jamais dans la langue d'une page étrangère (migration `20261024220000`, à valider).
- **B4 titres** : jamais un titre vide, fait de symboles, générique ou égal au nom d'une plateforme
  (`titre-du-job.titreRecevable` : le titre de la fiche le remplace ; l'app refuse la réponse) ; le refus « symboles »
  se lit dans toutes les langues de Vinted ; un mot sans aucune lettre latine (han, kana, hangul, arabe, hébreu, thaï)
  part quand 3 mots latins restent (serveur `retirerMotsNonLatins` = extension). Cyrillique et grec intacts.
- **B5 Depop** : la copie d'une republication se complète avant le départ (`_shared/copie-republication-depop.js`) :
  dépôt FillSell de la même annonce (lien, numéro, produit Depop — jamais un job de SUIVI du relevé) → annonce en ligne
  relevée → fiche ; jamais par-dessus une valeur de la copie ; un rayon seulement s'il désigne une feuille ; l'état suit
  la fiche. **Vinted** : « Espace de stockage » et « Simlockage » repris de la capture (extension 0.6.134).
- **B6 (inchangé)** : rien n'est retiré sans recréation prouvée possible. Un accident avant retrait (formulaire pas
  rendu, sélecteur, canal) n'est jamais un geste : file espacée 5 / 20 / 60 min puis 3 h ; une recapture incomplète
  pour une erreur passagère se refait seule ; l'upload d'une photo se réessaie (republish-capture-photos).
- **B7** : une republication (auto OU demandée) d'un article que la plateforme refuse est close tant que rien n'est
  retiré (Depop : électrique, etc.) ; l'app ne la propose plus (`repubEtatPlateforme` → `interdit`).
- **Marque Vinted (remplace la règle du 17/10)** : une marque introuvable ne bloque jamais — identifiant seulement si
  l'envoi direct est prouvé, sinon la même marque sous une autre écriture (une seule), sinon « Sans marque » quand le
  rayon le propose ; jamais une marque inventée. La pause « marque » n'est jamais permanente (gpj : marque du catalogue
  relâchée, au plus toutes les 6 h ; sinon vers un poste ≥ `BUILD_VINTED_MARQUE_CHAINE`).
- **Leboncoin** : la mémoire « annonce morte » de l'extension tombe dès qu'un relevé a revu l'annonce, sur TOUS les
  chemins (0.6.134) ; une lecture « vendue » n'est jamais « introuvable » (republication close) ; un relevé qui pose
  `disparu_le` ou lit la vente tranche.
- **Colis Vinted** : une correction de rayon ne change jamais de famille de grille (`capture-corrigee.js`).

## 24/10 nuit — Beebs : les homonymes « Taille » ; « Alimentation » se déduit (décisions 4 et 5 de Nico ; rapport `docs/enquetes/lot-2410-nuit/RAPPORT.md`)
- **Un homonyme « Taille » reçoit la taille de la fiche, TRADUITE dans sa liste** (pyjama d'alizeed48 :
  « Taille [attributes.women_bras] » = bonnets 75A…115L ET lettres XXS…9XL) : `tailleHomonymeBeebs` (listes.js), même
  jugement que la clé nue — « S / 36 / 8 » → « S », « M / 38 / 10 » → « M » ; jamais une conversion (« 40 » n'est pas un
  col de 40 cm, « 38 » pas un 85B) : rien de sûr → la question. Une clé positionnelle (« Taille [#2] ») n'est jamais une
  question (ni l'extension ni le serveur ne l'écrivent).
- **« Alimentation » se déduit ; la question seulement au vrai doute** (`_shared/alimentation-beebs.js`, branchée dans
  `deduireOptionDuTexte`) : ce que le texte dit (« 3 piles AAA », « piles non fournies » → Avec pile ; « batterie
  rechargeable » → Avec batterie ; « secteur » → Filaire ; « fonctionne sans pile » → Sans) ; rien de dit sur un rayon de
  jeux électroniques → « Avec pile » ; véhicules télécommandés (pile ou batterie), Montessori, « sans piles » seul, deux
  alimentations dites → la question (les deux en tête). Jamais par-dessus une réponse.
- Restent à trancher (Nico) : Bijoux femme (liste des bagues sans « Taille unique ») ; tailles EU femme sur une liste FR.
- Preuves : `selftest:lot-2410-soir` § 3 et 4.

## ⛔ 25/10 nuit — un dépôt ou une remise en ligne COUPÉS se tranchent au relevé (règle de Nico ; rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 1a)
- « Rattacher si l'annonce existe, relancer une fois si elle n'existe pas, jamais des jours en « à confirmer » » :
  `_shared/depot-coupe-tranche.js`, appliqué par handler-watch (v127) à chaque passage, sur les questions
  `recreation_deja_partie` (remise en ligne Leboncoin/Beebs) et `depot_deja_parti` (dépôt Beebs). Vinted a sa règle
  (`recreation-vinted-verifiee.js`).
- **Encore en ligne** (relevée depuis l'essai) et désignée par l'identifiant conservé ou par les photos de NOTRE copie
  (seule, `trancherParPhotos`) → rattachée (`published`), aucun redépôt. Photos sans empreinte (candidates jamais
  empreintées : cause du 21/10) → `empreintes-urls` les calcule (2 appels/passage), rejugé au passage suivant.
- **Plus en ligne** — absente de DEUX relevés complets du compte commencés après sa dernière vue (lue sur TOUTES les lignes
  du numéro : boutique partagée louis / louis-seller), ou datée disparue — **ou aucune annonce apparue** (relevé complet
  commencé ≥ 1 h après l'essai) → le job repart UNE fois (`relance_depot_coupe`, vérification datée
  `recreation_verifiee` / `depot_verifie` : get-pending-jobs ne repose pas la question pour le même essai ; un NOUVEL essai
  coupé est revérifié). Trace `usage_logs` `depot_coupe_tranche`.
- **Doute réel** (une annonce encore en ligne qu'aucune preuve ne désigne, ou deux dépôts pour une annonce : appariement
  mutuel) → la question reste. Déjà relancé une fois par la règle → plus rien d'automatique. Jamais titre, prix ou date.
- Preuves : `selftest:depot-coupe-tranche` (fixture relevée en prod : louis, 21/10) ; premier passage réel le 25/10 à
  00:27 : 6 relances (louis ×2, Ciddjy ×4), conformes à l'essai à blanc.

## ⛔ 25/10 nuit — un accident AVANT tout retrait n'est jamais un geste (règle A5 du 24/10, appliquée au parc par le serveur ; rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 1c)
- `_shared/accident-avant-retrait.js` : une republication Vinted arrêtée AVANT le retrait (étape `a_capturer`/`captured`)
  par une coupure (onglet de dépôt muet, canal coupé, page rechargée, même coupure répétée) repart SEULE, espacée
  5, 20, 60 min puis 3 h (`reprise_avant_retrait` ; au-delà de 3, la sentinelle la compte) ; jamais au-delà de `captured`,
  jamais un article qui n'est plus en stock.
- update-job-status (v148) ne pose plus « Relance-la » / « ferme Chrome » sur ces arrêts ; handler-watch (v128+) remet en
  file ceux déjà en base (100 lus, fiches lues en un lot, aucune ligne inchangée réécrite). Premier passage : exactement
  Deborah 83206086 et Jocabroc bfe46249 (essai à blanc : 2 sur 35) ; Jocabroc republié dans la foulée.
- Un sélecteur de l'extension non résolu AVANT retrait (« [selectors] vinted/publish.photo_input … n'a résolu ») est un
  accident technique : repris comme les autres motifs techniques, même sous une source `prevol_negatif` héritée ; la reprise
  efface la question héritée ; le réveil par capture archive le motif et ferme la question réveillée.
- Une sonde publique NON mesurée (null) ne vaut jamais « toujours en ligne, connexion requise » : pause « introuvable à
  confirmer », le relevé tranche (audit N2, update-job-status).

## ⛔ 25/10 nuit — un titre refusé pour « trop de majuscules » est remis en casse normale SEUL (décision de Nico, point 1d)
- Vinted (seule plateforme qui a ce refus) refuse 7 capitales latines À LA SUITE : espaces et ponctuation ne coupent pas la
  suite, un chiffre ou une minuscule la coupe (0 des 104 048 titres acceptés en 90 j n'y arrive ; la PART de capitales ne
  décide pas).
- `_shared/casse-titre.js` (pur, Node + Deno) : un mot tout en capitales passe en casse normale ; gardés tels quels : la
  marque (fiche/copie), les sigles, les références à chiffres, les chiffres romains, les mots mêlés ; ponctuation et
  espaces intacts ; si des mots gardés dépassent encore, le plus long passe en casse normale (jamais une référence) ;
  impossible → la question. Rien d'autre n'est modifié.
- Branché : au refus (pas-de-rouge, reprise `vinted_titre_recase` UNE fois par job, ancien titre archivé), sur les questions
  déjà posées (questions-tranchees, règle 8), au service (get-pending-jobs : publication et titre de recréation) et dans
  l'app (`moteur/regles.js`). Selftest `casse-titre` (115, cas réels + banc de 3 294 titres acceptés).

## 25/10 nuit — la sentinelle range les vraies causes (audit N1 ; `_shared/cause-blocage.js`, ops-digest v39)
- La vérification anti-robot sur le compte (`verification_antirobot`) et l'annonce d'une autre boutique que celle ouverte
  (`boutique_etrangere`) sont des gestes de la personne ; « Vinted a restreint ton compte » = compte restreint.
- « Arrêtée à ta demande » (féminin, `arretLot.js`) et la marque `arret_utilisateur` comptent comme un ABANDON : un job
  arrêté par la personne APRÈS un arrêt de notre fait reste un échec de notre fait, jamais une annulation (12 échecs
  invisibles avant). « s'interrompt au même moment » est reconnu avec ou sans « chaque fois ».
- Mesure de référence du 25/10 (18 → 25/10, 324 jobs) : 188 arrêts de notre fait, 139 de la personne, 28 plateforme,
  7 gardes (`docs/enquetes/zero-blocage-2410/mesure-nuit-2510.json`).

## 25/10 matin — ISBN tel quel, titres sur une ligne, dépôt incertain, colis, couleur, lecture d'origine (rapport `docs/enquetes/matin-2510/RAPPORT.md`)
- **ISBN (décision de Nico : « l'ISBN de l'annonce d'origine TEL QUEL, et ça part »)** : plus de preuve valeur par
  valeur. `posteRemetIsbnCapture(v, build)` (`_shared/isbn-capture-preuve.js`) : 13 chiffres → poste ≥ 0.6.70 ;
  10 caractères (« 0000000000 » compris) → poste ≥ `BUILD_ISBN_10_TEL_QUEL` (0.6.143 : la sonde du POST arme enfin 10
  caractères — sans elle, « isbn »: null pouvait partir APRÈS le retrait) ; autre forme → retenue. Disjoncteur par
  compte (un refus Vinted sur « isbn » de CE compte retient la valeur). Poste trop ancien → retenue muette (« part dès
  que ton extension se sera mise à jour toute seule »), jamais un bandeau. Les 30 retenues (Rég, Vincent A.) partent
  seules au premier poll d'un poste en 0.6.143.
- **Un titre Vinted servi n'a jamais de saut de ligne** (Vincent A. 9138772c : « lycanthrope⏎Par » tapé « lycanthropePar »,
  copie non reconnue, redéposée → 2 annonces) : get-pending-jobs sert `job.title` et `titre_saisi` sur une ligne ; la
  copie se reconnaît par `memeTitre` (`_shared/titre-copie-vinted.js`, copie exacte dans l'extension : forme normalisée,
  ou forme compacte ≥ 12 caractères) ; à l'étape `deleted`, un `depot_incertain` après le dernier envoi RETIENT la
  republication (toutes versions) jusqu'à la preuve (copie rattachée, ou relevé complet de la personne sans copie) ;
  6 h sans preuve → la question `recreation_deja_partie`. Jamais un second envoi sans preuve d'absence. Doublon réel
  réparé par la règle du 18/10 (garder la 1re copie, retirer l'autre par le circuit) : `20261025_vincent_champavert_doublon.sql`.
- **Colis Vinted** (OBSERVÉ le 25/10 sur le formulaire et `shipping-estimation/…/catalogs/<id>/package_sizes` : 211 Bottes
  hautes, 5267 Toiles et panneaux, 1937 Encadrements = Petit/Moyen/Grand ; 3847 Peintures = 5/10/20/30 kg) : le menu
  dépend du RAYON. A5 strict (`_shared/capture-corrigee.js`) : la correction « œuvre d'art » ne change plus le rayon
  si la grille d'arrivée est inconnue ou n'offre pas le format capturé. Règle 9 de `_shared/questions-tranchees.ts`
  (`_shared/vinted-colis-tranche.js`) : rayon changé par FillSell → recapture dans son rayon (paugues ×2) ; format retiré
  par Vinted du même rayon (id 8 « Lourd (2 kg et +) » disparu des grilles Petit/Moyen/Grand le 15/10) → le plus petit
  format offert de capacité suffisante, sinon le plus grand (Romain : « Grand », le recommandé de Vinted) ; aucune
  question. L'id 8 se nomme selon sa famille (« Lourd (2 kg et +) » / « 5 kg »).
- **Couleur d'une republication Vinted** sans couleur : fiche, sinon dépôt d'origine, sinon mot du titre, sinon
  « Multicolore » (règle couleur_auto du 11/10 étendue), jamais par-dessus une couleur de la capture.
- **Sous-catégorie à choisir** (« …à l'unité ») : pause `rayon_moteur_attendu` (+6 min) pour que le moteur tranche
  avant que la question parte.
- **La lecture de l'annonce d'origine passe devant la file** (Louis, lot de 5 bloqué 10:29 → 10:50) : get-pending-jobs
  retient ce qui peut attendre tant qu'une lecture Vinted demandée depuis < 15 min n'est pas faite (≥ 0.6.130, hors
  pause anti-robot) ; l'extension 0.6.143 lit AVANT ses tâches et trace une lecture ratée (`usage_logs`
  « lecture_origine_echec »). Selftest `lecture-origine-devant`. Ses 5 textes ont été posés depuis ses pages Vinted
  publiques (`20261025_louis_seller_textes_vinted.sql`).

## ⛔ 25/10 après-midi — importer son Vinted puis publier ailleurs : le texte lu AVANT le clic, jamais un écran qui retient (rapport `docs/enquetes/import-publier-ailleurs-2510/RAPPORT.md`, audit `AUDIT-PARCOURS.md`)
- **Cause de Louis (prouvée, reproduite)** : onglet fillsell.app ouvert pendant une mise à jour de l'extension → pont mort
  (les commandes avalées) ; et le lecteur de secours de l'extension ne lisait rien (`restRequest` jetait la réponse de
  toute RPC). La retenue « la lecture passe devant » ne vise plus que les extensions ≥ 0.6.144 (`LECTURE_FOND_VERSION_MIN`).
- **La source** : la PAGE PUBLIQUE de l'annonce (JSON-LD Product + fil d'Ariane, feuille = rayon), une page vue depuis
  l'onglet de travail. ⛔ Jamais le formulaire d'édition (`item_upload`) en boucle. Lisible quel que soit le compte Vinted
  ouvert. Une annonce vendue n'a PAS de JSON-LD Product (« page_sans_annonce », jamais un refus).
- **⛔ MÉTHODE (décision de Nico, 25/10) : la fiche est COMPLÈTE dès l'import**, pour qu'au clic « Publier » il n'y ait
  aucune attente — la liste d'abord (stock visible tout de suite), puis l'extension lit chaque annonce en arrière-plan,
  à la suite, et complète la fiche ; priorité aux comptes payants et actifs, puis aux fiches les plus récentes ;
  rattrapage des fiches déjà importées ; rythme sûr, mesuré avant d'ouvrir. Toutes les plateformes importées (Depop,
  Beebs, Leboncoin, eBay) suivent la même méthode, plateforme par plateforme après mesure.
- **Le rattrapage en arrière-plan** : `get-pending-jobs` → `lecture_fond` (`_shared/lecture-fond.js`) ; l'extension lit à la
  fin de ses polls (3 pages au plus — 2 avant le 25/10 16:07 —, 20 à 45 s d'écart, 300 par jour) et n'écrit que ce qui MANQUE (description si vide,
  `vinted_catalog_id` si nul, attributs fusionnés par la base, marque `page_publique_lue`). Ouverture :
  `coin_config.lecture_fond_mode` (absent = 1 pilotes en mesure — leurs vraies fiches à lire sont écrites ; 2 payants ;
  3 tous ; 0 coupé). Le premier refus de Vinted coupe le compte 6 h ; `ops-digest` les compte.
- **Le pont** : la page sonde la présence en 1,5 s avant toute lecture ; un pont mort se dit (« Recharge cette page »,
  lot gardé) ; l'extension ≥ 0.6.144 réinjecte son script dans les onglets ouverts à chaque mise à jour.
- **Jamais retenu sans issue** : au stepper (« Publier » à l'unité), une fiche pas encore lue ouvre en DERNIER RECOURS
  l'écran `AttenteLectureOrigine` : lecture tout de suite, relecture toutes les 6 s (5 min au plus), stepper ouvert dès
  que c'est lu, « Fermer » laisse la lecture continuer (avant : une bulle de 7 s puis rien — Jocabroc, 25/10). ⛔ Jamais
  « Écrire ma description » pendant une attente (décision de Nico) : seulement quand l'annonce d'origine n'a VRAIMENT
  aucun texte (note `sans_description` — le stepper s'ouvre, texte rédigé à relire). Dans le lot, passé 60 s, la seule
  issue est « Retirer du lot » ; une lecture faite au
  stepper ou au lot ferme sa demande ; les phrases ne promettent plus un départ quand aucun job n'existe
  (`messageLectureOrigine(…, "preparation")`).
- Selftests : `lecture-page-publique` (code de l'extension EXÉCUTÉ, plus seulement des motifs), `lecture-fond`.

## ⛔ 25/10 fin d'après-midi — aucune action ratée invisible (Jocabroc ; rapport § 6)
- Chaque action ratée de l'app (web et mobile) écrit `usage_logs.action_app_ratee` (`src/utils/actionRatee.js` : action,
  motif, build, plateforme) : publication en attente/refusée, rédaction ratée, republication retenue/refusée, contact,
  exceptions non rattrapées (5 par onglet) ; bornée (même motif : 2 min ; 40/h) ; sans session, gardée et envoyée à la
  session suivante. `ops-digest` : « actions app en échec » et « comptes actifs dont les actions app s'arrêtent net ».
- « Contacter le support » ouvre le formulaire de l'app (un `mailto:` ne fait rien sur un PC sans messagerie).
- ⛔ La republication (capture, retrait, recréation, réveil) reste telle quelle (décision de Nico, 25/10).

## ⛔ 25/10 soir — le créneau remplace ses sautés, écarte les annonces mortes, dit chaque retenue (Jocabroc ; migration `20261025180000`, rapport `docs/enquetes/soir-2510/RAPPORT.md`)
- **Appliquée le 25/10 à 17:58:56** (feu vert nommé de Nico ; essai annulé rejoué juste avant, 14 comptes, 0 erreur ; md5
  relus après). Inverse : `supabase/rollbacks/20261025180000_creneau_remplace_les_sautes_INVERSE.sql`.
- Un essai **sauté** (`republish_essai_saute` : portée ARTICLE, clos ou en attente, rien retiré ni redéposé — marques de
  `_shared/accident-avant-retrait.js`) ne prend ni une place des prévues ni le rythme : le candidat suivant passe au passage
  suivant (au plus `prevues` sautés rendus, un article tenté une fois par créneau). Une panne du COMPTE n'est jamais un sauté.
- **Vinted** : une annonce absente de DEUX relevés complets du dressing depuis sa dernière vue est `annonce_introuvable`
  AVANT tout essai (jamais vue / boutique inconnue : inchangé).
- **Toute retenue écrit son motif**, à la transition, jamais à chaque passage : `_extension_absente` (Chrome muet > 10 min :
  depuis, dernier signe, levé au retour), `_espacement` (la republication de référence, sa plateforme, la prochaine heure,
  `apres_fin`), `_aucun_candidat`, `_remplacements_epuises`.
- **L'app le dit** (`RepublicationPlanifiee.jsx`, selftest `creneau-remplace-les-sautes`) : pendant le créneau, « Le créneau
  attend Chrome » / « Les republications Leboncoin sont réparties sur le créneau — la republication Vinted de 19h30 compte
  aussi » / « Plus rien ne partira sur Leboncoin dans ce créneau » passent AVANT le créneau manqué de la veille — jamais
  l'heure de la suivante (règle « aucun temps estimé », 15/10) ; l'historique écrit
  « Chrome était fermé de 19h03 à 21h12 (dernier signe à 16h58) » et le rythme (sauf sur un créneau qui a tout fait).
- ⛔ **Cadence intouchée** : rythme du COMPTE toutes plateformes (18/09), un job par compte et par passage, intervalle =
  durée / prévues, plafonds, quotas. Le **rythme par plateforme** (étape 6 : `AND j.platform = v_pf`) attend la décision de
  Nico : sans lui, deux plateformes du même créneau ne font pas 6 + 5 (la plus lente ne passe jamais).

## 25/10 soir — lecture de fond : payants ouverts (Vinted) ; Beebs en arrière-plan (0.6.145, pilote 48 h sur le poste de Nico)
- **Vinted** : `coin_config.lecture_fond_mode = 2` depuis le 25/10 18:23:21 (feu vert de Nico, journalisé) — servi aux seuls
  postes ≥ 0.6.144 : chaque compte payant commence quand son Chrome reçoit la 0.6.144 du Web Store.
- **Beebs** (`_shared/lecture-fond.js` § Beebs, `get-pending-jobs` → `lecture_fond_beebs`, extension ≥ 0.6.145
  `lireFondBeebs`) : la page de l'annonce lue par une requête de MÊME ORIGINE depuis l'onglet www.beebs.app (l'onglet ne
  navigue jamais vers l'annonce ; absent ou déchargé, il est réveillé sur l'accueil), pour les fiches au stock à une photo
  (ou sans texte, sans état) dont l'annonce n'a jamais été capturée avec plusieurs photos. Rythme : 2 pages par poll,
  30 à 60 s d'écart, 120 par jour et par compte ; jamais pendant un relevé du poste ; le premier 403 / 429 / page de
  vérification coupe le compte 12 h (extension et serveur). Écriture = celle du relevé (capture, puis la fiche complétée
  sans rien écraser) + `attributs.page_beebs_lue` (relue au plus tôt à 30 jours, 7 après un échec).
- Interrupteur : `coin_config.lecture_fond_mode_beebs` (absent = 1 : le poste pilote en MESURE, rien d'écrit sauf ses vraies
  fiches à lire ; 2 payants ; 3 tous ; 0 coupé). Ouverture après le pilote (≥ 48 h, ≥ 200 lectures, 0 refus, médiane < 3 s,
  échecs hors anti-robot < 5 %) : décision de Nico, avec le zip 0.6.145.
- Les refus et le plafond du jour se comptent PAR plateforme (`metadata.plateforme` ; sans plateforme = Vinted) : un refus
  Beebs ne coupe pas Vinted. ops-digest lit le journal par pages (> 1 000 lignes par jour avec les payants) et par plateforme.
- Selftest `lecture-fond-beebs` (44 contrôles : règle, liste, motif de l'extension exécuté, branchements).

## ⛔ 25/10 soir (lot 2, décisions de Nico) — le rythme par plateforme est en place, ÉTEINT ; les champs requis se remplissent seuls quand une source fiable existe
- **Migration `20261025200000_rythme_par_plateforme` APPLIQUÉE à 20:24:49** (feu vert nommé ; garde md5 22bb479d… ; essais
  annulés : éteint = balayage identique sur les 13 créneaux en cours, le créneau de Jocabroc rejoué allumé → Leboncoin
  part). Interrupteur `coin_config.republish_rythme_par_plateforme` : **ABSENT = éteint** (rythme du compte, règle du
  18/09). Allumé : chaque plateforme compte son attente depuis SA dernière republication ; « un job par compte et par
  passage », anti-rafale par plateforme et l'extension à une action à la fois restent. Allumer (décision de Nico : quand la
  0.6.144 aura fait ses premiers jobs propres) : `scripts/reparations/20261025_rythme_par_plateforme_allumer.sql` ;
  éteindre : `…_eteindre.sql`. Selftest `rythme-par-plateforme`.
- **Champs requis** (`_shared/champs-requis-auto.js`, `_shared/pointure-du-texte.js`, branchés dans `ListingPreviewScreen.jsx`
  — `champRequisAuto` pour les champs des rayons, `matiereEbayAuto` et la pointure pour eBay ; selftest
  `champs-requis-auto`). Règle commune : jamais deviner ; pas de source fiable → la question, comme avant.
  - Matière Beebs : la fiche (une seule entrée de la liste), sinon le rayon (doudous, peluches → Tissu ; jouets électroniques
    pour bébé, figurines → Plastique ; jouets en bois → Bois), sinon « Autre ». Jamais le texte libre.
  - Âge Beebs : l'âge écrit (« dès 3 ans », « 18 mois et + », « 3+ », tranche exacte « 4-6 ans ») ; jeu vidéo : PEGI / USK ;
    livre, magazine, film ADULTE (signe adulte écrit ET aucun signe jeunesse) → « 16 ans et + » ; jamais un livre jeunesse
    (rayon « Romans pour enfant », « jeunesse », un âge écrit…) ; jouets : aucun défaut de rayon (6 mois de publications :
    aucun rayon n'a d'âge dominant) → l'âge écrit, sinon la question.
  - Pointure (Leboncoin, Beebs, Vinted, eBay) : la fiche d'abord ; sinon un nombre COLLÉ à « pointure / P / taille / taglia /
    talla / Größe / maat / EU », cohérent avec le public du rayon (enfant 16-38, adulte 34-50), une seule valeur, demi-pointure
    jamais arrondie, tiers (Adidas) et UK/US → doute ; fiche et texte en désaccord → doute. Passage sur les 3 959 fiches de
    chaussures en base : 0 valeur contre la fiche (`docs/enquetes/soir-2510/POINTURE-PASSAGE.md`).
  - Bijoux Beebs (« Bijoux (femme) », grille de bagues + « Ajustable ») : collier, bracelet, boucles d'oreilles… →
    « Ajustable » ; bague, « anneau », parure, type inconnu → la question.
  - Matière eBay : la composition LUE sur l'étiquette (Lens, avec pourcentages : Lens n'a aucune confiance propre à la
    matière), sinon la valeur neutre de LA liste de la catégorie (une seule existe : « Inconnue », 175758), sinon la question.
  - La taille au scan Lens : NON (décision de Nico : la mesure donnait 3 fois plus de questions) — la question reste à
    « Publier », seulement quand une plateforme ciblée l'exige.
- **Valeurs fausses déjà en ligne** : Leboncoin et Beebs n'ont AUCUNE modification en place dans FillSell (3 actions de job
  seulement) : rien appliqué, cas listés (`docs/enquetes/soir-2510/CORRECTIONS-G.md`).

## ⛔ 26/10 — vitesse de publication (urgence Jocabroc ; rapport `docs/enquetes/lenteur-2610/RAPPORT.md`)
- JAMAIS un minuteur qui change un état du composant App sans que son écran soit affiché : trois rotations de textes
  d'exemple redessinaient toute l'app ~chaque seconde (stock + écran de publication) — avec 778 fiches, la page ne
  répondait plus (selftest `vitesse-publication`).
- Le lot lit les annonces Vinted EN PARALLÈLE (10 à la fois ; l'extension les sérialise, ~1,1 s chacune) ; eBay et l'ancien
  lecteur Vinted (formulaire d'édition) gardent leur espacement par créneau réservé.
  ⛔ Amendé le 28/10 (429 de Vinted chez Cédric, axel terver) : les lectures partent ensemble, mais la page publique
  attend son créneau — 3 d'affilée, puis une toutes les 8 à 20 s (section du 28/10 ci-dessous).
- La lecture de fond ne s'exécute jamais pendant qu'on publie (serveur : geste < 10 min ou tâches servies ; extension
  0.6.146 : elle cède le verrou). `coin_config.lecture_fond_mode` : clé ABSENTE (= pilote seul) depuis le 26/10 07:38.
- Le plafond Free n'est jamais prêté à un compte (selftest `quota-payant-jamais-free`).

## 26/10 — refonte C du lot : une ligne par article, une pop-up par article (maquettes validées par Nico ; rapport `docs/enquetes/session-2610/RAPPORT.md` § C)
- La liste : UNE ligne par article (vignette, titre entier, vrais logos, prix, statut), ses questions dessous en un geste
  (3 au plus, le reste dans la pop-up) ; « À régler » en haut, « Prêts » en bas ; une ligne qui devient prête GARDE sa
  place (« Réglé — touche la ligne pour revoir »). Chaque ligne se construit DANS sa barrière (`Rendu`) : un moteur qui
  lève met son article de côté, jamais la liste (selftest `lot-par-question` § 6).
- La pop-up (`src/publication/lot/FicheArticle.jsx`, lue par `ficheLue.js`) : le commun (photos, titre, prix, état,
  description entière), puis UNE section par plateforme : statut Prêt / À régler, rayon et « Changer », colis ou port,
  caractéristiques ; retirer une plateforme = le bouton « ✕ Ne pas publier sur X ». La MÊME pop-up sert « Vérifier » à
  l'unité (`EcranVerifier.jsx`) ; les cartes d'avant restent un geste plus bas, repliées.
- ⛔ Rien n'est coupé par « … » (rayon, colis, port, règle eBay, titre d'une ligne) : sur deux lignes s'il le faut.
- Rayon « neuf seulement » (C8) : le message dit le fait, sans citer de bouton ; dessous, deux sorties en un geste —
  « Passer l'état en « Neuf … » » (choix de la PERSONNE, jamais posé par FillSell) ou « Changer de rayon ».
- Beebs ou Depop SANS aucun rayon candidat (ou Depop qui interdit l'objet) : écartés d'office, une ligne discrète « Pas sur
  Depop : aucun rayon. » et « Annuler » qui les remet (C9). Jamais Vinted, Leboncoin ni eBay.
- ⛔ Le poids montré vient de la fiche ou du choix de la personne, JAMAIS d'une estimation (ni l'IA, ni la tranche
  Leboncoin) ; sans poids, l'article compte dans « Colis · N articles sans poids » (« Un poids pour les N »). Un poids
  grossièrement incohérent pour l'objet (robot aspirateur, bouilloire, maison de poupée… bornes larges) est signalé avec
  deux poids plausibles et « Garder ».
- Photo de remplissage (l'image par défaut de Beebs rapatriée comme photo) : lue dans la page (≤ 256 px ET ≤ 40 couleurs),
  dite dès la ligne (« Sans photo », motif « Photo » : rien ne part avec elle) ; une image illisible n'est JAMAIS déclarée vide.
- ⛔ Une description écrite par FillSell ne contredit jamais la fiche (`moteur/descriptionFidele.js`, appliquée au texte qui
  PART dans construireJobs ET à celui qu'on montre — même fiche, `moteur.ficheDuTexte`) : même état (« Bon état » →
  « Très bon état » de la fiche), même genre (« homme » contre une fiche « femme » réécrit ; « pour femme » que rien ne
  fonde retiré), hashtags seulement fondés par la fiche. Hashtags seulement sur Vinted et Depop (5 au plus), jamais sur
  Leboncoin, eBay, Beebs (une queue de hashtags tombe, un « #mot » dans une phrase redevient « mot »). Le texte du
  vendeur fait foi : sur Vinted et Depop il part tel quel.
- Modèle Vinted : la liste COMPLÈTE de la marque relevée sur Vinted (`src/data/vintedModeles.js` : téléphones, casques,
  ordinateurs portables ; 1 504 modèles Samsung), avec recherche ; un modèle chiffré lu sans ambiguïté sur le titre
  (« Galaxy S10 ») est posé sans question, une gamme seule (« Galaxy ») jamais.
- Selftests : `lot-refonte-c`, `lot-par-question`, `publication-moteur` (C8) ; aperçu : `ECRANS=^3 node
  scripts/apercu/capture-lot-publication.mjs` (le lot de Nico du 26/10 : Medik8, Samsung, Scotch, bouilloire, robot LIEE…).

## 26/10 — bloc D (XEWER, Nico) : âge Beebs du classement, colis par défaut, rédaction à la demande, publications programmées
- **D1 — Âge Beebs d'un jeu vidéo** : le classement RÉPONDU dans la même publication (Vinted « Classement du contenu »,
  puis eBay « Classification ») vaut celui de la fiche — l'âge se déduit sur-le-champ (XEWER : 9 jeux redemandés en
  10 jours juste après avoir répondu le PEGI). PEGI, USK, et l'ESRB qui dit un âge minimum (E10+ → 8-12 ans, T → 12-16,
  M et AO → 16 ans et +). ⛔ « E – Tous publics », « RP », « Non précisé », USK 0, une lettre dans le texte : la question.
- **D2 — Colis Leboncoin par défaut** (Réglages › Expédition) : `platform_settings.leboncoin.colis_defaut`
  `{ format: Petit|Moyen|Volumineux, poids_g }`. Posé sur la copie Leboncoin (poids si la fiche n'en a pas, taille si la
  copie n'en porte pas), jamais par-dessus une valeur connue ; dit « par défaut » dans la pop-up du lot ; rangé sur la
  fiche à la publication quand elle n'en a pas (le même poids sert à Beebs : palier lu du poids de la fiche). C'est le
  choix de la personne, jamais une estimation (règle 7).
- **D3 — Titre, description et prix à la demande** (Réglages › Préférences › Rédaction, éteint par défaut) :
  `platform_settings.redaction.a_la_demande`. La rédaction tourne (rayon, caractéristiques) ; ce qui part est la FICHE
  (titre, description même vide, prix) ; « Générer » pose ce que FillSell a écrit, champ par champ (pop-up du lot et
  « Vérifier », question Prix du lot). Une description vide ne part jamais (« Description à écrire (ou « Générer ») »).
  Un champ généré redevient « écrit par FillSell » (règles 4 et 5 : description fidèle, hashtags).
- **D4 — Publications programmées** (Réglages › Automatismes, éteint par défaut) : `platform_settings.publication_programmee`
  `{ actif, creneau matin|midi|soir|perso, de, a, jours, plafond_jour, fuseau }` (`_shared/publication-programmee.js`).
  La tâche naît marquée `platform_fields.programmee` (quota au clic, comme avant) ; get-pending-jobs la RETIENT hors
  créneau, au-delà du plafond du jour, tant qu'une autre programmée est en cours ou que l'espacement (créneau ÷ annonces
  du jour) n'est pas écoulé — il en sert UNE, marquée `programmee_servie_le`. Le surplus attend le créneau suivant.
  Éteindre le réglage libère la file. « Envoyer tout de suite » au lot. eBay par l'API (nos serveurs) n'est pas retenu.
  ⛔ Jamais une heure dans les phrases (« dans ton créneau du matin », c'est tout).
- Selftest : `bloc-d-2610`.

## 26/10 (soir) — tailles en kilos, jouets Vinted, reprise après restriction (Diana, Louis, Johan)
- **Tailles en poids** (Diana, couches « Taille 5 (12-18 kg) », grille Vinted en kg) : règle R6 de
  `_shared/taille-de-service.js` — l'option qui CONTIENT toute la tranche, au plus près de son poids de départ
  (12-18 kg → « 11–25 kg », le choix de la personne). App (jugerValeurContreListe, eBay), serveur (réponse
  automatique de handler-watch). Aucune option ne contient la tranche : la question, grille entière.
- **Jouets Vinted** (« Maison Gabby » de Louis) : tout « Enfants › Jeux et jouets › … » exige une taille (mesure : 10
  rayons, 31 valeurs, 73 jouets en ligne sur 73 avec une taille) — ligne synthétique avant l'envoi, plus de « Prêt » à
  tort ; un OBJET (ni déguisement ni tablier) prend « Taille unique » quand rien d'autre ne la dit (écran,
  champRequisAuto ; serveur, R7 de taille-question-auto.js). Un âge recommandé n'est jamais une taille.
- **Après une restriction Vinted** (Johan) : le message COMPLET de la page de Vinted est gardé sur le compte
  (platform_settings.vinted.restriction) ; les tâches retenues ne repartent qu'au rythme de
  coin_config.vinted_reprise_restriction_jour (défaut 10) par jour de Paris, une à la fois, 45 min au moins entre deux.
  Plafond général du parc : NON posé — la mesure (6 comptes restreints en 60 jours ; 149 comptes non restreints au-dessus
  de 50 publications un jour) ne montre pas de seuil de rythme ; décision à Nico.

## 26/10 (nuit) — la relecture avant redépôt ne laisse jamais une annonce hors ligne des heures (Johan Désiré)
- **Cas** : « Jean Lee Carol Western » retirée de Leboncoin (15:49), essai de recréation coupé à 16:33 sur la page
  /options (0.6.144). La garde anti-doublon a posé un relevé `serveur:verif_redepot` à 17:08 : servi trois fois, jamais
  pris. Prouvé : l'ordinateur dort et se réveille une minute toutes les 16 à 29 min (un minuteur de 45 s de
  l'extension n'a pas sonné pendant 17 à 28 min), et l'extension ne lançait un relevé servi qu'en FIN de cycle, derrière
  les polls que l'alarme empilait. Pendant ce temps, Beebs (24) et Depop (29) restaient retenus par le groupe.
- **Règle 1 — devant** : un relevé de vérification est servi `devant: true` (`_shared/releve-verif-non-pris.js`) ;
  l'extension ≥ 0.6.148 le fait en TÊTE de cycle (avant la lecture d'origine et les tâches), puis repolle : le serveur
  juge tout de suite. Rien de fond (lecture Vinted, Beebs) n'est servi tant qu'il attend. Un seul poll attend le verrou
  à la fois (l'alarme ne les empile plus).
- **Règle 2 — relancée, puis dite** : servi à un poste qui POLLE (3 passages, 20 min au moins) sans être pris → relancé
  une fois (l'ancien clos `[non pris]`, un neuf posé) ; la relance non prise non plus → needs_user avec le titre, quoi
  regarder et « relance d'un clic ». Un poste absent n'avance rien (seuls les passages qui servent comptent) : la borne
  de 6 h reste le dernier filet. Suivi : `platform_fields.releve_verif_suivi`.
- **Règle 3 — sa plateforme seule** : une annonce qui attend sa relecture (`depotPeutEtrePartiDepuis` non nul) ne retient
  plus le groupe Leboncoin / Beebs / Depop (`_shared/retenue-hors-ligne.js`, `attendSaRelecture`, `idsQuiRetiennent`) :
  les autres plateformes repartent, leurs marques se lèvent au passage suivant. Sur SA plateforme, « une seule annonce
  hors ligne » tient toujours.
- ⛔ Inchangé : jamais un redépôt sans relevé complet postérieur à l'essai (seul le verdict « aucune » rend le job à la
  file) ; identité certaine → rattachée ; doute → needs_user avec les liens.
- Selftests : `releve-verif-non-pris`, `retenue-hors-ligne`. Rapport : `docs/enquetes/johan-relecture-2610/RAPPORT.md`.

## 26/10 (nuit) — « Ta file » : annuler ce qui attend (Nico)
- **Geste** : « Tout annuler » (rouge, à côté de « Mettre en pause / Reprendre », confirmation « Annuler les N … en
  attente ? ») et, par ligne, glisser vers la gauche (« Annuler ») ou la petite croix (confirmation dans la ligne).
  Remplace l'ancien « Arrêter les N republications en attente » en pied de la file.
- **S'annule** (`src/utils/annulerFile.js`, `jobAnnulable`) : une publication pending / needs_user sans lien ni numéro ;
  une republication pending / needs_user dont le relevé n'a pas commencé (étape absente ou `a_capturer`).
- ⛔ **Jamais** : un job en cours (il va au bout) ; une republication `captured` (la suppression a pu partir avant
  d'être écrite), `deleted` ou suppression envoyée (l'annonce doit revenir en ligne) ; un retrait (`delete`, après une
  vente : double vente). Les lignes « En cours » n'ont pas de croix et ne comptent pas dans « Tout annuler ».
- **Écriture** : une mise à jour par job, relue juste avant, gardée en base (statut lu, action, étape / lien) ;
  `status = cancelled` + `arret_utilisateur` ENSEMBLE (controler_job_extension refuse alors toute écriture de
  l'extension). Quota : une publication se compte à la génération (rien à rendre) ; une republication porte
  `hors_quota`, déjà exclu par quotas_etat, quota_republication_free_etat, spend_coins_and_republish et
  remise_en_vente_place (vérifié en prod le 26/10) — aucune migration.
- Selftest : `file-annuler`. Aperçu et preuve : `node scripts/apercu/capture-file-annuler.mjs`
  (`screenshots-review/file-annuler/`, 390 et 1280 px).

## ⛔ 28/10 — la lecture d'origine juste avant la publication (Juliette, Petite planète, Cédric ; rapport `docs/enquetes/lecture-origine-2810/RAPPORT.md`)
- La description manquante se lit JUSTE AVANT la publication (lecture d'origine), jamais à l'import : la lecture de fond
  reste coupée (décision de Nico du 26/10, rappelée le 28/10 : « sous aucune forme »).
- Avec un lecteur, l'écran attend et le DIT (« Ton ordinateur lit ta description Vinted, en général en moins de 2 minutes :
  garde cet écran ouvert ») — jamais « Ferme » ; un appui à côté ne ferme pas une attente. Passé 3 min sans lecture
  (`ATTENTE_LECTEUR_MAX_MS`), la lecture est « en retard » : phrase vraie + Écrire / Faire rédiger / Attendre, la
  relecture continue (stepper et lot, `lecteurEnRetard`). La règle du 25/10 (« jamais Écrire pendant l'attente ») vaut
  pendant ces 3 min.
- Pages publiques Vinted demandées par l'app (stepper, lot, Stock) : un seul créneau, 3 d'affilée puis 8 à 20 s,
  rafale rechargée après 60 s (`prochainDepartLectureVinted`). Mesuré : 15 pages en 17 s → 429 ; 8 en 43 s → 429.
- Extension ≥ 0.6.149 : onglet de travail gelé ou muet → réveillé par un vrai chargement de l'annonce, puis UNE relecture ;
  lectures demandées de la plus récente à la plus ancienne ; une fiche ratée se repose 5 → 60 min, jamais close à tort.
- « vinted_sans_extension » = l'appareil qui clique n'a pas d'extension (téléphone) ; la trace `lecture_origine_en_attente`
  dit qui lit (`lecteur`, `lecteur_vu_le`).
- Rédaction : un 401 se dit « Ta session a expiré : reconnecte-toi » (après UN rafraîchissement + relance), jamais « nos
  serveurs » ; le code HTTP part avec le signal. generate-listing décode les images retouchées en boucle simple (CPU).

## ⛔ 28/10 soir — les menus « bloom » de Vinted : toute relecture d'un menu passe par `valeurChampVinted` (0.6.150 ; rapport `docs/enquetes/deblocage-2810/RAPPORT.md`)
- Vinted remplace ses menus (Catégorie, Marque, Taille, État, Couleur, Matériau, attributs dynamiques) compte par compte
  (1 compte le 24/10, 1 le 27/10, 34 arrêts le 28/10) : le déclencheur est un `<button class="select-root"
  data-testid="…-input">`, la valeur choisie ne vit que dans `<span data-testid="…-input--value">`, le `<input
  class="select-proxy" name="…">` caché reste VIDE, et le bouton porte `data-placeholder` tant que rien n'est choisi.
- ⛔ Ne JAMAIS relire `.value` d'un déclencheur de menu Vinted : `valeurChampVinted(el)` (ancien `<input>` et bouton bloom),
  `readCommittedValue` y renvoie pour un bouton. Selftest `vinted-menus-bloom` (aucune lecture `querySelector(…)?.value`
  d'un menu ne doit revenir). La grille de tailles à puces : `data-testid="category-size-single-grid_chips-input"`.
- Ce que la 0.6.149 faisait sur un compte « bloom » : publication arrêtée AVANT le dépôt (« #brand porte «  » » même pour
  « Sans marque »), republication arrêtée AVANT tout retrait (« le formulaire n'a pas accepté État », `grille_incoherente` ;
  « Vinted exige des champs encore vides … État … »). Jamais une annonce retirée. Ces arrêts repartent seuls, une fois, dès
  que le poste a la 0.6.150 (`_shared/relance-apres-maj.js` : `vinted_menus_bloom_marque`, `vinted_menus_bloom_grille`).
- Prouvé le 28/10 à 21:31 sur le compte de Nico (menus bloom) : annonce 10576137564, Kiabi / M / Très bon état / Bleu.
