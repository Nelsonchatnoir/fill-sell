# Reprise — terminal « Problèmes », 05/11/2026 (nuit, matin, midi)

Écrite le 05/11 vers 13:35 (heure de Paris), avant le `/clear` demandé par Nico. Elle couvre les points 1 à 10 de
Nico et ses feux verts du 05/11. Pour chaque point : l'état exact, les commits, les fichiers, ce qui attend un
déploiement, et ce qui n'est pas fini ou pas prouvé.

- État de prod de référence : `docs/agents/etat-2026-10-01.md`, sections « 05/11 » (nuit, matin, midi).
- Dossier partagé avec le **terminal Cloud**. Son essai sur cloud-2 dure jusqu'au 05/11 vers 18:00.
  - Ses commits du jour : d3ac9a7, 2d943b8, d41332e, 7c48b8c.
  - Jamais toucher à ses fichiers : `serveur-cloud/`, `scripts/cloud*`, `scripts/reparations/20261105_cloud_*`,
    `docs/enquetes/beebs-cloud-0411/`.
- `main` = `origin/main` = 7c48b8c au moment de l'écriture (arbre propre).

## 0. Ce qui attend Nico (par ordre d'urgence)

1. **get-pending-jobs, toujours en v329** (contenu 7060c6c, déployé le 04/11 au soir par le terminal fill-and-sell-07).
   - Tant qu'il n'est pas redéployé, la 1re visite de contrôle de chaque NOUVELLE pause Leboncoin est servie
     « devant ». L'extension (≥ 0.6.170) la refuse.
   - L'essai compte alors 2 h « en cours » avant le passage suivant.
   - Comptes exposés : 25caeedd (2 retraits en file), 521b7f89 et 6a7595b1 (Chrome fermé, 1 retrait chacun).
   - Nico a dit : fonctions communes après 18:00 avec son accord. Je lui ai proposé de déployer gpj tout de suite ou
     avec les autres. **Pas de réponse à ce jour.**
2. **Après 18:00, avec l'accord de Nico** : get-pending-jobs, update-job-status, handler-watch, extension-session,
   depuis HEAD (détail en § 3).
3. **Migration 20261105110000**, écrite et prouvée 52/52, **non appliquée**. Il faut le feu vert nommé
   « feu vert sur 20261105110000 » (§ 4).
4. **Décision « reprise_connexion »** : faut-il rallumer la relance automatique ? (§ 2, feu vert point 4).
5. **Point 10A** : correctif proposé, non codé. Il demande un essai réel sur le compte Leboncoin de Nico, puis une
   migration et une extension.
6. **Point 8a** : quel rayon Leboncoin pour un produit de beauté ? Leboncoin n'en a pas.
7. **Zip 0.6.173** à téléverser par Nico :
   `C:\Users\nicol\fill-and-sell\build\CWS-0.6.173-A-TELEVERSER\fillsell-extension-0.6.173-cws.zip`
   (612 813 octets, BUILD_ID `2026-11-05T10:40:42Z+d3fc0cd`).

## 1. Commits de ce terminal (tous poussés)

| Commit | Heure (Paris) | Contenu |
|---|---|---|
| 293b8b7, f153ea3 | 04/11 23:06 | Extension 0.6.172 (numéro seul, contenu de la 0.6.171) + EXTENSION_LAST_COMMIT |
| 28eb107 | 05/11 00:45 | Point 1 (nuit) : position d'un job lue en base (`barresJobs.js`, `BarreProgression.jsx`) |
| 883f987 | 05/11 00:45 | Points 2 et 3 côté extension 0.6.173 (Vinted /main/banned, rejeu 503, session non purgée) |
| 1d7140b | 05/11 00:45 | Points 2 à 5 côté serveur (préparé), migration 20261105010000 écrite |
| 1aaec1a | 05/11 00:46 | EXTENSION_LAST_COMMIT = 2026-11-04T23:45:31Z (883f987) |
| 2c9c876 | 05/11 10:52 | Feu vert du matin : migration appliquée, réparation des visites, alerte ops-digest, 2 selftests, migration 20261105110000 écrite, article vendu retenu |
| 743f7f6 | 05/11 10:52 | URGENT point 1 : bandeau « En cours » du Stock = barre du job qu'il nomme |
| 84313c8 | 05/11 11:38 | Points 6 à 10 : caractères invisibles (serveur + extension 0.6.173), verdicts 7 à 10 dans les docs |
| d3fc0cd | 05/11 11:39 | EXTENSION_LAST_COMMIT = 2026-11-05T10:38:56Z (84313c8, %ct 1793875136) |

