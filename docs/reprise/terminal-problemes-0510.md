# Reprise — terminal « Problèmes », lot du 05/10 (clôture)

Mandat de Nico du 05/10 matin : 14 points, chacun corrigé à la racine,
retesté en réel, un seul push. Ce fichier dit ce qui est FAIT, EN COURS et
À FAIRE. État de prod : `docs/agents/etat-2026-10-01.md` § « 05/10 ».

## ⛔ BILAN AVANT /clear (05/10 ~15:30) — LIRE D'ABORD, il remplace les listes « À faire » plus bas

### Fini et prouvé (relu en prod à 15:30)
- Web `2026-10-05T13:07:43Z+b38d842` (entrée 200 avec `Origin`) ; OTA **2.9.55**
  sur production (`channel list`) ; dossier CWS = la seule 0.6.98.
- **eBay, voie = création, TOUS comptes** : 774 jobs d'import (44 comptes,
  772 annonces) réétiquetés `extension`. Sauvegarde prise AVANT l'écriture
  (11:43:40Z) : `scripts/reparations/20261005_ebay_imports_voie_extension_SAUVEGARDE.json`,
  inverse `…_INVERSE.sql`, commit f5d9ff7. Relu à 15:30 : 774/774 en
  `extension`, **0** import encore en `api` sur l'ensemble des comptes. Retrait
  Batman clos (vendu sur eBay).
- Cron 31 `remises-en-vente-5min` actif (10 fiches Vinted de Louis publiées,
  0 doublon) ; remise en vente, colis Vinted, transporteurs LBC, marque :
  prouvés en réel (§ « Fait » plus bas) ; sessions extension 403 corrigées.
- Veille des commandes : interrupteur à 1, amorcée sur le poste de Nico
  (2 traces `amorcage` dans `usage_logs`).

### Livré, pas encore prouvé en réel
- **Louis « Rangement Rouge et Bleu » (1791017762605) et « Rouge et Jaune »
  (1791017762018)** : publiables sur Leboncoin depuis le web b38d842 et l'OTA
  2.9.55. Preuves : index Beebs `Yaourtières` en prod → même feuille d'origine
  que les 10 fiches sœurs, toutes parties le 05/10 vers 10:13 en « Maison &
  Jardin > Électroménager » ; `selftest:origine-index-beebs` vert (aucun refus,
  aucune question de rayon). **Pas encore publiées (0 job LBC)** : au premier
  clic, vérifier `platform_fields.lbcCategoryPath` = Électroménager.
  ⚠️ Le selftest tourne hors ligne : il ne prouve pas le rayon exact.
- eBay `ORDER_CONFIRMATION` : en base, seulement les 8 notifications d'essai
  eBay (14:15–14:32, données factices → `illisible`/`invalide`, attendu).
  Première vraie commande : verdict `valide` + `commandes_ebay` sur le job.
- Veille des commandes : aucune commande neuve vue → relecture prioritaire
  pas encore observée en réel.

### Reste
- **Nico** : téléverser `build/CWS-0.6.98-A-TELEVERSER/fillsell-extension-0.6.98-b7b756c-cws.zip`
  puis « Envoyer pour examen » (0.6.96 et 0.6.97 jamais servies). Ensuite,
  décider s'il force la MAJ (minimum serveur 0.6.81, inchangé).
- Une fois la 0.6.98 servie : Carla / Ciddjy `remplissage_mesures` (lenteur
  Vinted Mac, point 9) ; Joséphine, 8 retraits Beebs à revoir.
- Joséphine, 8 retraits Opla (articles vendus encore en ligne) : elle doit se
  reconnecter à opla.co dans Chrome.
- Nala 377453677328 (nicolas.menar) : question « Déjà vendu ? » ouverte depuis
  le 03/10, attend sa réponse (voulu).
- **Décisions de Nico** : (a) enregistrer seule une vente Vinted prouvée par
  la commande (renverse la règle du 12/07) ; (b) « Petit » n'est plus forcé
  sur la Mode Vinted (« rien de deviné ») : à confirmer.
- Point 11 TRANCHÉ (« jamais bloqué », la limite du jour est dite) ; GO cron
  31 et point 14 FAITS : les mentions « À faire » plus bas sont périmées.

