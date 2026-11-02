# 02/11 — trois points clients (A) et facture Supabase (B)

Heure de Paris partout. Prod au départ : get-pending-jobs v322, handler-watch v156, update-job-status v164,
ebay-api-worker v105 ; extension 0.6.166 en examen au Chrome Web Store (pas remplacée).

## Partie A — trois petits points (comptes gratuits)

### 1. laurankoole — relevé Depop en HTTP 400 depuis le 29/10
- **Cause (mesurée)** : journal du serveur du 02/11 09:35:21 — `POST annonces_plateforme?on_conflict=…` → 400,
  `proxy_status: PostgREST; error=PGRST102` (« Empty or invalid json »), corps de 2 006 octets (3 annonces), aucune
  erreur Postgres : le corps est refusé AVANT la base. Les clés du lot sont identiques par construction ; le seul
  texte libre est le titre Depop = première ligne de la description coupée par `.slice(0, 120)` (unités UTF-16) :
  un émoji tranché laisse un surrogate seul, écrit `\udXXX` par JSON.stringify. Preuve du mécanisme (POST anonyme,
  rien d'écrit) : `[{"titre":"abc\ud83d"}]` → 400 PGRST102 ; `abc😀` et `abc` → 401 (RLS). Seul compte touché : seule
  boutique Depop dont une description a un émoji à cette place (3 échecs : 30/10 11:31, 02/11 09:08, 09:35).
- **Correctif (règle)** : `restRequest` (background.js) remplace tout demi-caractère d'un corps par U+FFFD
  (`jsonSansDemiCaractere`, toutes les écritures REST de l'extension, toutes plateformes) ; `depopPremiereLigne` coupe
  par point de code. Selftest `selftest:releve-demi-caractere` (15 vérifications) ; `selftest:lecture-page-publique`
  adapté (le bac à sable de restRequest embarque l'assistant).
- **Reste** : livré par l'extension 0.6.167, empaquetée APRÈS l'examen de la 0.6.166 (consigne de Nico). Son relevé
  repasse seul au premier relevé du poste mis à jour ; rien à réparer en base.

### 2. stephanie.heline — « ta connexion Vinted est bonne » à quelqu'un de déconnecté
- **Cause (mesurée)** : les 17 republications (pending, créées le 02/11 dès 10:15) portent
  `capture_echec = {http: 403, cause403: "session_absente", motif: "… aucune session Vinted dans ce navigateur"}` :
  l'extension avait PROUVÉ l'absence de session et envoyé needs_user « Connexion Vinted requise : connecte-toi… ».
  update-job-status (bloc « session bonne » du 23/09) l'a requalifié en pending « Ta connexion Vinted est bonne » sur
  `profiles.extension_sessions.vinted === true` — valeur GARDÉE par la sonde muette (règle B de l'extension) :
  `checked_at_par_plateforme.vinted` = 10:09:37, `http.vinted` = 403, `sonde_muette.vinted` 11:47, `vinted_identite`
  null. Le reste du serveur exigeait déjà une preuve fraîche (`_shared/session-prouvee.js`, 01/11) ; ce bloc non.
- **Correctif (règle)** : update-job-status **v165** (12:15:57, verify_jwt false avant/après) — la capture
  `session_absente` garde son needs_user et le message de l'extension ; sinon « connexion bonne » exige
  `sondeProuveSession` (mesure de CE poste, < 30 min). Selftest `selftest:session-bonne-capture` (10 vérifications,
  dont les données réelles du compte).
- **Preuve / reste** : jobs non touchés (consigne). Au prochain essai de capture de chacun, needs_user « connecte-toi
  sur vinted.fr dans Chrome, sur ton ordinateur » ; la reprise automatique les relance dès que la sonde la voit connectée.

### 3. dsjhdhayoub — 4 publications en attente depuis le 30/10 13:17, sans message
- **Cause (mesurée)** : les 4 tâches (lot 744f420a : 2 Leboncoin, 2 Beebs) ont été servies le 30/10 à 13:17:47
  (« 4 job(s) distribué(s) ») ; le dépôt Leboncoin 8edb11a1 est passé processing à 13:17:48 (fenêtre réduite), puis
  plus AUCUN appel du poste : pas de poll, pas de battement, sonde arrêtée à 13:17:56. handler-watch a remis 8edb11a1
  en file à 14:03 (« l'ordinateur … ne s'est plus manifesté »). Le 01/11 : appels de l'onglet de l'app à 12:00 et 21:00
  et un seul battement à 22:00:33 — même IP, même Mac — qui déclare encore 8edb11a1 « en cours depuis le 30/10 » : le
  Mac dort (réveils de veille de quelques secondes) avec le dépôt suspendu en mémoire. Rien ne retient ces tâches côté
  serveur : **c'est voulu**, rien ne part sans ordinateur allumé.
- **Défaut** : la tâche ne le disait pas toujours. Dans la file de l'app, les 3 tâches sans message disaient bien
  « En pause : ton ordinateur est éteint ou Chrome fermé » ; la 4e (8edb11a1, qui porte le message de reprise) disait
  « En pause : nouvel essai automatique, rien à faire » — faux.
- **Correctif (règle)** : `_shared/etat-job.js` — extension constatée éteinte/inactive + job hors voie api → motif
  `ordinateur`, avant `essai` (copie de l'extension régénérée). Selftest `selftest:etat-job` (+4 cas). Servi par le
  web au push, par l'OTA suivante sur mobile, par l'extension 0.6.167.

### Contrôles du lot A
- Suite complète des selftests : 1 rouge (`lecture-page-publique`, bac à sable sans le nouvel assistant) corrigé,
  relancé vert ; selftests du sujet verts ; `deno check` update-job-status vert ; lint : aucun problème nouveau
  (compteurs identiques à HEAD sur background.js et depop.js).
- Aucun job, aucune annonce, aucun mail, aucune migration touchés.

## Partie B — facture Supabase (cycle 02/10 → 01/11 : 39,39 $ grâce à une remise de 100 % ponctuelle)

### Étape 1 — mesure (journaux de la passerelle du 01/11 12:00 au 02/11 12:00, 24 h ; tailles mesurées en base)
| Poste | D'où il vient (mesuré) |
|---|---|
| **Transformations** (59 261, 100 incluses → 300 $) | 2 647 requêtes `render/image` en 24 h, **toutes** de Deno, toutes en 400 px : `fusion_photo_tick` (cron chaque minute) → `empreintes-urls` → `_shared/empreinte-telechargement.ts` réduisait chaque photo de notre bucket avant d'en calculer l'empreinte (~2 650 photos neuves par jour ≈ 79 000/mois). Aucun écran de l'app ne demande de transformation. Autres constructeurs (inactifs sur 24 h) : `photo-empreinte` (800 px, second essai), `rapprochement-ia` (256 px + copie dans `ia-miniatures/` à chaque passage), `lens-analysis` (photo > 6 000 px seulement). |
| **Egress** (303,8 Go/30 j ≈ 10 Go/j) | Photos `listing-photos` : 2,6 Go/j (mesuré, content-length) — vers les pages des plateformes 1,38 Go/j (doit rester en qualité d'origine), app web 0,33, app mobile 0,43 (dont 0,34 en cache CDN), divers 0,4. Réponses REST : pas de taille au journal (réponses fragmentées) → **estimées** lignes × taille moyenne mesurée : app `cross_post_jobs` historique complet avec `platform_fields` (1 600 o/ligne, ~2,6 M lignes/j) **≈ 4,2 Go/j** ; app `inventaire?select=*` (1 960 o/ligne, ~1,5 M lignes/j) **≈ 2,9 Go/j** ; fonctions (Deno) `cross_post_jobs` ~4,8 M lignes/j ≈ 2,4 Go/j ; app `ventes?select=*` (640 o, ~1,9 M lignes/j) ≈ 1,2 Go/j ; app `annonces_plateforme` (colonnes déjà réduites) ≈ 0,6 Go/j. |
| **Pourquoi l'app relit tout** | La sonde des jobs de l'App (toutes les 45 s, app visible) relance un `fetchAll` complet (ventes + stock en `select=*`, pages de 1 000) dès que son empreinte change — or l'empreinte contenait `last_checked_at`, réécrit par le check des ventes sur ~3 600 jobs/h (34 comptes) : ~4 800 relectures complètes/j (3 198 en 16 h mesurées). Le Stock relisait en plus TOUT l'historique des jobs (avec `platform_fields`) toutes les 5 min : ~2 100 fois/j. Retour d'onglet : `fetchAll` toutes les 30 s au plus. |
| **Lectures en boucle** | `get-pending-jobs` : ~34 000 polls/j (chaque poste, toutes les 2 min, fixé dans l'extension), ~45 requêtes REST par poll ; sur 2 h (2 200 polls) : `coin_config` 7/poll (171 000/j), `profiles` 9/poll dont palier ×2, `beta_flags` ×2 (245 000/j), `cross_post_jobs` 17/poll dont ~10 balayages needs_user/failed qui rendent 0 ligne (588 000/j), `vinted_sync_runs` 4/poll dont 3 lectures des demandes en file (129 000/j). L'extension : `rpc/lecture_origine_signal` toutes les 30 s (99 000/j), `lectures_origine_en_attente` 49 000/j. |
| **Journaux** | edge_logs ≈ 2,85 M lignes/j (une par requête HTTP : 92 % du volume), function_logs ≈ 134 000/j (dont 2 lignes par poll vide de get-pending-jobs : « → 0 job(s) distribué(s) », « keepalive_actif=0 »), postgres_logs ≈ 24 000/j (crons). Réduire les journaux = réduire les requêtes. |
| **Invocations** (1,38 M, 2 M incluses) | get-pending-jobs ≈ 34 000/j, update-job-status 5 000, empreintes-urls 5 000 : sous le quota, rien à faire. |

### Étape 2 — corrigé (du plus gros gain au plus petit)
1. **Transformations → zéro** (déployé 12:31 : **empreintes-urls v8 → v9**, **doublons-balayage v4 → v5**, faux ;
   **photo-empreinte v4 → v5**, vrai ; **rapprochement-ia v11 → v12**, faux — versions relues avant/après).
   L'empreinte se calcule sur l'ORIGINALE (`empreinterUrl` : `[urlAllegee(url), url]`, `urlTransformee` retirée) ;
   photo-empreinte : second essai = l'originale décodée par le module partagé (WebP compris) ; rapprochement-ia :
   l'originale (URL de notre bucket, base64 ≤ 1,5 Mo hors bucket), plus de copie `ia-miniatures/`. Essai réel (une
   fois, local, photos de prod) : JPEG 1 200×1 600, PNG 700×807, WebP 2 000×2 000 → **dHash Δ0, pHash Δ0** avec les
   empreintes stockées (calculées sur 400 px) ; 0,3 à 1 s par photo en local. Prod : 12:33, 8 appels, 5/5 photos
   calculées, 488 ms de décodage, aucune erreur CPU, **0 requête render/image depuis 12:31** (304 du 02/11 00:00 à
   12:30, 303 images distinctes).
2. **Egress de l'app** (web au push, mobile à l'OTA) : la sonde des jobs sans `last_checked_at` ; un vrai changement
   relance aussi la vue complète du Stock (`fillsell:jobs-changes`) ; vue complète du Stock 5 → 30 min (2 → 10 min au
   retour d'onglet) ; `fetchAll` au retour d'onglet 30 s → 2 min.
3. **Lectures en boucle** (get-pending-jobs, voir § versions) : `coin_config` par `_shared/coin-config-cache.js` (table
   entière, 60 s par instance) ; présence needs_user/failed avant 10 balayages ; demandes en file lues en une fois ;
   palier et beta_flags une fois par poll.
4. **Journaux** : plus de ligne pour un poll vide (« → 0 job(s) distribué(s) », « keepalive_actif=0 ») ; le reste suit
   la baisse des requêtes (une ligne edge par requête).
5. **Photos** : miniature 400 px fabriquée à l'enregistrement par l'app (`<lot>_<i>__mini.jpg`), affichée par
   `GalleryPhoto` (repli sur l'originale) pour les photos téléversées depuis le 02/11 16:00 ; cache d'un an sur les
   photos téléversées (chemin neuf à chaque photo). Les plateformes reçoivent l'originale, aucune photo supprimée,
   aucun chemin changé ; la miniature part avec sa photo au ménage d'un article supprimé.

### Versions (relues avant / après)
- 12:31 : empreintes-urls v8 → **v9**, doublons-balayage v4 → **v5**, rapprochement-ia v11 → **v12** (faux) ; photo-empreinte
  v4 → **v5** (vrai) — déployées du worktree basé sur fe36466 (aucun autre changement), code identique au commit.
- 13:03:51 : **get-pending-jobs v322 → v323** (vrai) — v322 était celle de ae3c8e6 (09:51), dernier commit qui la touche ;
  blocs Cloud inchangés (47 lignes « cloud » avant et après, aucune dans le diff) ; seul module partagé changé depuis :
  etat-job.js (lot A).
- Web au push ; mobile : OTA 2.9.153 (après la 2.9.152 du terminal Cloud).

### Contrôles
- Suite complète : 4 rouges, tous des selftests qui lisaient la FORME du code changé (files-repartent,
  delegation-leboncoin, delegation-leboncoin-releves : demandes en file lues en une fois ; lecture-fond : bloc lu sur
  6 000 caractères, mémo du palier déplacé avant son en-tête) → adaptés ou corrigés, verts ; les 109 selftests qui
  lisent get-pending-jobs relancés : 0 rouge ; `selftest:facture-supabase-0211` vert ; `build:essai` vert ; lint :
  compteurs identiques à HEAD ; `deno check` get-pending-jobs : la seule erreur de type est celle déjà présente en prod.

### Avant → après (mesuré = M, estimé = E)
| Poste | Avant | Après |
|---|---|---|
| Transformations | 2 647/j (M) ≈ 79 000/mois | **0 depuis 12:31 (M)** ; ce cycle : 303 images avant le correctif ≈ 1 $ |
| Egress | ~10 Go/j (facture) | **~5,5 Go/j (E)** ≈ 165 Go/mois, sous 250 Go avec ~35 % de marge — à remesurer le 03/11 |
| coin_config (lectures/j) | 171 000 fonctions + 14 700 app (M) | ~16 000 (E, −90 %) |
| cross_post_jobs | 708 000 (facture) ; fonctions 588 000 (M) | ~460 000 (E, −35 %) |
| profiles | 272 000 ; fonctions 245 000 (M) | ~170 000 (E, −35 %) |
| vinted_sync_runs | 163 000 ; fonctions 129 000 (M) | ~95 000 (E, −40 %) |
| Journaux (lignes edge/j) | ~2,3 à 2,85 M (M) | ~1,8 à 2,2 M (E, −20 %) ; function_logs −30 % (E) |

### Reste (non fait, et pourquoi)
- **Moitié des lectures de cross_post_jobs / profiles et des journaux non atteinte** : le levier restant est le poll
  de l'extension (toutes les 2 min, ~34 000/j) — l'espacer ralentirait les publications lancées du téléphone (refusé
  par la consigne). Pistes à décider par Nico : un signal « rien n'a changé pour ce compte » posé par la base (migration :
  feu vert requis) qui rendrait un poll vide en une lecture ; dans la 0.6.167, `lecture_origine_signal` toutes les 60 s
  au lieu de 30 (99 000 requêtes/j).
- Miniatures des photos ANCIENNES : non fabriquées (relire 68 Go d'originales coûterait plus d'egress que les
  miniatures n'en épargnent ; l'affichage des photos dans l'app ne pèse que ~0,3 Go/j non caché).
- coin_config côté app (16 lectures, ~14 700/j) et côté handler-watch / update-job-status : non branchés au cache (gain
  < 1 % des requêtes).

## Partie C (02/11 après-midi) — « zéro régression, sans exception » : chaque point du lot B
Consigne de Nico : tout point non prouvable revient à l'ancien comportement.
| Point | Verdict |
|---|---|
| Empreintes sur l'originale (empreintes-urls, doublons-balayage, photo-empreinte) | **Remis comme avant** : sur 60 photos de prod, l'empreinte sur l'originale différait de celle sur la version réduite (dHash Δ ≤ 3, pHash Δ ≤ 4, variantes Δ ≤ 8, couleur parfois) — les rapprochements par photo ne sont pas prouvés identiques (l'essai du matin sur 3 photos n'était pas représentatif). Code d'avant le lot B redéployé 14:54 (v10 / v6 / v6). |
| rapprochement-ia sans transformation | **Remis comme avant** (l'IA ne voyait plus la même image) — v13 = code d'avant. |
| Miniatures (vignettes) et cache d'un an | **Remis comme avant** (GalleryPhoto.jsx et photosUpload.js identiques à l'avant-lot-B). Zoom : `components/GaleriePhotos.jsx` l. 119 affiche `<img src={url}>` = l'URL d'origine, jamais `GalleryPhoto` ni une miniature. |
| Sonde des jobs sans last_checked_at | **Remis comme avant** (même requête, fetchAll sur toute différence) ; EN PLUS, un changement réel (hors last_checked_at) relance tout de suite la vue complète du Stock (demandé). |
| Retour d'onglet 30 s → 2 min | **Remis comme avant** (30 s). |
| Vue complète du Stock 5 → 30 min | **Remis comme avant** (5 min, 2 au retour d'onglet) + relance immédiate sur changement réel. |
| Cache coin_config 60 s | **Remis comme avant** (14 lectures directes) : un réglage changé n'était vu qu'en 60 s au plus. |
| Présence needs_user / failed avant 10 balayages | **Identique, preuve** : chaque bloc gardé ne lit d'abord que des jobs needs_user / failed du compte (selftest) ; les seules écritures needs_user / failed du poll sont DANS ces blocs (l. 1521, 1528), donc un bloc sauté ne peut rien avoir créé pour le suivant ; même client, même filtre ; lecture illisible → balayage comme avant. Mesuré : blocs sautés 3 fois sur 4. |
| Demandes en file en une lecture | **Identique, preuve** : mêmes filtres appliqués en mémoire (sorte, durée de vie, plateforme déléguée, ordre, nombre), même client (RLS) ; le seul producteur entre deux lecteurs (`reprendre_releves_absents`) force une relecture quand il remet une demande en file (défaut trouvé et corrigé, v324) ; selftests files-repartent / delegation verts. |
| Palier lu une fois par poll | **Identique, preuve** : même requête dans le même poll ; le poll n'écrit jamais ces colonnes. |
| beta_flags repris de la délégation | **Identique, preuve** : même colonne lue dans le même poll ; jamais écrite par le poll. |
| Profil de première synchro seulement pour un compte récent | **Identique, preuve** : profil créé à l'inscription ; 0 compte sur 3 511 avec plus d'un jour d'écart entre auth et profil (écart max 22 h) ; marge d'un jour. |
| Ligne de journal d'un poll vide | **Identique** pour l'utilisateur : journal serveur seulement. |
- Déployé : get-pending-jobs **v324** (14:58) ; web au push ; mobile : OTA 2.9.154.
- ⛔ Conséquence : les transformations reprennent (~2 650 images par jour, ~300 $ par cycle au tarif mesuré). À
  décider par Nico : accepter des empreintes à 1-4 bits près (zéro transformation), ou garder l'identique (payant).