## 2. Les points, un par un

### Point 1 — Barre de progression (nuit, puis URGENT du matin) — FAIT, DÉPLOYÉ (web)
- **Nuit (28eb107)**. La barre comptait depuis l'ouverture de l'écran, pas depuis le job.
  - `positionJob` / `pisteJob` (`src/utils/barresJobs.js`) lit l'étape et les heures en base. La valeur est
    la même partout, affichée tout de suite, jamais en recul (`CAP_ESSAI = 0.6`).
  - `BarreProgression.jsx` pose la piste `reprise` à sa vraie position.
  - L'ordre et la logique des étapes ne changent pas.
  - Web servi (1aaec1a constaté sur fillsell.app). L'app mobile ne l'aura qu'avec le binaire 2.9 (aucune OTA).
- **URGENT (743f7f6)**. Le bandeau « En cours » du Stock (`src/tabs/StockTab.jsx`) calculait faites/total : 0 % tant
  qu'aucune plateforme n'était finie, et retour à zéro à chaque réouverture.
  - Il montre maintenant `pisteJob(activite.actif)`, une instance par job (`key`). « N sur M » reste le compteur.
  - Ce n'était pas un cache : il n'y a pas de service worker. Le web relit `/build.json` au retour sur l'onglet et
    toutes les 5 min, puis se recharge une fois par build.
- **Preuve**
  - Selftest `barre-job-position` : 34 contrôles + 4 sur le bandeau.
  - Sur fillsell.app, en WebKit iPhone 13 (profil isolé, compte de Nico, jamais son Chrome) :
    - avant, bandeau 0 % face à 46 % dans la file ;
    - après, 79 % = 79 %, et toujours 79 % après fermeture et réouverture.
  - Les captures ont été envoyées à Nico.
- **Reste** : rien côté web. L'app attend le binaire 2.9.

### Point 2 — sebastien64310, « jeton invalide » au milieu d'une republication — PRÉPARÉ, NON DÉPLOYÉ
- **Cause** : l'Auth Supabase a redémarré le 04/11 à 19:21:46 (environ 6 s).
  - Nos fonctions ont pris cette panne pour un jeton expiré : 401 sur gpj ×6, ujs ×2, extension-session ×1.
  - Une session a été marquée « rejetée » à tort.
  - L'annonce était déjà redéposée ; elle a été reconnue 5 min plus tard.
- **Correction (1d7140b + 883f987)**
  - `_shared/auth-indisponible.js` : seule une réponse 4xx vaut un refus. Sinon, la réponse est 503
    `auth_indisponible`. Concerne gpj, ujs et extension-session.
  - `_shared/republication-hors-ligne.js` : une coupure d'Auth fait reprendre le redépôt dans 1 min, anti-doublon
    forcé.
  - Extension 0.6.173 (`background.js`) : un 503 `auth_indisponible` est rejoué après 2, 5 puis 10 s. Une panne de
    refresh (5xx, 429, réseau) ne purge plus la session.
- **Preuve** : selftests `auth-indisponible` (vrai client Supabase sur 521, 503, réseau coupé) et `jeton-401-rejeu`
  (cas 8 à 11). Aucun essai réel.
- **Attend** : déploiement de gpj, ujs et extension-session, plus le téléversement de la 0.6.173. Rien n'a été
  touché chez lui.