## Sorti
- **Web** : un push sur `main` (Vercel) — commits du 05/10 jusqu'à l'OTA 2.9.54.
- **OTA** : **2.9.54** (canal production relu après envoi).
- **Fonctions** (versions lues dans `functions list`) : get-pending-jobs v216,
  update-job-status v128, handler-watch v81, generate-listing v112,
  voice-intent v155 (`false`), voice-transcribe v46, deal-analysis v42,
  avis-demande v4 — `verify_jwt` relu avant/après, inchangé.
- **Migrations** (appliquées et inscrites) : 20261005090000 (sessions
  extension), 20261005100000 (remise en vente), 20261005110000 (palier).
  **En attente du GO de Nico** : 20261005100100 (cron `remises-en-vente-5min`).
- **Extension** : `build/CWS-0.6.97-A-TELEVERSER/fillsell-extension-0.6.97-ddf3ebe-cws.zip`
  (BUILD_ID `2026-10-05T10:59:34Z+ddf3ebe`), seul dans son dossier ; les zips
  intermédiaires du jour sont dans `build/anciens-zips/`. Minimum serveur
  inchangé (0.6.81). La 0.6.96 (b32685f) était à téléverser avant.

## Fait (point par point)
1. Logo d'une plateforme vendue — règle `vintedPresenceArticle` (annonce de
   la fiche vendue/close/disparue = hors vente ; job neuf postérieur = en
   vente) ; ujs remet `vinted_status='active'` quand la fiche suit une annonce
   neuve. Selftest. Visible après OTA/push.
2. Remise en vente après vente partielle — prouvée en réel (compte de Nico :
   vente d'1 unité sur 2 → recréation automatique sur Vinted 10252167885).
3. Taille de colis Vinted — lot + stepper + retenu par rayon + gpj + 0.6.97 ;
   prouvé en réel (réponse « 5 kg » → package_size_id 8 ; retenu « 10 kg »
   → package_size_id 9).
4. Transporteurs LBC — 0.6.97 pose et relit l'ensemble exact ; cause des
   écarts à 999 € : Leboncoin VERROUILLE Courrier suivi et Colissimo
   au-delà de 400 € ; dépôt et republication prouvés (seul transporteur libre
   choisi, relu sur l'annonce). Republication : le choix RETENU passe devant
   l'annonce (gpj).
5. Marque — liste fermée + tri des suggestions dans l'extension (parité
   testée) ; b) prouvé en réel (« Kodak Ektachrome Super » → question →
   « Kodak » retenu → 2e publication en « Kodak » sans question).
6. Carte « Prêt » sans rayon — la question du rayon est posée.
7. Tests 0.6.96 : LBC republication et Beebs republication faits le 04/10 ;
   refaits en 0.6.97 le 05/10 (LBC republication OK ; Beebs : annonce de test
   retirée par la modération avant le clic, preuve d'absence).
8. Relevés — régression des sessions (403) corrigée ; version notée avant le
   premier relevé ; relevés frais devant les jobs ; poste Opla vivant < 2 h ;
   plus de demandes aux extensions muettes > 48 h.
9. Lenteur Vinted Mac — cadenceur à échéances + attentes par événements +
   mesures `remplissage_mesures` (0.6.97, à vérifier chez Carla/Ciddjy).
10. Palier — source unique serveur + extension.
11. File de nadegemarcelin78 — ce sont des clics MANUELS retenus par le
    plafond (la planification auto ne surcrée pas) ; réécritures inutiles de
    gpj supprimées.
12. Joséphine — 7 republications Beebs relancées pour un poste 0.6.97.
13. Fiches de test de Nico supprimées (3), réglages de test retirés.
14. Étude : `docs/agents/etude-delai-ventes-0510.md`.

## En cours / à surveiller
- Joséphine : retraits Beebs (8) à revoir dès qu'un poste 0.6.96+ tourne chez
  elle ; retraits Opla (8, articles VENDUS encore en ligne) : il faut qu'elle
  se reconnecte à opla.co dans Chrome — aucune action possible de notre côté.
- Carla / Ciddjy : lire `platform_fields.remplissage_mesures` sur leurs jobs
  Vinted une fois la 0.6.97 installée (rattrapees > 0, total_ms < 150 s).
- `remplissage_mesures` n'est pas encore enregistré quand la publication
  RÉUSSIT (seulement sur échec/reprise) : la durée se lit aussi par
  processing_since → published_at.

## À faire (décisions de Nico)
- GO cron remise en vente : `npx supabase db query --linked -f
  supabase/migrations/20261005100100_remises_en_vente_cron.sql` puis
  `migration repair --linked --status applied 20261005100100` (rattrape 10
  fiches Vinted de Louis au premier tour).
- Téléverser la 0.6.97 (après acceptation de la 0.6.96).
- Point 11 : borner aussi la création MANUELLE au plafond du jour (renverse
  la doctrine du 04/09 « 300 sélectionnés = 300 en file ») ?
- Point 14 : feu vert sur la recommandation (veille des commandes, eBay
  ORDER_CONFIRMATION, notification Chrome / push).
- « Petit » n'est plus forcé sur la Mode Vinted (règle du 12/07 remplacée
  par « rien de deviné », 05/10) : à confirmer.

