# Republication, publication (unité et lot), cadence et quotas de republication

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- ⛔ 11/11 — à l'unité comme par lot : une photo suffit, seul « 0 photo » bloque ; une image par défaut CONNUE (reconnue à l'identique) ne part jamais, jamais une photo retirée sur un doute (en fin de fichier)
- ⛔ 10/11 soir — titre ET description du vendeur = passe légère, hors quota d'annonces (en fin de fichier)
- ⛔ 10/11 — un lot prêt ne se quitte jamais en silence ; « en file » = un job relu ; Cloud n'ouvre aucun quota (en fin de fichier)
- 04/11 soir — une republication neuve n'hérite d'aucune trace de retrait ; un seul juge du marqueur ; deux jobs ne s'attendent jamais (en fin de fichier)
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
  ⛔ Remplacé le 11/11 (choix b de Nico) : seule une image par défaut CONNUE, reconnue à l'identique, est retirée ;
  l'estimation ne fait plus que signaler — voir la section du 11/11 (point T1) en fin de fichier.
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

## 29/10 — lot A stabilité (rapport `docs/enquetes/lot-a-stabilite-2910/RAPPORT.md`)
- **Un dépôt Leboncoin INACHEVÉ n'est pas une annonce en ligne** (louis 68e39f7c) : Leboncoin crée l'annonce à
  l'adsubmit mais ne la met en ligne qu'après le choix de l'écran `/deposer-une-annonce/options`. Une candidate jamais vue
  en ligne (statut relevé ≠ en_ligne/en_verification ; Leboncoin « inactive »), sans date de mise en ligne
  (`publiee_le` vide), apparue pendant un essai de CE job arrêté sur /options sans confirmation ensuite, ne retient pas le
  redépôt : `depotInacheveLbc` (`_shared/recreation-deja-partie.js`), lu par get-pending-jobs (avant la question) et par
  `depot-coupe-tranche.js` (après chaque relevé). Une annonce en vérification (option choisie) n'est jamais visée.
  Prouvé le 29/10 : 3297429776 (410 « désactivée ») laissée, recréée en 3297610395 à 14:13, une seule copie.
- **Une photo morte chez la plateforme ne bloque plus une publication** (Ornella, plante 64da7249) : après les deux
  balayages de rapatriement, UNE vérification par job ; une photo qui répond 404/410 (jamais 403) est retirée de la COPIE
  du job s'il reste ≥ 1 photo, toutes chez nous ; le message dit laquelle et pourquoi (`_shared/photos-mortes.js`,
  handler-watch ; `selftest:photos-mortes`). La fiche n'est pas touchée.
- **Une recréation Vinted remet le modèle et les attributs de l'annonce d'origine par leurs IDENTIFIANTS** (Thibault
  dca41766) : la capture (`natif.model.metadata.collection_id`, `natif.item_attributes`) voyage
  (`modeleCapture`, `itemAttributesCaptures`) ; la sonde du POST pose `model: { metadata: { collection_id } }` et les
  `item_attributes { code, ids }` que la page a laissés vides, dans le rayon de la capture seulement, jamais par-dessus un
  choix du formulaire (0.6.153). Forme prouvée en réel le 29/10 (annonce de test 10582889236, compte de Nico : relue
  `model {type: other, collection_id 2}`, stockage 1292 = « 256 Mo », simlock 1313 = « Oui »). Plus de simlock « Non »
  d'office en recréation. La question « Vinted exige « Modèle » … » d'une recréation déjà retirée repart une fois au build
  qui corrige (`_shared/recreation-bloquee.js`, cause `vinted_attributs_origine`, champ `sources`). Vinted exige
  désormais la Couleur sur « Téléphones portables » (400 relevé le 29/10).
- **Catégories** : une question de rayon n'offre jamais les rayons que l'IA a refusés (ni leurs voisins) ; « aucune » de
  l'IA = question sans puces (C9 : plateforme écartable) ; bouton « Pas sur <plateforme> » sur la question ; « Top case »
  = 🏍️ (jamais 👕) ; le rayon choisi ne devient l'objet de l'article que si le titre ne nomme rien
  (`rayonApresRefus.js`, `resolutionPublication.js`, `ListingPreviewScreen.jsx`). Leboncoin : seul un refus PROUVÉ
  (« racine|feuille "X" introuvable … Options affichées ») entre dans le moteur de rayon ; une page de catégorie illisible
  se réessaie, la catégorie d'origine reste (`_shared/rayon-refuse-moteur.js`). Vinted : libellé de rayon périmé → au
  niveau qui échoue, l'option `#catalog-<id>` (relevée sur les menus bloom le 29/10) donne le libellé affiché.

## 29/10 (lot B) — le texte du vendeur n'est jamais réécrit ; titre, description, prix facultatifs ; consignes ; stratégie de prix ; Lens direct (promesses XEWER)
- **Qui a écrit ce texte** : UNE règle, `src/utils/sourceDuTexte.js`, partagée par l'écran (`texteDeLaFiche.js`,
  `texteDuVendeurFiche`) et le serveur (generate-listing). Sur une fiche du STOCK, tout texte qui ne porte pas une marque
  de FillSell (`lens`, `vocal`, `ia`) est celui du vendeur — y compris une fiche sans aucun marqueur (tapée avant ce lot).
  Un résultat Lens ou un corps `item_data` (pas une ligne du stock) n'a de texte du vendeur que s'il le dit par un
  marqueur. Cas : paugues.contact « Jazz man » 1793117541271 (27/10) — fiche tapée sans marqueur → réécrite par l'IA
  (gabarit Vinted, hashtags), puis la retouche de la copie IA recopiée sur la fiche (marqueur « manuel » 8 s après) :
  texte d'origine perdu. Mesuré sur 30 jours : 56 fiches tapées à la main (15 comptes), 21 titres réécrits.
- **Marqueurs de naissance** : la création les pose (`marqueursDeNaissance`) — ajout manuel du Stock et modale « Ajouter
  au stock » (`manuel`, ou `lens` pour un champ resté tel que le scan l'a proposé), assistant vocal (`vocal`), fiche née
  d'un scan (`fiche-article.ts` : `lens`). Un texte « manuel » part tel quel : ni marque retirée du titre
  (`stripMarque`), ni mots retirés de la description (`_cleanDesc`).
- **À l'envoi**, « texte du vendeur » se lit sur la fiche RELUE et sur la retouche de cette publication (plus à
  l'ouverture) : `descriptionFidele` ne remplace plus « bon état » par l'état de la fiche dans le texte que la personne
  vient de coller (XEWER, Mario Kart Wii 1793095499602, Tony Hawk 1793116418631).
- ⛔ `contenu-fiche.js` (ce que get-pending-jobs impose aux copies existantes) est VOLONTAIREMENT inchangé : aucune
  annonce déjà en ligne n'est réécrite en masse sans preuve de ce qu'avait tapé le vendeur ; les fiches neuves portent
  leur marqueur et y entrent d'elles-mêmes.
- **Titre, description, prix facultatifs** (1.1) : « J'écris, FillSell m'aide champ par champ »
  (`platform_settings.redaction.a_la_demande`, Réglages › Rédaction et consignes IA) — les champs restent vides, y compris
  depuis Lens (le titre / le prix du scan ne remplissent plus rien) ; « FillSell écrit tout » reste le défaut. Chaque
  champ a son bouton « Générer avec l'IA » / « Estimer avec l'IA » dans les deux modes et les deux peaux
  (`genererChamp`, BlocValeursGenerales, FicheArticle) : champ vide → la proposition s'y pose ; champ rempli → feuille
  « Remplacer ? » (`FeuilleRemplacer.jsx`, « Garder mon texte » par défaut). La proposition : la copie déjà rédigée ;
  sinon une rédaction de CE champ, verrou levé pour lui seul, rendue sans rien appliquer (`handleGeneratePlatforms`
  mode `proposition`, `fiche_serveur:false` — même décompte qu'aujourd'hui). Gardes « à la demande » : « Titre à écrire
  (ou « Générer avec l'IA ») », « Prix à donner (ou « Estimer avec l'IA ») » ; un titre vide n'est plus rempli en
  silence par celui de FillSell (`construireJobs`).
- **Consignes du vendeur** (1.3) : `platform_settings.redaction.consignes` { ton, titre, description, etat, toujours,
  eviter } (`src/utils/consignesRedaction.js`), lues à chaque rédaction (`_shared/consignes-du-compte.ts`, lens-analysis
  ET generate-listing) et ajoutées au prompt (`directiveConsignes`) : forme seulement, jamais un fait ni une liste
  fermée ; « pas de hashtags / d'émojis » tenus aussi sur le texte généré (`respecterConsignes`). La note du viseur Lens
  et la « précision pour la rédaction » (dictées ou tapées) entrent dans le contexte (`noteVendeur`) — `notes` n'était
  lu nulle part par generate-listing.
- **Stratégie de prix** (1.4) : `platform_settings.redaction.strategie_prix` (`rapide` | `marche` | `haut`, défaut marché,
  `src/utils/strategiePrix.js`) : la borne de `fourchette_marche` (bas / moyen / haut). Elle ne sert qu'à « Estimer avec
  l'IA » et s'affiche avant la publication (EcranConfirmer, résultat Lens) ; un prix tapé n'est jamais recalculé.
- **Lens → l'annonce** (1.2) : « Créer l'annonce » et « Ouvrir l'annonce dès la fin de l'analyse »
  (`redaction.ouvrir_annonce_apres_scan`) ouvrent directement l'écran des champs (`ouvertureDirecte`, nouvelle peau :
  étape 2) ; « Voir l'analyse » y ramène. La note et le prix d'achat du viseur passent à l'annonce (`noteVendeur`,
  `prixAchatSaisi`).
- **Dictée** : `src/components/BoutonDictee.jsx` (ajoute, jamais ne remplace ; un micro à la fois) sur les champs de
  texte libre ; le doublon du micro Lens sur le web (continuous=true recollé à chaque événement) est corrigé
  (`fusionnerResultatsReconnaissance`). Selftest `dictee-partout`.
- Selftests : `source-du-texte`, `strategie-prix`, `consignes-redaction`, `texte-de-la-fiche`, `contenu-du-vendeur`,
  `bloc-d-2610`, `dictee-partout`.

## 29/10 (lot B 4.7, 4.10) — programmées marquées en fin de chaîne ; la sortie d'une restriction Vinted garde ses paliers
- `programmee_servie_le` n'est posé que sur la tâche réellement rendue, après toutes les gardes (plus jamais une tâche
  marquée puis écartée qui compte dans le plafond du jour) ; les programmées dont l'échéance n'est pas venue passent
  derrière les autres (`ordreProgrammeesPretesDabord`). Créneau, plafond, espacement inchangés.
- Une tâche retenue par la restriction Vinted (`platform_fields.restriction_compte {fin}`, sans `pas_de_rouge`) entre
  dans la reprise par paliers du 26/10 (même compteur, 45 min) quand la fin est passée
  (`_shared/reprise-apres-restriction.js`) — avant, elle partait d'un coup à l'échéance.

## 29/10 (lot C partie 1) — la description d'origine : zéro friction (rapport `docs/enquetes/lot-c-2910/RAPPORT.md`)
- **L'écran s'ouvre au clic** (`StockTab.publierAvecDetail`) : fiche importée qui attend sa description → la règle
  d'abord (une lecture en base), « Récupération de ta description… » tout de suite ; l'écran lit (même chemin,
  `completerTexteDuVendeur`, premier tour toujours) et ouvre le stepper dès que c'est lu, sans écran intermédiaire.