### Point 3 — lp.vtd89, compte banni par Vinted — PRÉPARÉ, NON DÉPLOYÉ
- **Cause** : `/main/banned` n'était reconnu qu'au retrait. À la publication, c'était un « refus passager » :
  4 essais en 23 min.
- **Correction**
  - Extension 0.6.173 (`content-scripts/vinted.js`) : la page `/main/banned` exacte arrête le dépôt, avec
    `attenteMotif` `compte_vinted_bloque`.
  - `update-job-status` : `essaiSurPageCompteBloque` (`_shared/vinted-compte-bloque.js`) reconnaît aussi la page
    sur les extensions déjà installées.
  - `_shared/cause-blocage.js` classe le cas en refus plateforme `compte_bloque`. ops-digest a été redéployé en
    v46 la nuit pour ce classement.
- **Preuve** : selftest `vinted-depot-compte-bloque` (26 contrôles), `cause-blocage` (1b). Aucun essai réel.
- **Attend** : déploiement d'update-job-status et la 0.6.173. Son job était déjà arrêté. Aucun mail.

### Point 4 — louis-seller (délégué à Amiral) et les pauses Leboncoin — FAIT pour Louis et Amiral ; reste préparé
- **Cause**
  - La visite de contrôle d'une pause Leboncoin (`controle_blocage_lbc`) était effacée sans bruit par
    `garde_releve_sans_geste`, absente de `releve_est_veille`. Le 04/11 : 690 visites effacées pour Amiral
    (faf5021a), 7 comptes touchés.
  - Amiral en pause = son extension ne fait plus le travail de Louis : retrait 69f89a6d en attente depuis le 03/11.
- **Correction**
  - Migration **20261105010000** (`releve_est_veille` + `controle_blocage_lbc`) : APPLIQUÉE le 05/11 vers 09:41
    (`db query --linked -f` + `migration repair --status applied`).
    - md5 du corps en prod après application : `3c9435a12577af8631b2c32d2f66a597`.
    - Inverse : `supabase/rollbacks/20261105010000_releve_controle_blocage_lbc_INVERSE.sql`.
    - Preuve : 29/29 sur Postgres jetable (`scripts/preuve-releve-controle-blocage-lbc.mjs`).
  - get-pending-jobs (préparé, 1d7140b) : la visite n'est plus servie « devant » ; une ligne avalée est
    journalisée ; le propriétaire délégué voit un message vrai (`messageTacheDelegueeEnPause`, dans
    `_shared/delegation-leboncoin.js`).
  - « Débloque-le maintenant » (ordre de Nico) : la v329 avait perdu les 4 premières visites. Elles ont été rendues
    par le script de réparation (§ 5) à 09:48.
- **Constaté en base**
  - Pauses levées à 09:51 : Amiral (09:51:19), 7e1a0836, a3002ab6.
  - Retrait 69f89a6d (Playmobil) fait à 09:52:20 : URL et titre vérifiés, confirmation de Leboncoin. Le relevé
    suivant de Louis compte 403 annonces au lieu de 404.
- **État des comptes débloqués, lu à 11:41**

  | Compte | État |
  |---|---|
  | 7e1a0836 | reprise, 3 départs (ses 2 retraits sont partis) |
  | a3002ab6 | reprise, 2 départs |
  | faf5021a (Amiral) | reprise, levée à 09:51 |
  | 447d920c | libre, 1 départ |
  | 229c7b07 | libre |
  | f44b5917 | libre, 4 départs |
  | 25caeedd | **toujours en pause** : visite faite, mais Leboncoin n'a pas rendu la liste ; 2 retraits en file |
  | 521b7f89 | **en pause**, hors ligne depuis 03:41 |
  | 6a7595b1 | **en pause**, hors ligne depuis le 04/11 22:05 |