## 05/10 après-midi — reprise (mandat de Nico après /clear)

### Fait
- **Push** main (32 commits) 13:22 → web `2026-10-05T11:22:33Z+4066332`
  (chunk App vérifié : « Recommandé par Vinted », `colis_retenus`).
- **0.6.97 contient tout la 0.6.96** : b32685f (0.6.96) est un ancêtre de
  ddf3ebe ; `beebs.js` identique ; dans `background.js`, seules lignes retirées :
  tri des marques, transporteurs LBC « dès un seul », palier — rien sur photos
  Beebs (93949ba), colis Beebs (7c03a7f), preuve de retrait Beebs (17c319a).
- **Cron 31 remise en vente** (GO) : 10 fiches de Louis publiées sur Vinted,
  Rouge/Gris « déjà en vente », 9 abandons quantité 0 ; 0 doublon.
- **URGENT eBay voie de création** : mig 20261005140000 + 774 imports
  réétiquetés (sauvegarde/inverse) ; Batman vendu sur eBay (rien à retirer) ;
  test SQL avant/après. Retraits à relancer : aucun (12 relus sur eBay ; Nala
  377453677328 = question « Déjà vendu ? » ouverte depuis le 03/10, voulue).
- **Point 11** : la feuille de republication dit la limite du jour
  (`utils/plafondRepublication.js`) ; jamais bloqué.
- **Point 14** : eBay ORDER_CONFIRMATION (fonction `ebay-notifications`,
  66 abonnés, test signé reçu) ; veille des commandes Vinted/LBC dans 0.6.98
  (interrupteur `veille_commandes_ouverte`).
- **Point 9** : mesures du remplissage aussi au succès (0.6.98).
- **Retraits bloqués par une connexion** : textes + jamais soldés (serveur) ;
  « À régler » → « Annonces à retirer » (app) ; 9 textes réparés.
- **Louis 1791017762605** : « objet non reconnu » (ni objet IA, ni mot du
  titre, annonce Beebs sans capture) → la catégorie se lit aussi dans
  `donnees_index` (« Yaourtières » → Électroménager) ; publiable sur
  Leboncoin sans choisir de rayon dès le web poussé et l'OTA.

### En cours / à surveiller
- 0.6.98 copiée sur le poste de Nico (copie de développement) : relire
  `profiles.extension_build` (b7b756c) et `usage_logs` feature
  `veille_commandes` (évènement « amorcage » = la veille tourne).
- Première vraie commande eBay : `ebay_notification_verdicts` kind `commande`
  verdict `valide` + `commandes_ebay` sur le job.
- Carla / Ciddjy : `platform_fields.remplissage_mesures` sur leurs publications
  Vinted réussies une fois la 0.6.98 servie.

### À faire
- Nico : téléverser **0.6.98** (`build/CWS-0.6.98-A-TELEVERSER/fillsell-extension-0.6.98-b7b756c-cws.zip`,
  SHA-256 `17f719fe…a46792`) puis « Envoyer pour examen ». La 0.6.97 n'a jamais
  été téléversée : la 0.6.98 part directement.
- Décision : enregistrer seule une vente Vinted prouvée par la commande (règle
  du 12/07) — non fait, la veille ne fait que faire relire l'annonce.

### 05/10 ~15:00 — push et OTA faits (autorisation explicite de Nico, absent du poste)
- **Push** `4066332..820a135` → web `2026-10-05T13:02:26Z+820a135` ; entrée
  `assets/index-DoOjO_v5.js` 200 avec et sans `Origin`.