- **L'état de la lecture est sur la demande** (`lectures_origine_demandees` : prise_le, essai_le, motif, faite_le ;
  migration 20261030090000) : l'extension ≥ 0.6.159 écrit « prise », « échec + motif », « conclue (ok, sans_texte,
  introuvable) » (`lecture_origine_essai`, `lecture_origine_conclure`) ; l'écran le relit à chaque tour
  (`etatDeLaDemande`) et dit l'étape vraie (`phraseEtatDemande`, jamais une durée promise).
- **Les issues** (`issuesDeLEtat`) : échec → TOUT DE SUITE « Réessayer » (si utile) + « Écrire ma description » +
  « La faire rédiger par FillSell » ; annonce sans texte ou supprimée → écrire / faire rédiger (jamais un stepper qui
  rédige en silence) ; sans échec → aucune issue avant 45 s, en discret ensuite. « Réessayer » =
  `demander_lecture_origine(p_relancer)` (même dans les 15 min ; l'extension ne fait plus attendre le repos d'une
  demande posée après l'échec).
- **La lecture passe devant tout** (extension 0.6.159) : d'abord SANS le verrou (GET dans un onglet Vinted vivant, jamais
  une navigation : `lirePagePubliqueVintedSansVerrou`), sinon EN TÊTE de file (`withJobFlowLockPrioritaire`, drain au
  début de chaque tour et entre deux tâches du poll). Une demande de téléphone est vue en 30 s (alarme
  `fillsell-lecture-signal`, RPC `lecture_origine_signal` : une ligne par la clé primaire).
- **Page Vinted sans JSON-LD** : la description, la marque, la couleur et le rayon se lisent dans le flux Next.js de la
  page, pour CETTE annonce seulement (`lireFluxNextVinted`, item_id égal) — cause de « page_sans_annonce ».
- **Mesure durable** : usage_logs `recuperation_description` (une ligne par écran : issue, motif, lecteur, durée) ;
  requêtes : `docs/sql/recuperation-description.sql`.
- Jamais de lecture en masse (la lecture de fond reste coupée), jamais le texte du vendeur réécrit, jamais une durée
  promise. Selftests : `recuperation-description`, `lecture-prioritaire`, `lecture-page-publique`,
  `lecture-origine-publication`, `attente-sans-lecteur`, `lecture-fond`, `repoll-borne`.

## 29/10 (lot C partie 3) — Lens : rien d'invisible, le bon nom du vêtement, un vêtement au rayon des vêtements
- Prompt v2026-10-29 (lens-analysis) : ce qu'aucune photo ne montre ne s'écrit jamais (capuche, dos, poche, doublure ;
  la phrase multi-photos n'annonce plus de « dos ») ; le genre du vêtement se nomme d'après la matière et la façon
  (polaire, softshell, coupe-vent, doudoune, sweat…) ; « veste de sport » seulement si établi ; une marque LUE NETTEMENT
  reste même sans trace en ligne ; l'éditeur d'un jeu (Bethesda, Nintendo…) est sa marque.
- Modèle du scan : Haiku 5.5 (effort low, sans temperature ni prefill, web_search_20250305) ; retour à Haiku 4.5 sans
  redéploiement : coin_config.lens_scan_haiku45 = 1. Banc réel (25 articles, avant / après) : scripts/bancs/lens/README.md.
- Rayon : une fiche Lens « mode » ou « chaussures » écarte, sur Leboncoin, Vinted et Beebs, les candidates du mot hors
  de la famille « mode » (familleFiltreDesCandidates) — plus jamais « Loisirs > Sport & Plein air » pour une veste.
  eBay et Depop inchangés. Quotas Lens inchangés. Selftest lens-visible.
## ⛔ 30/10 (lot D point 1) — la lecture d'origine ne boucle plus jamais (rapport `docs/enquetes/lot-d-3010/RAPPORT.md`)
- **Cas** : lauran, extension 0.6.157, annonce Vinted MASQUÉE (vinted_status hidden) : une relecture ratée toutes les
  2 min de 09:06 à 10:25 (47 en une heure), malgré « Faire rédiger » à 09:16 et 09:26.
- **Règle, côté BASE (vaut pour toutes les versions de l'extension)** — migration `20261030120000_lecture_origine_plafond`
  (feu vert de Nico, 30/10 10:27) : la base compte elle-même les échecs à la trace `usage_logs` « lecture_fond » (origine
  demandée ou page, déclencheur `usage_logs_lecture_origine_echec`) ; « page_sans_annonce » ou « introuvable » =
  échec DÉFINITIF dès le premier (demande conclue : « masquee » si l'annonce est masquée/brouillon, « illisible »
  sinon, « introuvable ») ; tout autre échec : plafond dur de 3 puis « illisible » ; une demande n'est plus servie ni
  signalée dès qu'un choix (Écrire / Faire rédiger) est posé APRÈS elle ou que la fiche a un texte ; conclue sans texte
  = 24 h sans réarmement par un simple « Publier » (« Réessayer » réarme toujours, compteur à 0).
- get-pending-jobs ne retient plus la file pour une demande qui n'est plus vivante (`demandeLectureVivante`, = la base) ;
  hors Vinted, 3 relevés « lecture d'origine » TERMINÉS en 24 h sans la lire = lecture épuisée (plus aucun relevé, la
  copie part, `lecture_origine_epuisee` sur le job).
- L'app dit « Ton annonce Vinted est masquée sur Vinted : sa description ne peut pas être lue » / « … n'a pas laissé ton
  ordinateur lire cette annonce » avec Écrire, Faire rédiger, Réessayer.
- Preuve : 0 relecture ratée chez lauran (et dans tout le parc) de 10:27 à 10:58.

## 30/10 (lot D point 3) — une republication retenue pour une autre boutique le DIT
- Ornella : 4 republications Vinted (@ornella-vend, 472079) retenues depuis le 20-24/10 par la garde de boutique
  (Chrome ouvert sur @luciatrendyshop ; @ornella-vend pas ouverte depuis le 13/10) — garde LÉGITIME, mais `error` NULL.
- Règle : get-pending-jobs pose sur une republication retenue le même marqueur qu'un retrait (`attente_boutique_republication`,
  `_shared/attente-boutique-serveur.js`) et le message « Republication Vinted en attente : … Ouvre ta boutique @x … »,
  écrit une fois par couple de boutiques, levé dès que la bonne boutique est ouverte. La file dit « (en attente depuis
  le 24 oct.) » au-delà de 24 h. Rien n'est forcé : elles partent quand @ornella-vend est ouverte dans Chrome.

## 30/10 (lot E, thecloset72000) — photos par plateforme, texte écrit par la personne
- **Photos par plateforme** : sur la carte de chaque plateforme (comme titre, prix, description), la personne voit toutes
  les photos de la fiche, choisit celles qui partent, en retire, les réordonne (la 1re = couverture), dans la limite de
  la plateforme (`src/publication/photosParPlateforme.js` : Vinted 20, Depop 8, Beebs 10, eBay 24, Leboncoin 20 dont
  seules les gratuites partent, Opla 20). Le choix vit dans `edited[plateforme].photos` ; absent = la règle d'avant à
  l'identique. Un job aux photos choisies porte `photos_choisies` (jamais complété par la fiche : `contenuAImposer`,
  `photosApresRayonRetrouve`) et `lbcPhotosCapped` (spend_coins_and_publish ne réécrit jamais la fiche avec un
  extrait — même drapeau, aucune migration).
- **(01/11, Jocabroc) Vinted reçoit les 20 premières photos du job, jamais plus** : sans choix de la personne, le job
  porte toutes les photos de la fiche (24 importées) ; l'extension les envoyait toutes, Vinted en gardait 20, la garde
  `ensurePhotosLanded` attendait 24 et annulait AVANT le dépôt (« 20/24 confirmée(s) après 97 s »). get-pending-jobs
  (v316, `_shared/photos-limite-plateforme.js`) coupe à 20 dans l'ordre du job (celui choisi pour Vinted) chaque job
  Vinted servi, et la capture d'une recréation ; le job en base garde toutes ses photos. Marche avec l'extension
  0.6.163. Autres plateformes : toutes leurs photos (Depop coupe à 8 dans l'extension, Leboncoin suit son quota gratuit,
  Beebs et eBay ne bloquent jamais sur un manque). Selftest `selftest:photos-limite-vinted`.
- **Description : ce que la personne a écrit part partout, tel quel** (`descriptionFidele`, `lignesEcritesParLaPersonne`) :
  une ligne absente de toutes les copies rédigées par FillSell a été écrite par la personne et n'est jamais retouchée
  (ni état, ni genre, ni hashtags), sur toutes les plateformes ; le texte du vendeur aussi. La règle 5 du 26/10 (pas de
  hashtags hors Vinted et Depop) ne vise plus que les hashtags de FillSell. Cas : la référence
  « #the_closet72jeanFR44 #jean » partait sur Vinted et Depop, retirée sur Leboncoin, Beebs et eBay.

- **30/10 soir — étape « recreated » sans numéro** (`_shared/etape-recreated-sans-numero.js`, handler-watch et
  get-pending-jobs) : une republication restée « recreated » sans numéro d'annonce n'est plus jamais « étape inconnue ».
  Les relevés tranchent : l'annonce recréée est vue → clôture propre ; l'ancienne a disparu et rien n'est vu → reprise
  de la recréation (Leboncoin, Beebs seulement, `deleted_at` requis), sans doublon. ⛔ Seulement les tâches `pending` /
  `needs_user` — jamais une republication échouée ni un refus de vérification Beebs (le 30/10, la première version a
  redéposé une republication Beebs échouée de XEWER : corrigé dans l'heure).
- **30/10 soir — « Republier avec toutes tes photos »** (`_shared/photos-lbc-amputees.js`, fonction
  `republier-photos-lbc`) : sur une annonce Leboncoin partie amputée (repli silencieux sur 3 photos, 20→30/10), une
  ligne dans l'app ; UN geste, une annonce à la fois par compte, sans pièce ni quota (`hors_quota`), cadence de la file,
  visible seulement avec une extension qui lit la nouvelle page de dépôt, jamais pendant un blocage Leboncoin.

## ⛔ 31/10 (lot F, Johan) — une republication vise l'annonce EN LIGNE actuelle ; la pause se dit « En pause à ta demande »
- `_shared/republication-cible.js` (get-pending-jobs, APRÈS la pause, AVANT l'étape qui retire) : republication pas encore
  engagée sur Leboncoin, Depop, Beebs → numéro visé absent du dernier relevé probant (`releve_preuve_absence`) alors qu'il
  existait avant, et fiche portant une annonce vue dans ce relevé → close « déjà remise en ligne » (`cancelled` +
  `republication_sans_objet`), rien retiré ni recréé ; sans successeur → retenue avant tout retrait (`cible_absente_releve`,
  jamais sur Beebs), repart si un relevé revoit la cible. Écran : « Fait » (`deja_en_ligne`), jamais « à relancer ».
- Pause : UNE règle (`jobRetenuParPause`) pour le serveur, `etat-job` (app et popup) ; pendant une pause le serveur écrit
  `MESSAGE_REPUBLICATION_EN_PAUSE` (jamais « En file ») ; « En pause à ta demande » partout (ligne, compteurs, barres,
  À régler, popup) ; à la reprise les lignes repassent « En file ». Exception unique : une republication dont l'annonce est
  déjà retirée va au bout.

## ⛔ 31/10 (finition du lot F) — un retrait ferme les republications en attente de la même annonce
- `_shared/republication-retrait.js` : un retrait (`delete`) en attente, en cours ou fait sur l'annonce X (même compte,
  même plateforme, même numéro — `numeroAnnonceDuJob`, jamais un titre) clôt toute republication NON ENGAGÉE de X
  (`pending` / `needs_user`, étape absente, `a_capturer` ou `captured`, aucun retrait engagé) : `cancelled` +
  `arret_utilisateur` + `hors_quota` + `republication_retrait_demande`, « Annonce retirée à ta demande : cette
  republication n'a plus d'objet », rien n'est recréé. Une republication ENGAGÉE n'est jamais touchée.
- La porte (serveur, toutes versions d'extension, tous les chemins de retrait) : get-pending-jobs, à chaque poll normal,
  AVANT la pause (une file en pause, une republication en attente d'un geste se clôt aussi) ; lectures bornées (retraits
  des 30 derniers jours, clés utiles de `platform_fields` seulement). update-job-status n'est pas modifié (déploiement
  refusé le 31/10). L'extension (`cancelPublishAfterDelete`) ne clôt toujours que les jobs `published`.

## 31/10 (lot H, XEWER) — les dates de mise en ligne du Stock suivent l'éligibilité à la republication automatique
- UNE règle (`_shared/mise-en-ligne.js`), celle de `republish_planifiee_candidats` (SQL inchangé) : Vinted =
  `inventaire.listed_at_guess` ; autres plateformes = dernier job publish/republish `published` qui porte un lien, daté
  `coalesce(published_at, created_at)`, un import (`releve-annonces`) daté par `annonces_plateforme.publiee_le` quand elle
  est antérieure au job. Équivalence prouvée sur les données réelles de XEWER (928 dates, 0 écart :
  `scripts/lot-h-equivalence.mjs`). Toute évolution de la règle SQL se reporte dans le module, et inversement.
- La pastille « En ligne · N j » dit la mise en ligne la PLUS RÉCENTE (ou celle de la plateforme filtrée « En ligne sur
  X ») ; un appui (ou « En ligne sur … » du menu « … ») ouvre « En ligne depuis » : par plateforme l'état, la date, publiée /
  republiée / importée (`releve-annonces`, `… · sync-dressing`), et l'historique (republications remplacées comprises,
  jamais une annulation sans `published_at`). Le tri « Mise en ligne récente » et les tranches d'ancienneté lisent la date
  de la carte ; « Anciennes » et « Remonter » gardent l'annonce la plus ANCIENNE (ce qui perd en visibilité).