- **Feu vert du matin, point 5** : alerte « file arrêtée alors que l'extension qui doit l'exécuter est ouverte ».
  - Elle part en ROUGE sur support@fillsell.app, pour tout le parc, délégation comprise. **ops-digest v46 → v47
    DÉPLOYÉ** (verify_jwt false, lu avant et après).
  - Juge : `_shared/attente-extension-active.js` (`filesArretees`, seuil 6 h). Ne sont pas comptées :
    - une pause voulue ;
    - une republication automatique tenue par ses créneaux ;
    - une extension non vue depuis 24 h ;
    - une file qui a fait un départ dans les 6 h.
  - Rejouée sur la prod : 11 comptes.
- **Reste**
  - Le déploiement de gpj (voir § 0.1).
  - 25caeedd, 521b7f89 et 6a7595b1 sont encore en pause (non résolu).
  - **Aucun mail ops-digest réel n'a encore montré la section** : 1er envoi au prochain digest quotidien (cron 08:50
    UTC, donc le 06/11 vers 09:50 à Paris).

### Point 5 — Trois motifs « geste attendu » (audit de nuit) — PRÉPARÉ, NON DÉPLOYÉ
- **introuvable_a_confirmer** : 10 lectures sur 11 sont justes ; Dylan est douteux.
  - Défaut : le relevé de confirmation n'était pas redemandé.
  - Correction : `borneReleveAttendu` (`_shared/introuvable-a-confirmer.js`), dans handler-watch. Cadence de 6 h
    inchangée.
- **grille_incoherente** : 5 jobs sur 5 sont des défauts chez nous.
  - Correction : `CODES_CHAMP_VINTED` (`_shared/vinted-grille-servie.ts`) et « UK 8 child » = « UK 8 enfant »
    (`_shared/vinted-taille-republication.ts`).
  - labouquinerie85 : bug de la 0.6.149, déjà corrigé ; ses jobs repartent avec sa mise à jour.
  - abenjemaa : l'article est vendu. Son job est **retenu** needs_user « article_vendu » (règle du 25/09), plus
    fermé : changé dans 2c9c876 (handler-watch + `MESSAGE_REPUBLICATION_ARTICLE_VENDU` dans
    `_shared/relance-apres-maj.js`).
- **capture_incomplete** : seul le job de linda est un défaut chez nous.
  - Correction : `_shared/capture-libelle.js`, utilisé par handler-watch (balayage) et ujs (3 reprises au plus).
  - LES PETITES FIOLES : vraie restriction Vinted. Anthony : compte inactif.
- **Feu vert du matin, point 4 (décidé par Nico)** :
  - rouvrir `reprise_connexion` et `serveur:levee_antirobot` ;
  - refuser à la source une republication dont l'annonce est sue partie.

  Tout est dans la migration **20261105110000, NON APPLIQUÉE** (§ 4). Le miroir de l'app
  (`src/utils/declencheursReleve.js`) a déjà les deux déclencheurs, et les selftests `releve-veille-miroir` et
  `releve-fin-claire` ont été adaptés.
- **Non tranché** : `reprise_connexion` ne sera posé par personne même après la migration. handler-watch a
  `RELANCE_AUTOMATIQUE_RELEVE = false` depuis la règle de Nico du 05/10, et ce code mort vise encore Opla et eBay.
  Décision de Nico attendue.
- **Preuve** : selftests `capture-libelle`, `introuvable-a-confirmer`, `tailles-prefixe-age`,
  `vinted-grille-servie`, `relance-apres-maj` (+2 contrôles « article vendu »).

### Point 6 — Smail Lachkar, caractère invisible — PRÉPARÉ (serveur) + DANS LA 0.6.173 ; NON DÉPLOYÉ
- **Cause** : un U+200B en tête du titre et de la description, venu de son annonce Leboncoin importée (relevé du
  03/11). Sur le parc : 18 titres et 527 descriptions. Rien ne vient de notre génération.