- **OTA 2.9.55** envoyée depuis le dossier principal, `dist/` NON reconstruit :
  stamp `2026-10-05T12:55:05Z+4efb8b8`, tous les fichiers écrits entre 14:55:10
  et 14:55:11 (même build), HEAD = 4efb8b8 + un commit de docs seul. Zéro
  régression : 4066332 (2.9.54) est un ancêtre de 4efb8b8, les 19 lignes
  retirées de `src/` depuis sont des remplacements (aucune fonction 2.9.54
  perdue) ; bundle relu : « Recommandé par Vinted », `colis_retenus` (2.9.54),
  « Annonces à retirer », `donnees_index`, « Ta limite du jour » (2.9.55).
  Capgo : checksum compatible (aucune alerte native) ; `channel list` →
  production **2.9.55**.
- **Dossier CWS** : `build/CWS-0.6.98-A-TELEVERSER/` ne contient que le zip
  0.6.98 ; 0.6.96 et 0.6.97 rangées dans `build/CWS-PERIMES/`
  (`CWS-0.6.96-b32685f-JAMAIS-SERVIE-…`, `CWS-0.6.97-ddf3ebe-JAMAIS-TELEVERSEE-…`) ;
  aucun compte n'a jamais tourné en 0.6.96/0.6.97 (`profiles.extension_build` :
  56 en 2a088e4 = 0.6.94, 1 en b7b756c = poste de Nico). La 0.6.98 contient
  la 0.6.96 et la 0.6.97 : b32685f et ddf3ebe ancêtres de b7b756c, mêmes 31
  fichiers, marqueurs Beebs 0.6.96 (lecture de page, formats de colis, index
  public) présents ; 0.6.97 → 0.6.98 : 13 lignes retirées, toutes remplacées
  (texte du retrait en attente, vérification prioritaire, mesures au succès).
- **Veille des commandes et modération** : elle ne lit que la liste des
  COMMANDES (une modération n'en crée aucune) et ne fait que relire l'annonce
  par la lecture habituelle, qui ne dit « vendue » que sur preuve positive
  (Vinted `is_closed` + `item_closing_action=sold` — masquée, réservée ou « en
  vérification » = en ligne ; Leboncoin « Article vendu » sur la page vivante)
  et une annonce LBC en attente de validation n'a pas encore de `listing_url`,
  donc n'est jamais désignée ; au pire une question « Vendue ? », jamais une
  vente enregistrée sans le clic.

## 05/10 soir (17:30 → 18:15) — GRATUIT = 50 REPUBLICATIONS PAR MOIS (décision de Nico, absent)

### La règle (serveur, migration 20261005173000, appliquée 17:43:34 Paris et inscrite)
- **Valeur** : `coin_config.quota_republication_free = 50`, seule clé lue
  (`republication_avie_free` / `republication_avie_depuis` RETIRÉES, ajouts et
  retraits écrits dans `coin_config_journal`). Plus aucun 50 en dur côté serveur.
- **Calendrier = celui de `quota_annonces_free`, pas un deuxième** : début =
  `debut_cycle_quotas(user)` (date du dernier `grant_monthly`/`grant_upgrade`
  — la DATE, jamais un solde) ; remise à zéro = `coin_wallets.next_grant_at`,
  au passage du balayage quotidien (cron 3 `coins-monthly-sweep`, 04:15 UTC) —
  date anniversaire par compte (inscription pour le gratuit). C'est la date que
  Réglages affiche déjà (« remise à zéro le … »).
- **Bascule** : borne = GREATEST(début du cycle, `quotas_republication_free_depuis`
  = 1791215014 = 05/10 17:43:34 Paris), comme `quotas_annonces_depuis` : tous
  les gratuits repartent à 0/50 pour le mois en cours, sans geste.
- **Compteur unique** `quota_republication_free_etat(user)` (fermé aux
  clients) : action `republish`, `published_at` dans le cycle (exécutée —
  annulée ou vendue ENSUITE comprise) ; une republication encore en file
  (pending/processing/needs_user créée dans le cycle) réserve sa place, la rend
  si elle est annulée avant d'être faite ; exclus : `handler_build`
  sync-dressing/releve-annonces, `opla_sortie`. Rend `faites` (exécutées + en
  cours), `executees`, `en_cours`, `restantes`, `remise_le`.
- **Où elle s'applique** (relevé `prosrc` en prod) : `quotas_etat` (compteur de
  l'app), `spend_coins_and_republish` (la porte : refus
  `plafond_republication_free` + `mode`, `faites`, `remise_le`),
  `remise_en_vente_place` (épuisé → reprise à la remise à zéro, plus jamais
  « abandonnée »). `republish_planifiee_etat` ne sert pas le gratuit : non
  touchée. **L'extension n'applique aucun plafond du gratuit** (elle appelle la
  porte et rapporte) : aucune nouvelle version.