## 31/10 soir (lot I, PAUGUES) — la couleur Vinted vient de SA palette, ou elle est demandée (rapport `docs/enquetes/lot-i-3110/RAPPORT.md`)
- « Appareils photo » et « Téléphones portables » ne sont plus exemptés de couleur (`_shared/vinted-exigences.js`) :
  formulaire relevé « Couleur » obligatoire (31/10, 25 et 29/10) et refus 400 sur le Polaroid. Une couleur posée sur un
  formulaire sans champ ne bloque rien (`selectColors`).
- La question « Couleur » Vinted de l'app (fenêtre « Compléter ») est une LISTE FERMÉE : palette de la page, sinon le
  catalogue, sinon `VINTED_COLORS` ; aucune valeur hors palette n'est écrite (`StockTab`, `questionCouleurVinted`).
- « COULEUR INTROUVABLE : Vinted ne propose pas la couleur [...] » (`_shared/pas-de-rouge.js`,
  `couleurVintedHorsPalette`) : la réponse fautive est retirée de `vintedAspects.color` ET de `needsUserResolved`
  (elle primait sur tout) ; 1re fois reprise, 2e fois la question avec la palette de la PAGE. « existe bien … n'a pas pu
  être posée » (défaut chez nous) : rien de retiré.

## ⛔ 01/11 soir (gjehly) — une plateforme bloquée ne bloque jamais les autres (publications programmées ; rapport `docs/enquetes/depot-vinted-muet-gjehly-0111/RAPPORT.md`)
- Décision de Nico (01/11 soir) : « Une plateforme bloquée ne doit jamais bloquer les autres. »
- `_shared/publication-programmee.js`, `plateformesEnRepriseTechnique` : une plateforme dont une programmée DÉJÀ SERVIE
  (36 h, la lecture du plafond) est en reprise technique — pending/processing avec `pas_de_rouge_reprises` ≥ 1, ou
  needs_user avec `boucle_technique` — ne reçoit plus de nouvelle place ; `decisionProgrammee` donne la place à la
  première programmée d'une AUTRE plateforme (les bloquées gardent leur rang). Toutes bloquées : rien de servi (motif
  `plateforme_bloquee`). Une question sur l'article (needs_user sans boucle) ne bloque pas sa plateforme.
- Cadence intouchée : créneau, plafond du jour, une à la fois, espacement — même verdict avec ou sans plateforme
  bloquée (selftest `bloc-d-2610`). Seule la tâche qui prend la place change.
- get-pending-jobs v319 (journal : « en reprise technique, sans nouvelle place : vinted »).

## ⛔ 01/11 nuit (gjehly) — trois décisions de Nico : colis Vinted déduit du rayon, eBay programmé, page qui ne charge pas
- **Format du colis Vinted d'une PUBLICATION** (« l'app doit le déduire seule de la catégorie quand la plateforme le
  demande, sans rien demander quand la catégorie suffit ») : `_shared/vinted-colis-categorie.js`, règle 10 de
  `_shared/questions-tranchees.ts` (handler-watch, 3 min). Vinted ne coche rien ET la personne n'a rien choisi ET ce
  n'est pas un lot (`titreDeLot`) → le format que portent presque toutes les tâches Vinted de ce rayon (catalog_id) dans
  le parc sur 90 jours — annonce relevée à la republication, format coché au dépôt, format choisi par la personne — une
  observation par article, lots écartés, au moins 5 articles, 2 comptes, 90 % ; dans la grille affichée (sinon le plus
  petit offert qui suffit), dans la liste fermée de la question ; posé comme une réponse (`colis_choisi`), tracé
  (`colis_tranche_par_categorie`), une passe par job. Sans accord : la question reste, relue une fois par jour par job
  (`colis_rayon_sans_accord`). Remplace, pour ce seul cas, « jamais choisi à ta place » (05/10). Un format choisi par
  la personne et non proposé reste une question.
- **Publications eBay (API) programmées** : `ebay-api-worker` (`programmeesEbayAServir`) prend la MÊME décision que
  get-pending-jobs (`decisionProgrammee`) — créneau, jours, plafond du jour PARTAGÉ avec les autres plateformes, une à
  la fois, espacement, plateforme bloquée — sur les servies de toutes les plateformes du compte ; la servie est marquée
  `programmee_servie_le` à sa prise. Les programmées non servies sont lues à part (300 par passe) : elles n'occupent
  jamais les `LOT_MAX` places des autres comptes. Réglage éteint : comme avant. Le tour entre plateformes n'est pas
  strict : la première file qui passe après l'espacement prend la place (extension ou worker, toutes les 2 min).
- **Page qui ne finit pas de charger** (`_shared/pas-de-rouge.js`, `PAGE_QUI_NE_CHARGE_PAS_RE` : « le content script
  ne répond pas », « n'a pas fini de charger ») : « La publication a été interrompue : la page de Vinted ne finissait
  pas de se charger sur ton ordinateur. Rien n'a été touché : nouvel essai automatique au prochain passage. » — jamais
  « onglet fermé, mise en veille ou coupure réseau », aucune consigne. Même motif (`canal_coupe`), même reprise.

## ⛔ 01/11 nuit (décision de Nico) — publications programmées : tour STRICT par plateforme
- « Chaque place libre va à la plateforme suivante dans l'ordre, pour qu'aucune (eBay compris) ne rafle le plafond du
  jour pendant que les autres attendent. Une plateforme sans tâche prête passe son tour. »
- `_shared/publication-programmee.js` : ordre fixe `ORDRE_PLATEFORMES_PROGRAMMEES` (Vinted, Leboncoin, eBay, Beebs,
  Depop) ; la place libre revient à la plateforme qui SUIT celle de la dernière servie (`dernierePlateformeServie`)
  parmi celles qui ont une programmée PRÊTE (`etatFileProgrammee` : en file, échéance venue) et ne sont pas en reprise
  technique ; seule prête, elle reprend. get-pending-jobs (extension) et ebay-api-worker (eBay API) lisent le MÊME état
  (servies 36 h + file du compte, toutes plateformes) : même tour, même intervalle (l'espacement compte toute la file du
  compte). La file dont c'est le tour et qui ne prend pas la place en `DELAI_TOUR_MS` (10 min : PC éteint, garde de
  get-pending-jobs) la passe à la suivante. Créneau, jours, plafond du jour, une à la fois : inchangés.
- Simulation (selftest `bloc-d-2610`) : 79 Vinted, 12 Leboncoin, 6 eBay, 8 places → Vinted, Leboncoin, eBay, Vinted,
  Leboncoin, eBay, Vinted, Leboncoin.

## ⛔ 02/11 (lot « check du 02/11 ») — attribut connu dans l'envoi, cause nommée, pause dite
- (XEWER, règle de Nico) Tout attribut Vinted exigé et CONNU (capturé, résolu par la personne, déduit) est posé dans
  l'envoi, publication comme republication, toutes catégories (extension 0.6.166, `docs/regles/extension-et-versions.md`).
- Remise en ligne bloquée (`_shared/recreation-bloquee.js`) : le message NOMME la cause — le champ exigé au refus
  (`server_required_fields`, libellé humain) ; une valeur que la tâche connaissait = défaut de notre envoi, jamais un
  geste demandé ; plus jamais « vérifie ton compte » (une cause du compte a son propre message, « proteger »). Cause
  `vinted_attribut_connu_non_pose` : relance UNE fois au build 0.6.166 ; d'ici là le message dit qu'elle repartira
  seule dès que l'extension du poste sera à jour (handler-watch, réécrit seulement s'il change, ancien texte archivé).
- (tiblancdeshaut) File en pause à la demande de la personne : une republication retenue qui disait encore « En file :
  passera à son tour » dit « En pause à ta demande » (get-pending-jobs, lignes concernées seulement). La pause
  elle-même n'est jamais levée par FillSell.
- (gjehly) Publication programmée : 8 places par jour dans le créneau du soir, aucune hors créneau ; une tâche déjà
  servie la veille et rejouée après un mur technique peut aboutir le matin (une reprise, pas une place).