- **Correction (84313c8)**
  - `_shared/caracteres-invisibles.js` retire les invisibles : largeur nulle hors emoji (le ZWJ entre emojis est
    gardé), marques de sens, contrôles, trait d'union conditionnel.
  - Les espaces spéciales deviennent ordinaires. Les accents et les emojis restent. Aucune regex lookbehind
    (vieux Safari).
  - Au service : get-pending-jobs (`jobSansInvisibles`, AVANT `jobDansLaLimitePhotos`).
  - Avant de taper : extension 0.6.173 (`nettoyerInvisibles` dans `sanitizeJob`, titre ET description).
  - Un refus Vinted « caractères spéciaux » repart seul une fois (`_shared/pas-de-rouge.js`, motif
    `vinted_titre_invisibles`).
  - Un job déjà arrêté est tranché par la règle 10 de `_shared/questions-tranchees.ts` (handler-watch).
  - La fiche de Smail n'est pas modifiée.
- **Preuve** : selftest `caracteres-invisibles` (32). Aucun essai réel.
  - Deux rouges de la suite venaient de mon code et sont corrigés : `titre-copie-vinted` (un titre garde ses
    retours à la ligne) et `photos-limite-vinted` B2 (ordre des `map`).
- **Pas prouvé** : le job de Smail (ee5fc232) doit repartir seul au déploiement de handler-watch, puis partir
  propre par gpj. À lire en base après le déploiement.

### Point 7 — XEWER, publications Beebs en échec — VERDICT : modération Beebs (rien à corriger)
- 32 annonces ont reçu un numéro Beebs, ont été vues « en vérification » au dépôt, puis ont disparu de deux relevés
  complets.
- 17 autres datent de septembre, avant la preuve du numéro Beebs : dépôts confirmés, jamais apparus.
- Les envois sont identiques aux dépôts acceptés le même jour. Aucun numéro mal rattaché, aucun doublon en ligne.
- Règle écrite dans `docs/regles/plateformes.md` (05/11 midi). Aucune republication lancée, aucun mail.

### Point 8 — Dylan62 — VERDICTS ; un défaut NON CORRIGÉ (question à Nico)
- a) Les questions Leboncoin « Produit » / « Univers » suivent la règle du 02/09 (jamais de repli statique) : normal.
  eBay « Type » / « Produit » sont exigés par eBay puis remplis : normal.
  - **Défaut** : le coffret beauté (Vinted « Soins du corps ») a été classé « Maison & Jardin > Décoration » par
    notre arbitrage de rayon Leboncoin.
  - **Non corrigé** : Leboncoin n'a pas de rayon beauté, la décision revient à Nico.
- b) Ses 16 relevés Beebs = 15 clics « Synchroniser » + 1 veilleur, pas une boucle.
  - Son compte Beebs neuf a « Mes annonces » vide alors que l'index public montre 1 annonce. 37 relevés Beebs
    corrects ailleurs la même nuit.
  - C'est une particularité Beebs. Notre lecteur n'a rien conclu, à raison.

### Point 9 — louis-seller, 2 échecs Beebs depuis le 20/10 — VERDICT : refus de Beebs
- Les numéros 34200634 et 34200711 ont été reçus puis vus en vérification. Ils sont absents des relevés du 23/10.
- 5 dépôts identiques sont passés en ligne la même nuit. Le T-shirt avait été déposé 6 fois du 18 au 20/10.