- **Paliers payants inchangés** : 1500 / 5000 / illimité ; la migration refuse
  de passer sinon ; `quotas_etat` et `remise_en_vente_place` identiques
  avant/après (essai à blanc puis relu en prod) : Premium 32/1500, Pro 78/5000,
  Business « illimite ». ⚠️ Écart assumé : Premium/Pro comptent toujours toute
  republication CRÉÉE (annulées comprises) — harmoniser = décision de Nico.
- CPU : base 5,6–9,2 % avant, 7,8 % après ; compteur sur les 87 gratuits actifs
  en 166 ms au total (< 2 ms par compte).
- Sauvegarde / inverse : `scripts/reparations/20261005_republication_free_mensuelle_{SAUVEGARDE.json,INVERSE.sql}`.

### Preuve en réel (lecture seule, AUCUNE republication lancée)
- 13 gratuits étaient à 50/50 « à vie » ; tous relus à **50 restantes**.
- **clairetterichier** (be8e2285…) : avant `{"mode":"avie","faites":50,"restantes":0}`,
  remise en vente refusée (`quota_a_vie`) ; après (quotas_etat vu par elle)
  `{"mode":"mensuel","plafond":50,"faites":0,"restantes":50,"remise_le":"2026-10-28"}`,
  remise en vente `place: true`.
- **Olena Soulie** (o.s.soulie, 13d8b5f4…) : même chose, `remise_le` 2026-10-23.
- « Republications en attente bloquées » : AUCUNE en base — le plafond refusait
  à la création (aucun job créé) ; les 12 republications en file de ces comptes
  attendent leur extension (endormie depuis le 17-19/09) ou une réponse, pas le
  quota ; les 3 remises d'Olena sont « plus de stock ». La porte refuse bien au
  plafond (essai à blanc annulé : `plafond_republication_free`, `remise_le` 28/10).

### Textes AVANT → APRÈS (FR / EN ; l'app n'a que ces deux langues)
1. Offres, carte Free (`ConversionModal` lignesDiff) : « 50 republications offertes,
   à vie » / « 50 repostings included, for life » → « 50 republications par mois » /
   « 50 repostings a month » (lu dans `quota_republication_free`).
2. Mur du refus, titre : « Tes republications offertes sont épuisées. » / « Your
   included repostings are used up. » → « Tes republications du mois sont
   faites. » / « This month's repostings are done. »
3. Mur du refus, corps : « Tes 50 republications offertes ont toutes été
   utilisées. Rien n'a été décompté aujourd'hui. » / « Your 50 included repostings
   have all been used. Nothing was deducted today. » → « Tes 50 republications du
   mois sont toutes utilisées — elles reviennent le 28 octobre. Rien n'a été
   décompté. » / « Your 50 repostings for this month are all used — they come
   back on 28 October. Nothing was deducted. »
4. Mur lot/auto, bloc vert : « Tu as encore N republications offertes sur 50 —
   rien à payer. » / « You still have N of 50 included repostings — nothing to
   pay. » → « Tu as encore N republications ce mois-ci sur 50 — rien à payer.
   Remise à zéro le 28 octobre. » / « You still have N of 50 repostings this
   month — nothing to pay. Resets on 28 October. »
5. Réglages, jauge : « N restantes sur 50 offertes » / « N left of 50 included »
   → « N republications restantes ce mois-ci » / « N reposts left this month »
   (sous la « remise à zéro le jj/mm » de la carte).
6. Stock, refus à la carte et en lot : « Tes 50 republications offertes sont
   toutes utilisées. Rien n'a été débité. » / « Your 50 included repostings are
   all used. Nothing was charged. » → « Tes 50 republications du mois sont toutes
   utilisées — elles reviennent le 28 octobre. Rien n'a été débité. » / « Your 50
   repostings for this month are all used — they come back on 28 October.
   Nothing was charged. »