## ⛔ 02/11 (stephanie.heline) — « ta connexion Vinted est bonne » se prouve, et jamais contre la capture
- 17 republications lisaient « Ta connexion Vinted est bonne » alors que la capture avait PROUVÉ l'absence de session
  (403, cookie de connexion absent : `capture_echec.cause403 = session_absente`, needs_user « connecte-toi » envoyé par
  l'extension). `update-job-status` requalifiait sur `extension_sessions.vinted === true` sans date — valeur GARDÉE par
  une sonde muette (403, règle B de l'extension) : un « true » de 10:09 relu à 11:51.
- Règle (update-job-status v165) : la capture `session_absente` garde son needs_user et le message de l'extension
  (« Connexion Vinted requise : connecte-toi sur vinted.fr dans Chrome, sur ton ordinateur… ») ; sinon « connexion
  bonne » exige `sondeProuveSession` (`_shared/session-prouvee.js` : mesure de CE poste, < 30 min). Un « true »
  périmé tombe dans la branche « sonde muette », qui ne prétend rien. Selftest `selftest:session-bonne-capture`.
- Jobs non touchés : au prochain essai de capture, ils reçoivent le vrai message.

## ⛔ 02/11 (dsjhdhayoub) — l'ordinateur éteint (constaté) prime sur « nouvel essai automatique »
- 4 publications (2 Leboncoin, 2 Beebs) prises le 30/10 à 13:17:47 (Paris) ; dépôt Leboncoin commencé (fenêtre réduite)
  puis le Mac s'est mis en veille : plus aucun appel du poste, sauf de brefs réveils de veille (01/11 12:00 et 21:00,
  onglet de l'app ; 22:00:33 un battement qui déclare encore le dépôt 8edb11a1 « en cours »). VOULU : rien ne part
  sans ordinateur. DÉFAUT : la tâche remise en file par handler-watch (message « dès que Chrome sera ouvert ») disait
  « En pause : nouvel essai automatique, rien à faire » (motif `essai`, prioritaire) ; les 3 autres disaient bien
  « ordinateur éteint ».
- Règle (`_shared/etat-job.js`, copie de l'extension régénérée) : extension constatée éteinte/inactive + job hors voie
  api → motif `ordinateur`, avant `essai`. Selftest `selftest:etat-job` (4 cas ajoutés).

## ⛔ 02/11 (gjehly) — une plateforme qui fige n'est plus AFFAMÉE sur un poste actif
- 13:00:57 un Vinted fige (« content script ne répond pas… », canal coupé) ; la règle du 25/09 (`_shared/rotation-figes.js`)
  retenait alors TOUS les Vinted du compte « après les autres » tant que le poll avait autre chose à servir — pendant
  3 h. Avec 58 Leboncoin en file (un toutes les 2 min) et un poste qui ne repasse prendre la file qu'au bout de son lot
  (96 tâches, ~2 h), « après » voulait dire « jamais » : polls de 13:07 et 14:39, « 77 job(s) retenu(s) après les autres
  (plateforme(s) qui figent sur ce poste : vinted) », plus aucun essai Vinted. Le tour strict des programmées n'y était
  pour rien (ses 80 Vinted programmées attendaient le créneau du soir, réglage du compte).
- Règle (get-pending-jobs **v326**) : passé `FIGE_REPOS_MS` (10 min) après le dernier gel, la plateforme figée a UNE tâche
  servie par poll avec les autres (l'essai) ; une tâche de la plateforme TRAITÉE par un poste et publiée après le gel
  (`processing_since` et `published_at` postérieurs ; jamais une annonce importée) lève le gel. Toujours : une seule
  tâche figée par poll, rien d'autre → tout part, fenêtre de 3 h, republication « deleted » jamais retenue. Le journal
  dit « vinted (une servie à l'essai) ». Selftest `selftest:rotation-figes` (cas réel ajouté).

## ⛔ 02/11 soir (Nico, test Cloud de 17:02) — compte Cloud : les écrans de suivi disent FillSell Cloud ; une programmée le dit
- **Compte Cloud** (`profiles.cloud_voie`, lu par `src/cloud/useCompteCloud.js`, une lecture par session) : une tâche
  Vinted, Leboncoin, Beebs, Depop qui n'est pas « nos serveurs » est faite par FillSell Cloud (`src/cloud/voieCloud.js`,
  `parLeCloud`, même liste que `_shared/cloud-voie.js`). Partout où une tâche est suivie — écran « Publication lancée »
  (`EcranSuivi.jsx`), barres (`utils/barresJobs.js`), « Toute la file » et ses raisons (`FileDesJobs.jsx`,
  `utils/fileDesJobs.js`), cartes et fiche « statut » du Stock (`StockTab.jsx`, `ctxBarres.cloud`) — les mots sont :
  « Dans la file — FillSell Cloud la prend à son tour(…) », « FillSell Cloud la publie / republie / retire… »,
  pastille « FillSell Cloud actif · vu … », « FillSell Cloud ne répond pas pour l'instant — ça repart tout seul »,
  « reconnecte <plateforme> à FillSell Cloud (Réglages › Abonnement › FillSell Cloud) ». Jamais « ton ordinateur » ni
  « Chrome » pour ces tâches. eBay par l'API : « nos serveurs », inchangé. Comptes avec extension : textes inchangés.
- **Publication programmée** : l'écran « Publication lancée » et « Toute la file » ouverte depuis lui lisent le réglage
  (`usePublicationProgrammee`) et disent « Programmée : elle partira dans ton créneau, une à la fois » — le 02/11 à 17:02,
  cinq publications de Nico retenues jusqu'au créneau du matin s'affichaient « Dans la file — Chrome la prend à son tour ».

## ⛔ 03/11 soir (gjehly) — la programmation se décide au clic, jamais par la tâche d'avant (rapport `docs/enquetes/retraits-a-tort-0311/RAPPORT.md` § 3)
- La carte d'une fiche (`fiches_annonce.edited`) garde le platform_fields de la tâche précédente : 80 publications Vinted
  envoyées « tout de suite » le 03/11 à 10:49 sont nées `programmee` (marque du lot du 01/11, arrêté à 08:22) et ont été
  retenues dans le créneau du soir, 8 par jour, sans un mot. `construireJobs` (`src/publication/moteur/regles.js`,
  `champsDuJob`) retire toujours `programmee`, `programmee_le`, `programmee_servie_le` et ne pose la marque que si l'envoi
  est programmé AU CLIC. Selftest `programmation-au-clic`. Créneau, plafond et tour : inchangés.

## ⛔ 03/11 — Remontées Premium / Pro : seules les faites ou en cours comptent (décision de Nico ; rapport `docs/enquetes/paliers-quotas-0311/RAPPORT.md`)
- Une fonction, `remontees_du_cycle(user, cycle)` (migration `20261103234000`), lue par `quotas_etat`,
  `spend_coins_and_republish`, `remise_en_vente_place` et `republish_planifiee_etat` : les remontées CRÉÉES dans le cycle,
  publiées ou en cours ; jamais une annulée ou échouée sans publication, une synchro, `hors_quota`, la sortie d'Opla.
  Sous-ensemble de l'ancien compte : aucun compteur ne monte (alizeed48 974 → 301). Le Free garde
  `quota_republication_free_etat`, inchangé (il date une remontée à sa publication : appliqué aux payants, six
  compteurs seraient montés).
- ⛔ Une remontée `cancelled` AVEC `published_at` a été FAITE : la remontée suivante du même article l'a remplacée
  (« Annonce en cours de republication (supprimée puis recréée…) »). Elle compte. Ne jamais lire `status <> 'cancelled'`
  comme « faite » (erreur de l'audit du 03/11 : les 743 « annulées » de nadegemarcelin78 étaient des remontées faites).

## 04/11 soir — une republication neuve n'hérite d'aucune trace de retrait ; un seul juge ; jamais deux jobs qui s'attendent
Récit : `docs/enquetes/problemes-rouges-0411/RAPPORT.md` § 1 (9cdr9rm4rn, Beebs, 03/11 15:22).
- ⛔ La copie d'une republication (`spend_coins_and_republish`, republier-photos-lbc) retire toute trace de retrait par
  PRÉFIXES (`republication_sans_traces` / `TRACES_DE_RETRAIT_RE`, identiques — selftest:republication-va-au-bout), puis
  la liste d'avant. Une clé neuve de retrait se nomme dans ces familles (`republish_suppression…`, `suppression_…`,
  `preuve_retrait`, `retrait…`, `retenue_…`, `deleted_…`, `recreat…`, `old_…`, `new_listing…`, `orphan_…`,
  `delete_…`, `deja_absente`, `beebs_404_…`, `error_technique`). Jamais de liste blanche (un champ de dépôt oublié
  ferait échouer la recréation APRÈS le retrait). Migration 20261104210000 : écrite, NON appliquée au 04/11 soir.
- ⛔ UN seul juge du marqueur `republish_suppression_envoyee`, pour soi ET pour les autres, serveur ET extension
  (`suppressionEnvoyeeHeritee`, `_shared/retenue-creneau.js`, recopié dans background.js) : hérité = muet sur DEUX
  preuves (autre annonce que celles du job ET écrit avant sa naissance) ; tout le reste retient comme avant. Une lecture
  qui juge un marqueur ramène `created_at, platform_listing_id, listing_url`, sinon le marqueur retient (sûr par défaut).
- Filet : un frère « captured » qui m'attend ne me retient pas si je suis le plus ancien (`jePasseDevant`) ; jamais
  pour un frère à l'étape « deleted ».

## 04/11 (nuit) — une annonce déjà retirée n'attend jamais une reprise prudente (règle de Nico)
- Constat (t-shirt Adidas, Leboncoin, compte Cloud de Nico) : retirée 21:54:05, retenue ~11 min par la reprise prudente
  (une action Leboncoin toutes les 10 min pendant 6 h après la levée d'une pause), en ligne 22:07:30.
- Règle : la cadence prudente ne vise que les NOUVELLES actions. Une republication à l'étape « deleted » est servie tout de
  suite (toutes celles du compte), et compte pour l'action du moment : la suivante attend ses 10 min après elle.
  `annonceDejaRetiree` (`_shared/blocage-leboncoin.js`), appliquée dans les deux blocs de get-pending-jobs (compte, et
  délégation chez l'exécutant) ; même exemption dans la reprise après restriction Vinted (`estApresRestrictionVinted`).
  Côté serveur : vaut pour le PC et le Cloud. Selftests : `lbc-controle-pause`, `restriction-vinted-reprise`.

## 05/11 — Vinted : compte bloqué dès le dépôt, capture « → libellé », grille par code, article vendu
- /main/banned atteint par le formulaire de dépôt = mur de Vinted (le chemin exact — jamais un refus, une connexion, un
  captcha) : attente nommée, aucune reprise, message « bloqué par Vinted », classé PLATEFORME (`cause-blocage`). Serveur :
  `essaiSurPageCompteBloque` (lit aussi « pathname inattendu (/main/banned) » des extensions ≤ 0.6.172). Selftest
  `vinted-depot-compte-bloque`.
- Capture incomplète dont TOUS les motifs sont « … → libellé) » = notre lecture du référentiel : reprise 10, 30, 120 min,
  au plus 3, aucun geste demandé (`_shared/capture-libelle.js`, update-job-status + handler-watch). Selftest
  `capture-libelle`.
- Diagnostic « grille » : le champ arrive sous son code Vinted (condition, size…), traduit (`vinted-grille-servie.ts`).
  « UK 8 child » = « UK 8 enfant » seulement si la grille porte ce libellé exact (`tailleAServir`).
- Une republication arrêtée dont la fiche est vendue est close (handler-watch), jamais « repartira toute seule ».
- introuvable_a_confirmer : le relevé demandé ne tient compte que des relevés commencés après la plus ancienne lecture en
  attente (`borneReleveAttendu`) ; la cadence de 6 h de nos demandes ne change pas.
- Un redépôt raté sur une coupure de NOTRE authentification : reprise dans 1 min, anti-doublon armé
  (`_shared/republication-hors-ligne.js`).

## 05/11 matin — Annonce partie, article vendu
- Republier une annonce qu'on sait partie (vendue, ou absente établie) est refusé À LA SOURCE, bouton de l'app compris
  (migration 20261105110000, en attente du feu vert) — la file automatique l'écartait déjà.
- Une republication d'un article vendu (statut vendu OU quantité ≤ 0) est RETENUE needs_user « article_vendu », jamais
  annulée (règle du 25/09, get-pending-jobs ; handler-watch aligné le 05/11) : si la vente n'a pas eu lieu, la personne la
  défait et relance.

## 05/11 midi — Caractères invisibles : jamais envoyés
- Titre et description perdent leurs caractères invisibles (largeur nulle hors emoji, marques de sens, contrôles, trait
  d'union conditionnel) ; espaces spéciales → ordinaires ; accents, ponctuation, emojis intacts ; retours à la ligne
  d'un titre : règle Vinted du 25/10 inchangée. Au service (get-pending-jobs, toute extension) et avant de taper
  (extension 0.6.173). La fiche ne change pas. Un refus Vinted pour un caractère invisible repart seul, une fois.
  Selftest `caracteres-invisibles`.

## ⛔ 05/11 soir (PMF Vito, assopmfrance) — taille et pointure : lues, demandées UNE fois, jamais une plateforme perdue en silence (demande de Nico)
- **Constat** (`usage_logs` `champ_requis_bloquant`, 05/11 17:27 → 19:23) : 8 fiches, 5 publications parties sans Beebs ou
  Vinted, 1 fiche abandonnée. Pas une régression récente : une copie qui PORTE une taille absente de la grille d'une
  plateforme (« 36.5 » sur Beebs « Baskets (fille) », grille d'entiers ; « EU 37 » sur les rayons homme Vinted et Beebs qui
  commencent à 38 ; « Medium-Large » d'une casquette) devient une question du RAYON, qui ne grisait pas le bouton (règle 2
  du 03/09, 63673bf) : la plateforme sortait au clic. Seule une copie VIDE donnait la question partagée (le contre-exemple).
- **Bouton** (nouveau stepper) : un champ de rayon bloquant grise Publier comme un champ partagé ; « Continuer sans X »
  (`plateformesRetirables`) est le seul chemin sans la plateforme. L'ancien stepper garde la règle 2.
- **Pointure du texte** (`_shared/pointure-du-texte.js`) : « T36,5 », « T 42 » ; une pointure UK / US écrite À CÔTÉ d'une
  pointure européenne explicite ne la rend plus douteuse (« Taille 36,5 (US 4.5Y) » → 36,5) ; un nombre collé à UK / US
  n'est jamais lu ; une demi-pointure écrite seule (« 42.5 ») en filet — jamais suivie d'une unité, jamais précédée d'une
  mesure (semelle, prix), ignorée hors des bornes du public. Inchangé : un entier nu jamais lu (« 39Thirty », « lot de
  12 », années), une demi-pointure jamais arrondie, une seule valeur.
- **Taille en lettres** (`_shared/taille-du-texte.js`) : « taille M », « Size: XL » → l'option de la grille, en DERNIER
  recours (FR, W, âge écrits passent devant ; « M/L » = doute ; jamais face à une copie qui porte une taille chiffrée).
  Le serveur (handler-watch R5, `taille-question-auto`) la lira à son prochain déploiement.
- **Accessoire sans taille** (`_shared/champs-requis-auto.js`, `tailleUniqueAccessoire`) : casquette, chapeau, bonnet, sac,
  pochette, écharpe, lunettes, parapluie, portefeuille, valise → l'option « taille unique » de LA grille quand ni la fiche,
  ni la copie, ni le texte n'en disent (Vinted, Beebs, Leboncoin, eBay). Jamais : ceinture, gants, vêtement, chaussure,
  bijou, montre ; jamais par-dessus « Medium-Large », « taille 58 », « 3 ans ».
- **Pointure hors grille, dite** (`moteur/listes.pointureHorsGrille`, BlocQuestions) : « La grille de ce rayon va de 38 à
  52 : 37 n'y figure pas. Vérifie le rayon… » ; « Ce rayon n'a que des pointures entières : 36,5 n'y figure pas. Choisis
  (36 ou 37)… » — les voisines en tête, jamais choisies par nous.
- **Un contenant de bijoux n'est jamais un bijou** (`src/utils/shared.js`, `zonesContenantBijoux`) : boîte, coffret, écrin,
  présentoir, range-, porte-, arbre, organiseur à bijoux, boîte à montres → jamais 💍 ni ⌚ ; icône 🏠, type Maison
  (Beebs : aucun rayon « Bijoux »). Un bijou nommé hors du contenant (« Bague dans son écrin ») reste un bijou.
- **Qui a décoché** : `plateforme_decochee` porte `par` (personne | moteur) et `decoche_par` (motif du moteur :
  `categorie_fermee`, `pause`, `deja_en_ligne_ou_en_file`, `ebay_inutilisable`, `fermee_au_compte`) ; une plateforme retirée
  par le moteur le dit sur sa ligne de « Confirmer » (« Retirée par FillSell : … »).
- Selftest `champs-requis-partages` (les 6 fiches réelles et le contre-exemple) ; `champs-requis-auto` adapté (« UK 8 /
  EU 42 » → 42).

## 06/11 — Champs requis : les trois recos validées par Nico (point 4) ; aspects eBay déduits du texte (point 9)
- **4 a — le public choisi par la personne sur Vinted prime** : quand la personne CHOISIT son rayon Vinted (son geste,
  `edited.vinted.rayon_choisi`), le public qu'il nomme (Femmes, Hommes, Enfants › filles / garçons) devient le genre
  d'eBay, Beebs, Depop, Opla et l'univers de Leboncoin — seulement si le genre deviné le contredit, manque ou vaut
  « Mixte » ; un genre compatible (« Bébé » sous « Bébé filles ») reste ; une copie dont la personne a choisi le rayon
  garde le sien ; retirer le choix rétablit le genre d'avant (`genre_du_choix`). Les rayons affichés sont recalculés
  une fois par choix. `src/utils/rayonPublication.js` (copiesAuPublicChoisi) ; selftest `public-choisi-vinted`.
- **4 b — une vraie taille reste une taille** : « taille unique » n'est posée par-dessus une taille écrite que si la
  grille du rayon n'offre QUE la taille unique (la seule valeur possible ; la taille écrite reste dans le texte, la
  valeur part sur la copie de cette plateforme seule) — `tailleUniqueSeuleDeLaGrille` (champs-requis-auto.js), lignes de
  rayon et encart eBay ; la règle « accessoire sans taille » (05/11) est inchangée. Selftest `champs-requis-0611`.
- **4 c — une pointure écrite par l'IA sans source compte comme vide** : à la génération, pour une chaussure, la pointure
  d'une copie n'est gardée que si la fiche, le titre ou la description du vendeur, ou une étiquette lue (Lens) écrit la
  même (`pointureRedactionSourcee`, pointure-du-texte.js) ; sinon la copie la perd (trace `pointure_ia_ecartee`) et la
  question partagée « Pointure » est posée une fois.
- **9 — un aspect eBay exigé que le vendeur a écrit** (ayadi007 : « Type » 11205, « Longueur » 54235) : une MESURE
  nommée (« Longueur : 60 cm », « H 70 cm », « L x l x H : 60 x 40 x 70 cm ») convertie et recalée sur l'option EXACTE
  de la liste, ou une option écrite en toutes lettres (mot entier, la plus précise) ; un triple sans ordre nommé
  (« 60x40x70cm »), deux mesures différentes, une option vague ou rien → la question. Web (encart eBay, texte du vendeur
  seulement : fiche + titre de la copie) et serveur (voie API, `ebay-aspects-du-texte.ts`) : `_shared/aspect-du-texte.js` ;
  selftest `aspect-du-texte`. Les deux cas d'ayadi007 n'avaient rien d'écrit (chaise sans dimension ; « scanner …
  portable » ≠ « Scanner portatif et compact ») : la question y reste, juste.

## 06/11 après-midi — Toute tâche bloquée par une déconnexion porte le message (lot n° 2, point 10)
Guillaume JEHLY : 123 republications Leboncoin arrêtées SANS message — la retenue « session connue morte » de
get-pending-jobs (session relevée morte par l'extension) les gardait en pending muettes. Règle : la retenue pose le
message d'attente de session (`attenteSessionServeur`, `_shared/attente-session.js` : « En attente de ta connexion à
<plateforme> dans <navigateur> … repartira toute seule. Aucune tentative consommée. » ; retrait : risque de double vente)
et le marqueur `platform_fields.attente_session` (pose_par « get-pending-jobs (session connue morte) »), 50 tâches au plus
par passage, compare-and-set sur pending, jamais réécrit à l'identique. Le message tombe à la reconnexion : la levée des
attentes de session de handler-watch (sonde fraîche, « connecté », postérieure à la pose) prend aussi cette attente SANS
échéance (`attentePoseeParLeServeur`, handler-watch v170, 13:14) — sinon les tâches qui attendent leur créneau après la
reconnexion gardaient le message. Mesuré le 06/11 12:48 : 121 tâches de Guillaume avec le message (sonde « déconnecté »
depuis le 05/11 07:15). Selftest `attente-session-serveur`.

## 06/11 — L'ordre des photos de l'article fait foi, partout (the_closet72 ; rapport `docs/enquetes/ordre-photos-0611/RAPPORT.md`)
- **Règle** (`_shared/ordre-photos.js`, jumeau SQL exact `public.photos_ordre_article`) : l'ordre de `inventaire.photos`
  fait foi ; un ordre CHOISI pour une plateforme (`photos_choisies`) le remplace pour elle ; un dépôt plafonné
  (`lbcPhotosCapped`, quota gratuit Leboncoin) garde les N premières de l'article ; sinon le job garde SES photos (rien
  d'ajouté, rien de retiré) dans l'ordre de l'article ; doute (photo absente de l'article, doublon, URL illisible) = job
  tel quel. Seul l'ordre change : les entrées (type, retouche) restent celles du job.
- S'applique à : republication (`spend_coins_and_republish`, autres que Vinted), remise en vente (`remises_en_vente_tick`),
  republication « avec toutes tes photos » (`republier-photos-lbc`), et — déclencheur `inventaire_ordre_photos_vers_taches`
  — aux tâches pas encore parties (pending, needs_user, failed) quand l'ordre de l'article change (Stock › Modifier,
  publication qui réordonne). Jamais une tâche en cours, jamais une annonce en ligne, aucune ligne inchangée réécrite.
  Migration `20261106230000_ordre_photos_article` (appliquée le 06/11 à 19:39).
- Vinted en republication : recréation depuis la CAPTURE de l'annonce en ligne (inchangé) — ce qui est en ligne repart.
- ⛔ Annonces DÉJÀ en ligne : aucune remise en ordre automatique sans feu vert ; avant toute remise en ordre, lire
  l'ordre réellement en ligne (empreintes d'image) : déjà bon → rien ; modifié par la personne sur la plateforme
  (≠ notre dépôt) → on n'y touche pas ; jamais une modification de la personne écrasée. Sur place quand la plateforme
  le permet (eBay API : `ebay-account › modifier_annonce`), hors quota.
- Verrou : `npm run selftest:ordre-photos` (publication, lot, 5 plateformes, limites, republication ; Postgres jetable).

## 07/11 — Borne de remplissage, pré-vol trop lent, prix absent, photos d'une autre plateforme (rapport `docs/enquetes/lot-0711/RAPPORT.md` § 3, 7, 10)
- Un essai Beebs arrêté à la borne ou muet est SUSPECT : les annonces sont relues avant tout redépôt
  (`_shared/recreation-deja-partie.js`). Une remise en ligne bloquée par la borne repart seule (cause
  `remplissage_borne_depassee`, une fois puis une fois au build 0.6.177, `fill_borne_ms` 20 min, relecture d'abord).
- 0.6.177 : à la borne, « abandon » (aucun clic d'envoi après) ; pré-vol > 70 % de la borne = AUCUN retrait
  (« Contrôle avant retrait trop lent… », pas-de-rouge `prevol_trop_lent` : reprise 2 h, puis la personne).
  ⚠ Le port (et donc l'abandon et la borne adaptative) ne vaut que pour les comptes `beta_flags.keepalive`.
- Prix absent de l'annonce d'origine (relevé, tâche, fiche) : message vrai (update-job-status) ; get-pending-jobs prend
  le prix de la FICHE en dernière source.
- Photos sur le CDN d'une AUTRE plateforme que celle visée (Vinted compris ; Beebs partout, son CDN n'a pas de CORS) :
  get-pending-jobs retient le job (rien retiré) jusqu'à la copie chez nous VÉRIFIÉE par handler-watch
  (`_shared/photos-hors-plateforme.js`, `rapatrierPhotoVerifiee`) ; la fiche n'est jamais réécrite (Vinted reste hors du
  rapatriement de masse).
- (07/11 soir, Nico) Vinted, page NON française (langue lue sur ce que Vinted montre au compte ; inconnue : pays de la
  sonde hors FR/BE/LU) : aucune republication n'est servie tant qu'elle n'a rien retiré, jusqu'à la preuve de la couleur
  sur une vraie page non française — interrupteur `coin_config.vinted_republication_hors_fr_prouvee` = 1 (absent = retenue).
- (07/11 soir) NOS PROPRES DÉPÔTS EN DOUBLE (Ciddjy 49342549 : 4 essais arrêtés à la borne, 4 annonces Beebs en ligne) :
  ≥ 2 annonces apparues depuis le retrait, TOUTES aux photos de notre copie, pas plus que nos essais suspects
  (`essaisSuspectsDepuisRetrait`), fiche à un exemplaire, revues par le dernier relevé complet → la plus ancienne
  rattachée, chacune des autres retirée par le circuit existant (delete, `doublon_de_republication`, motif
  `doublon_de_nos_essais`) ; sinon la question. Les questions déjà posées sont rejugées par get-pending-jobs (2 par
  passage, 4 fois, 30 min). Selftest `doublons-de-nos-essais`.
- (07/11 soir, 0.6.178) L'arrêt à la borne vaut pour TOUS les comptes (message simple : abandon envoyé à l'onglet, garde
  avant le clic ; un job qui demande `fill_borne_ms` passe par le port, borne 10-25 min). Leboncoin : l'attente des
  critères suit le poids des photos envoyées (30-120 s) et un PNG de plus de 300 Ko part en JPEG s'il est plus léger
  (Sonia : 3 PNG, 5,6 Mo, critères jamais affichés en 45 s).
- (08/11, point 4 — Jess, câble USB-C 3178619102) Une annonce Leboncoin vue en ligne dont le badge « Vendu » date d'AVANT
  le suivi (`leboncoin_vendu_avant_suivi` : « sold » dès la première lecture, jamais « aucune » ni « pending » depuis) se
  republie : `republication_annonce_partie` ne compte plus ce badge (migration `20261108142000`, APPLIQUÉE le
  08/11). Une vente lue pendant le suivi reste « annonce_vendue ». 26 fiches au stock bloquées ainsi le 08/11.
- (08/11, ayadi007) « Synchroniser » sur un stock VIDE n'est jamais refusé par la cadence de 15 min, déclencheur
  `garde_cadence_sync_runs` compris (migration `20261108140000`, APPLIQUÉE le 08/11) ; un refus de cadence se dit par un fait au
  passé (« lues il y a N min ») et relance le rangement — jamais « La demande n'a pas pu être envoyée ».

## ⛔ 08/11 après-midi (décision de Nico, point 1) — LES PLATEFORMES AVANCENT ENSEMBLE, CHACUNE À SON RYTHME (rapport `docs/enquetes/lot-0811-apres-midi/RAPPORT.md` § 1)
- Cas fondateur : Joséphine (josephinecerni, Pro), 874 republications le 04/11 22:07 (Beebs, Leboncoin, Vinted) : 47
  publiées le 08/11 en 5 h 30, UNE par cycle de poll toutes plateformes confondues.
- **Extension (0.6.181)** : l'espacement de 2 min entre deux gestes de republication (retrait, recréation) est compté PAR
  PLATEFORME (`noterGesteRepublish` / `espacementRepublishEnCours`, background.js). Il était global (`dernierGesteRepublishAt`) :
  un geste Leboncoin faisait attendre Vinted et Beebs. Le rythme d'UNE plateforme ne change pas (mêmes 2 min, capture
  avant retrait, poll de 2 min). L'extension garde UNE action à la fois (verrou de flux, un onglet) : rien de plus n'est
  ouvert en même temps. Un retrait (vente) né pendant un cycle l'arrête entre deux tâches et un poll repart
  (`retraitNeDepuisLeCycle`, une fois par retrait, lecture bornée toutes les 45 s).
- **Serveur (get-pending-jobs)** : la pause de respiration (50 d'affilée → 2 h, règle du 04/09) se compte PLATEFORME PAR
  PLATEFORME (`_shared/pause-respiration.js`) : 50 Vinted d'affilée mettent Vinted seul en pause. Forme d'ensemble
  (`plafond_republish.retenue`, applis installées) : vraie seulement si TOUTES les plateformes en file sont en pause ;
  la vérité est dans `plafond_republish.par_plateforme` (lue par `_shared/etat-job.js`).
- **Rythme d'une plateforme** : INCHANGÉ. Recherche du 08/11 (Clemz, VintedCRM, Crosslist, Vendoo, Closo…) : aucune
  preuve qu'un rythme plus rapide soit sans risque pour Vinted, Leboncoin, Beebs ou Depop ; les CGU de Vinted interdisent
  la suppression-remise en ligne en lot quel que soit le rythme ; un compte de client restreint fin août (96 en un jour).
- **« Ta file » montre l'avancement** (exception NOMMÉE à « aucun temps estimé » du 16/10, décision de Nico du 08/11) :
  par plateforme, faites depuis le début du lot, restantes, rythme CONSTATÉ (temps de poste actif, écarts > 45 min
  exclus), fin estimée en temps d'ordinateur allumé (ou de FillSell Cloud), pauses de 2 h comprises ; moins de 4
  republications constatées → aucune estimation (`_shared/avancement-republication.js`, get-pending-jobs `plafond_only`
  → `avancement_republication`, `src/components/FileDesJobs.jsx`).
- **Pause → reprise n'accélère rien** (prouvé le 08/11 : chaque republication « juste après une reprise » avait commencé
  20 à 60 s AVANT ; rythme identique avec ou sans les ~50 pauses). Rien à corriger ; l'écran le dit.
- Selftest `republication-plateformes-paralleles`.

## 08/11 après-midi (points 6, 8, 10) — mur d'identité Leboncoin, coupure réseau d'un lot, parcours fermé sans publier
- **Leboncoin attend nom et prénom** (Rosa Metra) : tant qu'un mur d'identité VU par Leboncoin a moins de 30 j et
  qu'aucune publication Leboncoin n'est passée depuis, get-pending-jobs ne sert plus que l'éclaireur (relancé APRÈS le
  dernier mur : « C'est fait » ou handler-watch / 12 h) ; les autres publications et republications pas encore retirées
  rejoignent la carte du compte (needs_user `lbc_identite`, `retenue_avant_essai`), aucune visite de Leboncoin
  (`_shared/lbc-identite.js`, jumelle de la porte « forfait »). Selftest `lbc-identite-carte` § 5.
- **Lot de republications et coupure réseau** (XEWER, 07/11 18:17, app Android en arrière-plan) : une coupure
  (« Failed to fetch ») attend le retour au premier plan et rejoue la même cible, 3 fois au plus ; « déjà en cours »
  après une coupure = le job existant (jamais un doublon) ; sinon motif `coupure_reseau` dit en clair
  (`republierAvecReprise`, `src/utils/republication.js`).
- **Parcours de publication fermé sans publier** : une ligne `action_app_ratee` « stepper_ferme » (étape, plateformes,
  durée), y compris au rechargement — pour savoir où et pourquoi on s'arrête (Stéphanie Durand, 07/11 18:11).
- Selftest `lot-0811-app`.

## Vinted — « preuve de boutique » absente sur la boutique ouverte (08/11 nuit, point 5 de Nico — linda.sidhoum)
- Boutique de l'annonce = boutique ouverte dans Chrome : le message dit « la page de cette annonce n'a pas pu être lue »,
  jamais « une autre de tes boutiques ». Garde inchangée (aucun retrait sans preuve). Selftest `vinted-preuve-boutique-meme`.

## ⛔ 09/11 (décision de Nico, OPTION B avec exception — remplace le « point 7 ») — UN LOT MANUEL DE PLUS DE 10 ARTICLES PART DANS LES CRÉNEAUX
- Avec un module de republication ACTIF sur la plateforme, un lot manuel (bulk_batch_id) de PLUS de 10 articles n'est
  servi que dans le créneau de cette plateforme, puis au rythme habituel (espacement par plateforme, pause de 2 h toutes
  les 50, quotas — inchangés). 1 à 10 articles, l'unité, ou sans module actif : tout de suite. Règle unique
  `_shared/lot-manuel-creneau.js`, lue à l'EXÉCUTION (get-pending-jobs) : un lot déjà en file la suit sans être recréé,
  annulé ni dupliqué. Exemptions de l'automatique (deleted, suppression partie, exception de créneau). Hors créneau, une
  republication manuelle née il y a < 90 s (ou d'un lot dont la dernière tâche a < 90 s) attend la fin de la création.
- L'automatique reste en pause tant que le lot est en file : la retenue n'écrit AUCUNE échéance (next_action_after) — les
  tâches restent « en vol » pour la garde anti-rafale de `republish_planifiee_sweep`. Seul le message s'écrit (transition).
- L'app : « En pause (créneau de republication) » (`lots_dans_creneaux` → `ctx.lotsCreneaux`), avancement « de créneau »,
  la feuille de republication le dit avant le clic. Selftest `lot-manuel-creneau`. Cas : josephinecerni (lot 77b7bf38).
- Mis de côté (Nico, 09/11) : écran de confirmation au-delà de 50 republications.

## 09/11 (point 1 de Nico — assopmfrance) — la trace d'un refus de republication garde le motif du serveur
- `reason` seul confondait trois causes (« annonce_introuvable ») : la trace action_app_ratee porte désormais
  `reason:motif` (« annonce_introuvable:annonce_vendue »), la phrase du serveur et le numéro d'annonce
  (`src/utils/traceRefusRepublication.js`, republier et republier_lot). Selftest `vendu-avant-suivi-republication`.

## ⛔ 10/11 (URGENT Cloud d0ac0538) — un lot prêt ne se quitte jamais en silence ; « en file » = un job relu
- Cas : deux lots préparés puis quittés sans « Envoyer » (aucun `spend_coins_and_publish` dans les journaux d'API) ;
  « ✓ Réglé » et « Quitter ? Les textes préparés sont gardés » ont fait croire la publication faite. Rapport :
  `docs/enquetes/lot-sans-envoi-cloud-1011/RAPPORT.md`.
- Des articles PRÊTS, rien d'envoyé : « Quitter » ouvre la feuille « Rien n'est encore parti » (`SortieSansEnvoi`) avec
  le MÊME geste que le bouton du bas et « Quitter sans envoyer » ; sans article prêt, « Rien n'est parti — quitter ? ».
  La ligne d'un article réglé dit « Prêt à envoyer ».
- Un article n'est « En file » que si son job de CE lot est relu (`jobsDuLot` : estampille `bulk_batch_id` puis
  relecture) ; aucun → « Le serveur n'a pas confirmé — rien n'a été créé » ; lecture en erreur → rien conclu.
  L'écran 3 ne dit « C'est parti » ✓ qu'avec au moins un article en file (sinon « Pas envoyé », « ! »).
- Traces `usage_logs` : `lot_envoi_demande`, `lot_quitte_sans_envoyer`, `lot_envoi_sans_job`. Selftest
  `lot-sortie-sans-envoi`.
- ⛔ LA CAUSE : compte SANS adresse de remise → Leboncoin et Beebs retirées par le moteur → rien de publiable, motif
  faux (« Coche eBay, Depop »), aucun moyen de la saisir dans le lot. Désormais : motif « Adresse de remise »
  (bilanArticle), question du lot, bloc `AdresseRemiseDuLot` (même écriture que Réglages › Expédition, BAN, hors de
  France) ; enregistrée → `m.relireAdresseLbc()` sur chaque moteur. Le bouton gris du moteur nomme l'adresse.
- FillSell Cloud n'ouvre AUCUN quota (essai compris) : le mur du lot propose le palier supérieur, c'est la règle
  (`_shared/cloud-option.js:9-17`) — la changer est une décision de Nico.

## ⛔ 10/11 (point 6 de Nico) — Vinted : l'état « Neuf sans étiquette » se CONFIRME (fenêtre du 09/11)
- Vinted ouvre `new-without-tags-education-modal` quand on choisit « Neuf sans étiquette » : non confirmée, l'état ne
  part pas (400 « Le champ État doit être renseigné », annonce déjà retirée). Extension 0.6.186 : « Conserver » l'état
  posé, jamais « Passer à … ». Serveur : relance unique `vinted_etat_a_confirmer` vers un poste ≥ 0.6.186 (état de la
  capture, jamais par-dessus une réponse différente). Rapport : `docs/enquetes/republication-etat-neuf-sans-etiquette-1011/`.

## ⛔ 10/11 soir (règle de Nico) — titre ET description du vendeur = passe légère, HORS quota d'annonces
- COMPTE : une fiche rédigée par l'IA (titre ou description écrits par elle) et chaque scan Lens. NE COMPTE JAMAIS :
  un article dont le titre ET la description qui partent sont ceux du vendeur (import d'une plateforme, saisie au
  stock). La passe légère de l'IA (rayon, champs, état) reste faite, gratuite. Valable pour tous les paliers.
- Serveur : la ligne `generate_listing` porte `texte_vendeur_titre` ET `texte_vendeur_description` = true →
  `quota_annonces_consommees` l'écarte (et elle n'ouvre pas la dédup 24 h ; `spend_coins_for_generate` idem pour la
  « régénération ») — migration 20261110170000, preuve `scripts/quotas/preuve-texte-vendeur.mjs`. `generate-listing`
  lit la fiche AVANT le guichet : une passe légère ne passe ni au quota, ni au garde-fou du jour, ni au débit.
- App (prévision, même règle) : `redactionHorsQuota` (`src/utils/sourceDuTexte.js`) — « Où publier ? »
  (`m.texteHorsQuota`), mur du lot (`consomme`), barre de sélection du Stock (`aRediger`). Un import dont la
  description d'origine sera lue avant rédaction (`plateformeOrigine`) est prévu hors quota.
- Rapport : `docs/enquetes/quota-texte-vendeur-1011/RAPPORT.md`.
- ⛔ (10/11 soir, van.nessa d0ac0538 : 10 imports reportés à tort par le mur) Le Stock et le lot passent à la règle les
  fiches mises en forme par `mapItem` (App.jsx), où le titre s'appelle `title`, jamais `titre`. `redactionHorsQuota` lit
  la fiche par `ficheAvecTitre` (`titre`, sinon `title`) : sans ce pont, toute fiche du Stock avait un titre vide et
  comptait 1 annonce. Toute nouvelle prévision de quota qui lit une fiche du Stock passe par `redactionHorsQuota`, jamais
  par `ligne.titre` directement. Preuve : `selftest:source-du-texte` § 7 (son lot : 9 imports, 3 restantes → 9 retenus).
  Rapport : `docs/enquetes/mur-lot-importes-1011/RAPPORT.md`.

## ⛔ 11/11 (décision de Nico, point T1) — à l'unité comme par lot : une photo suffit, seul « 0 photo » bloque
- Le minimum de 3 photos du 14/07 est retiré (un compte de plusieurs milliers d'articles importés d'eBay, la plupart à
  une seule photo : bouton gris sur « Où publier ? »). `MIN_PHOTOS` = 1 et `photosManquentPourPublier`
  (`src/utils/photos.js`), lue par les deux peaux du stepper — les 5 plateformes, import ou photo du téléphone.
- « 0 photo » bloque TOUJOURS, texte déjà rédigé compris (plus d'exception) : bouton gris « Ajoute au moins 1 photo ».
- ⛔ VRAIES PHOTOS SEULEMENT, à l'unité comme en lot : les vraies photos d'un article = ses photos moins les images par
  défaut CONNUES (l'image qu'une plateforme sert à une annonce sans photo, arrivée sur la fiche avec l'import), dans
  leur ordre — UNE règle, `vraiesPhotos` (`src/utils/photos.js`), lue par le bouton (les deux peaux), « Ce qui va
  partir », la vignette du lot et la tâche. Une image par défaut connue n'est JAMAIS envoyée, quelle que soit sa place :
  `construireJobs` (`moteur/regles.js`, la même pour l'unité et le lot) l'ôte de la liste des photos et marque la tâche
  `photos_choisies` (jamais complétée par les photos de la fiche) et `photosRemplissageRetirees` (combien). La RETOUCHE
  d'une image par défaut (photos rédigées, rang par rang) est retirée aussi — seulement une retouche de CE rang
  (`<uid>/enhanced/<ts>_<rang>.png` porte le rang) ; des listes décalées de même longueur, une autre adresse : rien
  n'est retiré par le rang. Les photos gardées perdent leur type POSITIONNEL (« original »,
  « photo_<i> ») : `entreesPhotos` le recalcule, la nouvelle couverture redevient « original » (aucun lecteur ne s'en
  sert : extension et serveur ne lisent que « enhanced… », pour la retouche, qui reste). Aucune vraie photo = « 0 photo » :
  unité, bouton gris « Ajoute au moins 1 photo » ; lot, « Sans photo » ; au clic, aucune tâche (`sans_vraie_photo`),
  rien de décompté — le refus est traduit par `refusDeConstruction` (`moteur/regles.js`, avec « eBay sans photo » et
  « sans titre », mêmes mots qu'avant) et ARRÊTE le clic. Un article SANS image par défaut connue part exactement comme
  avant (même tableau, même ordre, mêmes adresses, aucune marque : 119 constructions comparées au `construireJobs` de
  HEAD, lecture au clic comprise, 0 écart).
- ⛔ (11/11, décision de Nico : « vraie photo seule ») LA FICHE PREND LES PHOTOS ENVOYÉES : un retrait ne pose JAMAIS
  `lbcPhotosCapped`, et `spend_coins_and_publish` (la liste la plus longue des tâches non plafonnées, garde « AND NOT
  plafonne ») réécrit `inventaire.photos` = les vraies photos — l'image par défaut quitte la fiche, une vraie photo
  ajoutée dans le stepper y arrive. Fiche [D] + R ajoutée → tâches [R], fiche [R] ; fiche [D, R] → tâches [R], fiche
  [R] ; fiche aux photos normales → fiche inchangée (réécrite avec la même liste, comme avant). Le lot publie par le
  même `construireJobs` : même règle. Les DEUX causes ensemble (un retrait ET un vrai plafond Leboncoin, « Divers >
  Autres », 3 photos gratuites) : la tâche Leboncoin garde son `lbcPhotosCapped` (un extrait ne réécrit jamais la
  fiche, règle du 27/09) ; les autres plateformes du même clic, entières, réécrivent la fiche. Choix fait pour
  Leboncoin plafonné SEUL : la fiche n'est pas réécrite (3 photos ne remplacent jamais la fiche) — l'image par défaut
  y reste, reconnue et retirée à chaque publication ; elle part de la fiche dès qu'une autre plateforme est publiée.
  Même chose quand toutes les plateformes cochées ont des photos choisies sur leur carte (règle du 30/10, inchangée).
- ⛔ Les marques d'un retrait ne reviennent jamais sur la CARTE ni dans une NOUVELLE publication du stepper : la fusion
  de la catégorie résolue dans la carte (`edited`, puis le brouillon `fiches_annonce`) ne les recopie pas
  (`sansMarquesDuRetrait`), et `construireJobs` ôte celles qu'une carte porterait encore (`retirerMarquesDuRetrait`,
  signées par `photosRemplissageRetirees` : une carte d'avant le 11/11 n'est pas touchée) — 2e publication du même
  article après retrait de l'image de la fiche = aucune marque. MAIS une REPUBLICATION (`spend_coins_and_republish`) et
  une RELANCE PAR COPIE (Stock, « relancer » une tâche échouée) d'une tâche où une image a été retirée recopient ses
  `platform_fields`, marques comprises (`photos_choisies`, `photosRemplissageRetirees`) : elles repartent avec les
  seules vraies photos de cette tâche, dans son ordre — l'image par défaut reste dehors, voulu (verrou : la règle de
  l'ordre, `_shared/ordre-photos.js`, exécutée) —, mais la règle du 06/11 « l'ordre de l'article fait foi » ne
  s'applique plus à elles (`photos_choisies` : le job garde les siennes), et une photo ajoutée plus tard à la fiche ne
  les rejoint jamais. Une relance par copie passe par `spend_coins_and_publish` : sans `lbcPhotosCapped`, elle réécrit la
  fiche avec les photos de la tâche (ses vraies photos d'alors). Ces fonctions serveur ne sont pas changées.
- « Où publier ? », quand les seules photos sont des images par défaut connues : une phrase, par les traductions de
  l'app (clé `ouPublierVraiePhoto`) — « Ajoute une vraie photo de ton article pour le publier. » / « Add a real photo of
  your item to publish it. » Le libellé du bouton ne change pas (clé `ctaAddAtLeastOnePhoto`, lue aussi par la coque).
  « L'image est celle que Beebs affiche… » (fiche de l'article) et « l'image vient de Beebs » (ligne du lot) ne se
  disent que pour l'image de Beebs reconnue à l'identique (`imageParDefautDe`). Aucun autre texte neuf.
- ⛔ (11/11 vers 14:50, choix b de Nico) RECONNUE À L'IDENTIQUE, ZÉRO FAUX POSITIF — « on ne retire jamais une photo sur
  un doute ». La LISTE FERMÉE vit dans `src/publication/lot/imagesParDefaut.js` (`IMAGES_PAR_DEFAUT`, datée, son
  origine dite) : aujourd'hui UNE image, celle de Beebs — un pictogramme de casquette, 200 × 200, JPEG de 3 066 octets,
  SHA-256 `f0b31c8669a358d81d37c4c9ab7f686b56872aa21a52599c5940373558aacc66`, servie à
  `https://cdn.beebs.app/7c49fc10-d3ac-40cc-8042-90523132ad74.jpg` (objet du CDN daté du 15/03/2023). Relevée le 11/11
  sur l'annonce Beebs du cas du 26/10 (compte de Nico) : la photo lue sur l'annonce (capture) est cette image, la fiche
  en porte la copie `rapatrie-fiche/` aux MÊMES octets (le rapatriement de handler-watch recopie les octets tels quels).
  Une seule annonce de la base la portait (sur 8 916 annonces Beebs) : que Beebs serve toujours cette adresse n'est pas
  prouvé — d'où deux reconnaissances exactes : l'ADRESSE exacte (photo encore chez Beebs : aucun téléchargement, et
  `cdn.beebs.app` ne sert aucun CORS) ; les OCTETS exacts (sa copie chez nous, bucket `listing-photos` hors `raw/` et
  `enhanced/` : une taille annoncée (Content-Length) qui n'est celle d'AUCUNE image de la liste coupe la lecture sur les
  en-têtes — le stockage sert les images sans compression, Content-Length = la taille exacte, vérifié le 11/11 ; sinon
  la lecture s'arrête dès qu'elle dépasse la plus grande image connue ; puis SHA-256, par WebCrypto ou, quand la page ne
  l'a pas (la vue web iOS, `capacitor://localhost`), par un SHA-256 en JavaScript pur (`sha256HexJs`, même empreinte,
  vérifiée par le verrou). Copie de test : `scripts/fixtures/image-par-defaut-beebs.jpg`.
- La lecture (`lot/photoVide.js`) : en arrière-plan, SEULEMENT ce que l'affichage demande — la 1re photo (vignette du
  lot, bouton), puis la suivante seulement si celle d'avant est une image par défaut reconnue (cascade : deux images
  par défaut et rien d'autre se lisent toutes deux). Le corps de l'effet est une fonction pure (`lireEnArrierePlan`) ;
  la vignette du lot vit dans son module (`lot/VignetteLot.jsx`), lit aussi les photos de la fiche quand elle montre
  leur copie rédigée (une retouche de l'image par défaut ne compte pas pour une vraie photo) et ne dit au lot « une
  vraie photo » / « Sans photo » (`onVide`) qu'une fois la lecture CONCLUE — jamais sur une lecture ratée, comme avant
  le 11/11. Au CLIC qui construit les tâches (`reconnaitreAuClic`, unité et lot, prioritaire) : toutes les photos qui
  peuvent partir, attente bornée à 4 s (`DELAIS.auClicMs`) ; déjà lues = aucune attente. Le moteur PRÉ-LIT ces photos
  tant que l'article n'est pas parti (`prelireImagesParDefaut`, petite priorité) — dans le LOT (qui publie ses articles
  l'un après l'autre) pendant la préparation, à l'unité dès « Où publier ? » : mesuré sur un lot de 30 articles à
  5 photos, l'attente ajoutée au clic passe de 9,6 s à 0 s (stockage à 150 ms par requête) et de 90 s à 0 s (1,5 s par
  requête), la pré-lecture prenant 6 s / 57 s pendant la préparation, sans rien bloquer (un clic plus rapide que la
  pré-lecture n'attend que ce qui reste, 4 s au plus par article). 4 lectures à la fois (1re photo et clic devant), 8 s
  par lecture, un résultat par adresse pour la session (un « null » se relit plus tard) ; une réponse d'erreur est
  coupée (corps jamais téléchargé), une estimation abandonnée arrête le chargement de l'image ; la file se libère
  quand l'écran qui l'a demandée se ferme. Ne se lit qu'une photo venue d'une plateforme (jamais
  `blob:`/`data:`, `<uid>/raw/`, `<uid>/enhanced/`). ⛔ Non lue, illisible, lue trop tard ou seulement douteuse = VRAIE
  photo, gardée et MONTRÉE (la vignette n'affiche « 📦 » qu'à la place d'une image reconnue).
- L'ESTIMATION (`estPhotoDeRemplissage`, `lot/ficheLue.js`, inchangée : ≤ 256 px ET ≤ 40 couleurs) ne retire plus rien :
  sur la photo où la cascade s'arrête (à l'unité et dans le lot, par le moteur), une photo jugée douteuse et non
  reconnue est SIGNALÉE — une ligne `usage_logs`, `feature = 'photo_par_defaut_douteuse'`, `metadata = { inventaire_id,
  photo }` (le compte = `user_id`), une fois par photo et par session — et reste dans l'annonce (une petite photo noir et
  blanc réelle part). Pour lister les cas douteux (≈ 3 700 lectures d'index, aucun balayage) :
  `select (l.created_at at time zone 'Europe/Paris') as le, left(p.id::text, 8) as compte, l.metadata->>'inventaire_id'
  as fiche, l.metadata->>'photo' as photo from public.profiles p cross join lateral (select u.created_at, u.metadata
  from public.usage_logs u where u.user_id = p.id and u.feature = 'photo_par_defaut_douteuse' and u.created_at > now()
  - interval '30 days' order by u.created_at desc limit 50) l order by l.created_at desc limit 200;`
  Ajouter une image à la liste : la REGARDER, relever son adresse, sa taille et son SHA-256 (`sha256sum`), une entrée
  datée dans `IMAGES_PAR_DEFAUT`, un cas au verrou.
- ⛔ Ce qui peut ENCORE envoyer une image par défaut (ces chemins ne passent pas par `construireJobs`, donc pas par
  cette règle — non vérifié chemin par chemin) : une REPUBLICATION et une REMISE EN VENTE (elles reprennent des photos
  déjà enregistrées : tâche d'origine, fiche), et la RELANCE PAR COPIE d'une tâche née avant le 11/11 (ses photos sont
  celles d'alors). Une tâche née depuis dont une image a été retirée porte ses seules vraies photos et
  `photos_choisies` (jamais complétée par celles de la fiche) ; la fiche, elle, a perdu l'image (sauf Leboncoin
  plafonné seul, plus haut).
- ⛔ Conséquence visible de la recopie Vinted (gardée, décision de Nico) : une annonce Vinted à UNE photo part avec
  TROIS fois la même photo (à deux photos : a, b, b). L'extension complète toute annonce Vinted à 3 photos en recopiant
  la dernière (`VINTED_MIN_PHOTOS`, `chrome-extension/content-scripts/vinted.js`) parce que Vinted en exige 3 sur
  certains articles haut de gamme sans dire lesquels ; une seule photo suffit désormais pour publier, ce cas devient
  fréquent (imports eBay à une photo). Les autres plateformes partent avec la photo seule.
- Inchangés : le lot (sélection « Sans photo », questions, jauges, quotas, ordre, pilote), le serveur (ne refuse que
  0 photo ; aucune garde serveur des images par défaut — proposée à Nico pour plus tard), l'attente de lecture de
  l'annonce d'origine, la republication, l'extension. Verrou : `selftest:une-photo-suffit` (168 contrôles, dont la
  reconnaissance avec les vrais octets, avec et sans WebCrypto, la petite photo noir et blanc gardée et signalée, la
  file, le délai, la relecture d'un « null », la pré-lecture du lot, le refus qui arrête le clic, les types recalculés,
  les marques d'une publication à la suivante, la fiche après publication (règle du serveur lue dans sa migration et
  rejouée), et le crochet et la vignette du lot MONTÉS — un React minimal, effets compris, la mémoire de la session
  remise à zéro avant chaque montage).

## ⛔ 11/11 soir — « a » : remettre une tâche en file = remettre à zéro TOUS ses compteurs d'essais (décision de Nico)
- Un seul chemin : `remettreEnFile` (`supabase/functions/_shared/remise-en-file.js`) côté serveur (réarmement d'un
  correctif d'extension dans get-pending-jobs, relance d'une cause levée par handler-watch) et sa jumelle SQL
  `public.republication_remise_en_file(pf, par, motif)` (migration 20261111210000 : bouton « Republier maintenant » via
  `relancer_republish`, et TOUT script de réparation : `UPDATE … SET platform_fields = public.republication_remise_en_file(platform_fields, '<qui>', '<pourquoi>')`).
- Remis à zéro (archivés dans `recreation_essais_avant_relance`) : recreation_retries, recreation_reprises,
  recreation_reprise, recreation_bloquee, needsUserAttempts, needsUserBoucle, needs_user_tick_le, needs_user_actif_ms,
  pas_de_rouge_reprises, stale_recoveries, deleted_hang_count ; `recreation_tentee.n` → 0, son HEURE gardée.
- ⛔ GARDÉS (décision a.1 de Nico) : `recreation_envois` et l'heure de `recreation_tentee` — ce sont les preuves
  anti-doublon (dressing relu avant toute recréation), jamais des compteurs : les effacer ouvre la porte à un doublon.
- Cas : compte 64eab2f9, 5 republications Vinted remises en file le 11/11 (12:50 par un correctif, 18:57 à la main) et
  ressorties par handler-watch dans la minute (essais 2), puis relancées en SQL direct à 20:16 (témoin :
  `scripts/reparations/20261111_relances_manuelles_64eab2f9*.sql`). Verrou `npm run selftest:remise-en-file` (le cas
  réel rejoué : remise en file → plus jamais ressortie par handler-watch avant un nouvel essai ; base jetable).

## ⛔ 12/11 (point 4 de Nico, terminal « Problèmes ») — les publications programmées disent QUAND elles partent, au rythme RÉEL du compte
- Cas : compte 229c7b07 (créneau du soir 19:00–22:00) a relancé 3 lots et en a annulé 2 — rien ne disait qu'ils attendaient
  19:00. Règle de Nico (12/09) : l'écran dit ce qui va RÉELLEMENT partir, jamais un chiffre théorique. Décision du 12/11 :
  l'heure de DÉBUT du créneau est dite (« ce soir à partir de 19:00 ») — remplace, pour ce seul cas, « jamais une heure »
  de D4 ; aucune heure de passage n'est promise.
- `src/utils/rythmeProgramme.js` (pur) + `src/utils/useRythmeProgramme.js` (une lecture à l'ouverture, 5 min de fraîcheur,
  pages de 1 000, rien d'écrit). Réglage et rythme INTOUCHÉS (`_shared/publication-programmee.js` identique).
- **Formule du rythme** : servies réelles (`programmee_servie_le`) des 14 derniers jours, jour local du réglage ; un jour
  compte s'il était PLEIN (dernière servie dans les 30 dernières minutes du créneau, ou plafond atteint) ; **N = médiane
  des 3 derniers jours pleins**, bornée au plafond ; le jour en cours ne compte jamais ; aucun jour plein → aucun chiffre
  (« ton rythme habituel s'affichera après un premier créneau complet »). **Fin estimée** : (programmées déjà en attente +
  publications du lot) ÷ N par créneau, sur les jours actifs, depuis le prochain créneau (au prorata s'il est en cours),
  dite « vers le samedi 21/11 ».
- Où : feuille du lot (phrase sous « Programmer », ligne « Programmé : partira ce soir à partir de 19:00 », redite à la fin
  de l'envoi) ; « Ta file » et le suivi (`situationJob`, motif `programmee` : « Programmée : partira ce soir à partir de
  19:00, une à la fois » / « elle part en ce moment, jusqu'à 22:00 » / « demain soir »), icône horloge.
- Verrou `npm run selftest:programmees-verite` (rejeu des servies réelles de 229c7b07 : 39 par soir ; 4cfb7afe : aucun chiffre).

## ⛔ 12/11 (point 8 de Nico, terminal « Problèmes ») — une rédaction n'est JAMAIS coupée : ce qui traîne part tel quel
- Cas : 12/11 15:25 et 15:28 (ebdf29f0), 09/11 12:46 (229c7b07) — generate-listing coupé à 150 s (504), le client perdait le
  texte ET la fiche (enregistrée par le serveur après la rédaction). Cause : l'envoi Storage d'une photo re-hébergée (et
  d'une photo retouchée) n'avait aucun délai — « Gateway Timeout » à ~60 s, 3 essais par photo, photo après photo.
- **La règle** : chaque étape a une ÉCHÉANCE comptée depuis le début de la requête (`_shared/delai-etape.js`, une seule
  source) — re-hébergement des photos externes fini à +45 s ; retouche finie à +100 s, pas lancée s'il ne reste pas 25 s ;
  chaque envoi Storage abandonné après 12 s ; rédaction (textes, icône) finie à +140 s ; 10 s pour enregistrer la fiche.
- Ce qui n'est pas prêt à l'échéance part TEL QU'IL EST : la photo d'origine (URL d'origine, ou photo non retouchée — la
  retouche abandonnée n'est pas comptée livrée) ; le texte de repli d'un appel en échec (titre et description de la fiche,
  unité rendue si aucun texte n'a abouti). Jamais un échec, jamais un appel en plus (même coût), même qualité quand tout
  répond à temps. `redigerAnnoncesPlateformes` prend l'échéance en option (`signal`) : Lens, sans elle, comme avant.
- ⛔ Une étape nouvelle de generate-listing qui attend un service (Storage, IA, réseau) prend son délai dans
  `delai-etape.js` — jamais une attente nue. Verrou `npm run selftest:redaction-jamais-coupee`.