### Point 10 — Louis (louis-seller + Amiral) — VERDICTS ; correctif A NON CODÉ
- **A) 3 ventes Leboncoin du 05/11 09:53, non rattachées**
  - Elles viennent du lecteur des transactions Leboncoin. Cette API ne donne AUCUN numéro d'annonce, donc les ventes
    `source releve` (avec `commande_ref`) ne se rattachent jamais. Amiral en a 57 dans ce cas, louis-seller 5.
  - En délégation, elles s'écrivent chez le compte qui relève.
  - Lues seulement le 05/11 : le cycle délégué était arrêté par la pause d'Amiral (point 4).
  - Article par article :
    - « Lot 3 livres » (annonce 3291650596, louis-seller) : vente 332939 du 28/10, copies déjà retirées. La vente
      458085 du 05/11 est un doublon.
    - « Rangement Noir et Gris » (annonce 3297299585, Amiral, article en série) : vente écrite chez louis-seller.
      Ses copies Beebs et Opla restent légitimement en ligne.
    - « Lot de 2 articles » : numéros introuvables avec nos données (vente groupée).
  - Aucun retrait à lancer.
  - **Correctif proposé, non codé** : retrouver le numéro de l'annonce en comparant l'image de la transaction à la
    photo de l'annonce. Il faut un essai réel sur le compte Leboncoin de Nico, puis une migration et une extension.
    En attente de Nico.
- **B) Bordereaux Vinted « tout seuls »** : comportement voulu depuis le 26/10 (décision de Nico du 24/10).
  Réglage par compte : `platform_settings.bordereaux.auto`, dans Réglages > Bordereaux.
- **C) Ventes en double depuis le 28/10** : vérifié par fiche, plateforme et numéro d'annonce, aucun article unique
  vendu deux fois.
  - Les deux fiches « Mickey » ont chacune leur annonce Vinted : ce sont deux exemplaires. Question pour Louis via
    Nico.
  - **Non creusé** : la commande Vinted 23492733379 n'a aucune ligne de vente.
- Aucun mail à Louis : c'est Nico qui lui répond.

## 3. Fonctions edge : en prod et à déployer

Versions lues le 05/11 vers 11:40. **Relire `functions list` (version et verify_jwt) juste avant de déployer.**

| Fonction | En prod | Ce que HEAD ajoute | Quand |
|---|---|---|---|
| get-pending-jobs | v329 (= 7060c6c) | 1d7140b (auth 503, visite de contrôle non « devant », messages de délégation), 84313c8 (invisibles) | Proposé tout de suite ; sinon après 18:00 |
| update-job-status | v169 | 1d7140b (auth 503, page bannie Vinted, capture → libellé, grille Vinted) | Après 18:00, accord de Nico |
| handler-watch | v158 | 1d7140b (borne du relevé attendu, balayage capture), 2c9c876 (article vendu retenu), 84313c8 (règle 10), **7c48b8c (terminal Cloud : annonce confirmée disparue)** | Après 18:00, accord de Nico, **à coordonner avec le terminal Cloud** |
| extension-session | v13 | 1d7140b (auth 503) | Après 18:00, accord de Nico |
| ops-digest | **v47 DÉPLOYÉ** | — | fait |

- Modules partagés modifiés, et leurs fonctions : auth-indisponible, capture-libelle, delegation-leboncoin,
  introuvable-a-confirmer, relance-apres-maj, republication-hors-ligne, vinted-compte-bloque, vinted-grille-servie,
  vinted-taille-republication, caracteres-invisibles, pas-de-rouge, questions-tranchees. Ils ne sont importés que
  par les 4 fonctions ci-dessus et par ops-digest (déjà à jour).
- Erreurs de typage deno déjà présentes, hors de mes lignes : gpj vers la ligne 2863, handler-watch vers la ligne
  396.

## 4. Migrations

| Version | État | Fichiers | Preuve |
|---|---|---|---|
| 20261105010000_releve_controle_blocage_lbc | **APPLIQUÉE** le 05/11 vers 09:41, plus `migration repair` | `supabase/migrations/…sql`, `supabase/rollbacks/…_INVERSE.sql` | 29/29 jetable (`scripts/preuve-releve-controle-blocage-lbc.mjs`) |
| 20261105110000_releves_rouverts_republication_partie | **ÉCRITE, NON APPLIQUÉE** : feu vert nommé requis | `supabase/migrations/…sql`, `supabase/rollbacks/…_INVERSE.sql` | 52/52 jetable (`PREUVE_PG=embarque node scripts/preuve-releves-rouverts-republication-partie.mjs`) |