7. Stock, sous « Republier en lot » (gratuit) : « Tu as encore N republications
   offertes : republie tes annonces une par une… » / « You still have N included
   repostings: … » → « Tu as encore N republications ce mois-ci (remise à zéro le
   28 octobre) : republie tes annonces une par une… » / « You still have N
   repostings this month (resets on 28 October): … »
8. Stock, même sous-titre (autres paliers) : « N restantes sur 50 offertes » /
   « N left of 50 included » (branche « à vie ») → « N restantes ce mois-ci » /
   « N left this month » pour tous.
9. Landing, carte Free : « {50} republications offertes, à vie » / « {50}
   repostings included, for life » → « {50} republications par mois » / « {50}
   repostings a month » (lu dans `quota_republication_free`).
10. Landing, FAQ « Comment fonctionnent les forfaits ? » (et son JSON-LD) :
    « (50 offertes à vie en Free, 1500 par mois en Premium, 5000 en Pro…) » /
    « (50 included for life on Free, 1500 a month on Premium…) » → « (50 par mois
    en Free, 1500 en Premium, 5000 en Pro, illimitées en Business) » / « (50 a
    month on Free, 1500 on Premium, 5000 on Pro, unlimited on Business) ».
11. CGU 3.4 FR : « Free : 5 annonces … par cycle, et une dotation unique de 50
    republications (accordée une fois, sans renouvellement mensuel) » → « Free : 5
    annonces … et 50 republications par cycle » ; cycle du Free = « date
    anniversaire mensuelle de l'inscription » ; « Au 2 septembre 2026 » → « Au 5
    octobre 2026 » ; mise à jour du 16 septembre → 5 octobre 2026.
12. CGU 3.4 EN : « a one-time allowance of 50 repostings (granted once, no monthly
    renewal) » → « … and 50 repostings per cycle » ; « on the Free plan, the
    monthly anniversary of sign-up » ; « As of October 5, 2026 » ; « Last updated:
    October 5, 2026 ».
- Aucun texte dans les mails, les messages serveur ni l'extension (relevé
  complet). **`email-tunnel` NON touché** (travail Cloud préservé, rien à
  reprendre à la fusion). À savoir : `email-tunnel/index.ts:453` (blast sync)
  dit « La republication est gratuite et illimitée avec Premium » (Premium =
  1 500/mois) — sans rapport avec le gratuit, laissé tel quel.
- Commentaire périmé laissé : `get-pending-jobs/index.ts:594` (« 50 à VIE »),
  pour ne pas redéployer gpj v217 pour un commentaire.

### Hors code — à faire par Nico (fiches stores)
- **App Store, FR** : « Tu commences gratuitement : un nombre d'annonces par mois,
  et des republications offertes à vie. » → « Tu commences gratuitement : chaque
  mois, un nombre d'annonces et 50 republications. »
- **App Store, EN** : « You start for free, with a monthly allowance of listings
  and a batch of repostings included for life. » → « You start for free, with a
  monthly allowance of listings and 50 repostings a month. »
- **Google Play, FR** (section « LES ABONNEMENTS ») : la même phrase FR, même
  remplacement. **Google Play, EN** (section « PLANS ») : la même phrase EN.
- **Chrome Web Store** : rien (la description ne parle pas du quota).

### Mise en ligne
- Commits 9e83314 (serveur), 9150bae (textes), be01c9f (selftest), e74936b
  (2.9.57) ; **UN push** `d9e25a3..e74936b` ; web `2026-10-05T15:57:42Z+e74936b`,
  entrée `assets/index-DkaCSwhu.js` 200 avec et sans `Origin` ; chunks servis
  relus : nouveaux textes présents, « à vie »/« for life »/`republication_avie` absents.
- **OTA 2.9.57** (Capgo production, relu ; checksum compatible, aucune alerte
  native), build `2026-10-05T15:56:32Z+e74936b` du dossier principal. Zéro
  régression : 7452e23 (2.9.56) et 4efb8b8 (2.9.55) ancêtres de e74936b ; entre
  2.9.56 et 2.9.57, `src/` ne change QUE par 9 fichiers (70 lignes retirées,
  toutes des textes/clés remplacés) ; bundle relu : « Recommandé par Vinted »,
  `colis_retenus`, « Annonces à retirer », `donnees_index`, « Ta limite du
  jour », `cloudOffer` présents.
- **Fonctions edge** : aucune touchée, aucun déploiement. Selftests 188/188 verts.
- Refus du classifieur : aucun.