Contenu de 20261105110000 :
- `releve_est_veille` : ajout de `reprise_connexion` et `serveur:levee_antirobot`. Les déclencheurs déjà acceptés
  sont vérifiés intacts.
- `republication_annonce_partie(p_user, p_inventaire_id, p_platform, p_listing_id)` est le juge unique :
  - `annonce_vendue` si `transaction_plateforme='sold'` ou si un dépôt publié porte `sale_signal 'sold'` sur le même
    numéro ;
  - `annonce_partie` si l'annonce est `unavailable` ou disparue, et pas revue depuis.
- `spend_coins_and_republish` refuse ces annonces avant tout décompte (`reason annonce_introuvable`, `motif`,
  message FR/EN). Le reste du corps est recopié de `pg_get_functiondef` en prod.
- Avant d'appliquer :
  - relire le corps en prod de `spend_coins_and_republish` et de `releve_est_veille` ;
  - comparer les md5 sans CR ;
  - si l'un a changé depuis le 05/11 midi, régénérer avec `scratchpad/gen-migration.mjs`. Ce fichier est perdu
    avec la session : refaire depuis la prod.

## 5. Scripts de réparation passés

| Script | Inverse | Passé | Effet |
|---|---|---|---|
| `scripts/reparations/20261105_visites_controle_lbc_servies_devant.sql` | `…_servies_devant_INVERSE.sql` | 05/11 09:48, ordre « Débloque-le maintenant » | 4 essais de contrôle jamais réclamés retirés (Amiral faf5021a, 25caeedd, a3002ab6, 7e1a0836) ; compteur `essais` reculé d'un cran. Sauvegarde : `public._backup_0511_visites_controle_lbc`. Écriture par `platform_settings_fusionner`, garde > 10 comptes. Aucun job, aucune annonce, aucun relevé touché. |

Aucun autre script de réparation n'a été passé par ce terminal le 05/11. La réparation `20261105_cloud_*` est
celle du terminal Cloud.

## 6. Extension 0.6.173

- Contenu :
  - 883f987 : Vinted `/main/banned`, rejeu 503 `auth_indisponible`, session non purgée sur une panne ;
  - 84313c8 : caractères invisibles.
- `EXTENSION_LAST_COMMIT = '2026-11-05T10:38:56Z'` (d3fc0cd). `EXTENSION_MIN_BUILD` non touché.
- Zip construit depuis un worktree propre à d3fc0cd (worktree supprimé). Il est seul dans
  `build/CWS-0.6.173-A-TELEVERSER/`, contenu vérifié.
- La 0.6.172 est rangée dans `build/anciens-zips/CWS-0.6.172-televersee`.
- **Après l'acceptation par le CWS** :
  - ajouter `'0.6.173'` à `ALREADY_PUBLISHED` (`scripts/package-extension.mjs`) ;
  - `EXTENSION_MIN_BUILD = '2026-11-05T10:40:42Z'`, seulement si Nico le décide.

## 7. Selftests

- **Ajoutés** (tous inscrits dans `package.json`) : `barre-job-position`, `vinted-depot-compte-bloque`,
  `auth-indisponible`, `releve-veille-miroir`, `capture-libelle`, `attente-extension-active` (32),
  `delegation-leboncoin-chaine` (29 : retrait, republication, relevé, pause, levée, reprise),
  `caracteres-invisibles` (32).
- **Modifiés** : `file-des-jobs`, `cause-blocage`, `jeton-401-rejeu` (cas 8 à 11), `republication-hors-ligne`,
  `introuvable-a-confirmer`, `releve-fin-claire`, `tailles-prefixe-age.ts`, `vinted-grille-servie-selftest.ts`,
  `relance-apres-maj`, `releve-veille-miroir` (11 déclencheurs, plus de liste « à trancher »).
- **Preuves de migration** (hors suite) : `scripts/preuve-releve-controle-blocage-lbc.mjs`,
  `scripts/preuve-releves-rouverts-republication-partie.mjs`.
- **Suite complète** : 557/557 à 84313c8, lancée au premier plan par tranches, faute de mémoire. Le terminal Cloud
  annonce 558/558 à 7c48b8c.
- **Lint** : rien d'ajouté. Restent les `no-unused-vars` connus (`republication-hors-ligne.js:89`,
  `vinted-compte-bloque.js:96`).

## 8. Pas fini, ou pas prouvé

1. Fonctions communes non déployées (§ 3). Tant que ce n'est pas fait, les points 2, 3, 5 et 6 (côté serveur) et
   le message délégué du point 4 ne sont pas en prod.
2. gpj v329 perd toujours la 1re visite de contrôle de chaque nouvelle pause Leboncoin pendant 2 h.
3. 25caeedd, 521b7f89 et 6a7595b1 sont encore en pause Leboncoin. 25caeedd a 2 retraits en file, les deux autres
   un chacun.
4. Le job de Smail (ee5fc232) devrait repartir seul : à lire en base après le déploiement de handler-watch.
5. Aucun essai réel pour les points 2, 3 et 6 : preuves par selftests seulement.
6. Alerte « files arrêtées » : pas encore vue dans un vrai mail (prochain digest le 06/11 au matin).
7. Migration 20261105110000 non appliquée. La décision `RELANCE_AUTOMATIQUE_RELEVE` (reprise_connexion) n'est pas
   prise.
8. Point 10A : correctif non codé. Point 8a : défaut de rayon non corrigé. Commande Vinted 23492733379 de Louis
   sans ligne de vente : non creusée. Question « Mickey ×2 » pour Louis.
9. Zip 0.6.173 pas encore téléversé. ALREADY_PUBLISHED et EXTENSION_MIN_BUILD restent à faire après
   l'acceptation.
10. Les outils de la session dans le scratchpad (`q.sh`, `gen-migration.mjs`, `preuve-barres.mjs`,
    `files-arretees-prod.mjs`, captures) disparaissent avec elle : rien d'indispensable, tout est refaisable depuis
    le dépôt et la prod.

## 9. Garde-fous en vigueur (rappel de Nico)

- Rien à la main sur les jobs ou les annonces des utilisateurs. Aucun mail (Louis : c'est Nico qui répond).
- Fonctions communes avec le Cloud : après 18:00 et avec l'accord de Nico seulement. Aucune OTA. Ne jamais toucher
  aux fichiers du terminal Cloud.
- Migration : base jetable, puis feu vert nommé, puis `db query --linked -f` + `migration repair`. Jamais
  `db push` ni `db reset`.
- Connexion à fillsell.app : seulement en WebKit isolé, avec des identifiants passés par variables d'environnement,
  jamais écrits. Jamais le Chrome de Nico.
- Lecture en base d'abord, par inventaire_id, plateforme, action et statut. Jamais de conclusion sur un titre seul.

## Phrase de reprise pour une nouvelle session

> Reprends le terminal « Problèmes » du 05/11 : lis `docs/reprise/REPRISE-TERMINAL-PROBLEMES-2026-11-05.md` puis
> `docs/agents/etat-2026-10-01.md` (sections 05/11). Relis `git status` et `npx supabase functions list` avant
> d'agir. Ne déploie rien et n'applique rien sans mon feu vert nommé. Ce qui attend : déploiement de get-pending-jobs,
> update-job-status, handler-watch (à coordonner avec le terminal Cloud, qui y a 7c48b8c) et extension-session
> après 18:00 ; la migration 20261105110000 ; mes décisions sur reprise_connexion, le point 10A et le point 8a ;
> le téléversement de la 0.6.173. Après chaque déploiement, vérifie en base que le job de Smail (ee5fc232) repart
> seul et que les pauses Leboncoin de 25caeedd, 521b7f89 et 6a7595b1 se lèvent.
