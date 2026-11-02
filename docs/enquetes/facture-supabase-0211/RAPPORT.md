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

## Partie C2 (02/11 soir) — le signal « rien n'a changé pour ce compte » (feu vert de Nico)
- Migration **20261102160000_signal_compte** appliquée (15:1x) + `migration repair` ; essais à blanc en prod avant
  (ROLLBACK) : compteurs = jobs réels (0 écart sur 554 comptes), changement de statut → compteur déplacé, écriture sans
  statut → rien, beta_flags inchangé → version inchangée, coin_config → version +1. Après application et écritures
  réelles : 0 compteur inconnu, 0 écart, 0 clé fantôme. Inverse : `supabase/rollbacks/20261102160000_signal_compte_INVERSE.sql`.
- **get-pending-jobs v324 → v325** (15:24:45, vrai) : signal lu en tête de poll ; coin_config relu seulement quand
  sa version change (`_shared/coin-config-cache.js`, version inconnue → requête d'origine, LIKE à l'identique) ;
  présence needs_user / failed par les compteurs ; anti-robot Vinted / Beebs et retenues hors ligne sautées sans job
  en attente ; beta_flags et palier du compte gardés tant que leur version ne change pas. La requête principale des
  jobs en attente n'est jamais sautée : une publication lancée du téléphone part au poll suivant, comme avant.
- **Identique, preuve** : une lecture n'est sautée que si le signal prouve qu'elle rendrait la même chose (compteur
  à 0 pour les statuts qu'elle filtre ; version inchangée) ; compteurs tenus dans la transaction de chaque écriture ;
  signal illisible ou compteurs inconnus → tout se lit comme avant ; les marqueurs anti-robot / retenue ne sont jamais
  posés sur un job neuf (un job créé pendant le poll ne peut pas être manqué) ; selftest `facture-supabase-0211`.
- **Mesuré** (repère : une lecture des demandes en file par poll) — lectures des fonctions par poll :
  | | matin (avant tout) | v324 | v325 |
  |---|---|---|---|
  | cross_post_jobs | 22,8 | 19,3 | **16,0** (−30 % vs matin) |
  | profiles | 10,8 | 7,9 | **7,6** (−30 %) |
  | vinted_sync_runs | 5,1 | 3,2 | **3,1** (−39 %) |
  | coin_config | 6,7 | 6,7 | **0,42** (−94 %) |
  | toutes requêtes (= lignes de journal) | 67,8 | 56,4 | **47,1** (−31 %) |
  (v325 : 253 polls sur 11 min juste après le déploiement, cache du profil encore froid.)
- **Pas atteint : la moitié** pour cross_post_jobs, profiles et les journaux. Prochain levier prouvable : platform_settings
  (2,35 lectures par poll) gardé par une version tenue par la base, invalidée par le poll quand il l'écrit lui-même
  (platform_settings_fusionner) ; ensuite, les lectures de cross_post_jobs restantes une à une (chacune doit se prouver).

## Partie D (02/11 soir, terminal problèmes) — transformations : inventaire, essai à blanc sur TOUT le stock, coûts
Consigne de Nico : rien de basculé en prod ; essai à blanc des deux méthodes côte à côte, empreintes stockées
recalculées avec la nouvelle (jamais d'ancienne comparée à une nouvelle), décisions de fusion et de doublons rejouées.
Détail complet et scripts : `essai-empreintes/RESULTAT.md`, `essai-empreintes/scripts/` (données : 1,1 Go, gardées hors dépôt).

### D1. Inventaire (journaux de la passerelle, 01/11 16:20 → 02/11 16:20)
| Appelant | Requêtes render/image | Images distinctes | Touche empreintes / fusion ? |
|---|---|---|---|
| `_shared/empreinte-telechargement.ts` (empreintes-urls, doublons-balayage), 400 px q80 | 3 172 | 3 028 | OUI : c'est l'empreinte |
| photo-empreinte (800 px, second essai) | 0 | 0 | oui (empreinte) |
| rapprochement-ia (256 px + copie ia-miniatures) | 0 | 0 | oui (verdict IA de fusion) |
| lens-analysis (photo > 6 000 px seulement) | 0 | 0 | non (attributs) |
| App web / mobile, extension (affichage) | 0 | 0 | non |
- **Affichage : rien à basculer.** Aucun écran (src/), ni l'extension, ne demande de transformation (code relu : aucune
  `render/image`, aucun `transform:` de stockage) ; 0 requête en 24 h. Rien ne change donc à l'écran.
- **100 % des transformations sont des empreintes.** Les photos empreintées sont toutes à la position ≤ 6 de leur fiche
  (mesuré sur 7 jours : 9 662 / 9 662 retrouvées), celles que le moteur lit (maxPhotos 6) : aucune ne peut être sautée à
  l'identique.

### D2. Essai à blanc (16:20 → 17:20, rien écrit en prod, 0 render/image)
- 65 880 photos du bucket ; 63 827 lues (2 052 fichiers supprimés du stockage, retirés des deux jeux ; 1 refusée par la
  nouvelle méthode : 2 500 × 2 500 > 6 Mpx). 18,16 Go téléchargés. Le calcul local est celui de la prod à l'octet : les
  1 313 lignes que la prod avait déjà calculées sur l'originale ressortent à Δ0.
- Écarts : dHash 0 bit 42 692, 1 : 15 824, 2 : 3 864, 3 : 871, 4 : 212, ≥5 : 364 ; pHash 0 : 46 551, 2 : 16 289,
  4 : 891, ≥5 : 96. **50 photos à 20-40 bits, dont 47 avec une orientation EXIF 6 ou 8** (render/image tournait l'image,
  imagescript ne la tourne pas).
- **Décisions : PAS identiques.**
  - Moteur v3, passe comme le cron : 835 / 838 comptes identiques à l'octet ; 2 comptes à la distance notée près ;
    1 compte (39bfa95a) : 2 annonces « à vérifier » avec un autre candidat.
  - Moteur v3, tout le stock rejugé : 37 comptes, 175 sujets différents — dont 2 fusions automatiques → questions,
    1 question → fusion, 1 fusion perdue et 1 nouvelle, 88 « à vérifier » avec un autre candidat, « Annonce en double ? »
    25 perdues / 11 nouvelles. Paires de photos : 11 394 perdues, 11 660 nouvelles sur 1,53 M, marge minimale au seuil 0.
  - Doublons : 5 470 verdicts photo changés sur 38,7 M paires ; au niveau final, 65 changent : 41 questions perdues,
    24 nouvelles, dans 18 comptes.
  - fiches_meme_photo_questions : 5 perdues / 19 nouvelles ; fusion_photo_tick : 0 rattachement changé sur 1 033 ;
    lecteurs JS (get-pending-jobs, handler-watch, beebs-lien, rapprochement-ia) : 109 paires sur 30 026 changent de
    niveau (62 perdues, 47 nouvelles, 30 comptes).
  - Exemples : 39bfa95a « Doudou Minnie » (copie EXIF 6 contre la photo Vinted : 0 → 21 bits, fusion → question) ;
    8ac5bbda « Jean Lee W40 » (0 → 25 bits, fusion → question) ; 771ac4d9 « Robe été blanche XS » (6,4 → 8 et 9 → 10,
    seuil « multi » ≤ 9 : la fusion disparaît) ; 18e461c1 « Doudoune bébé 9 mois » (d 9 → 11, seuil proche ≤ 10 : la
    question de doublon disparaît).
  - Non couvert (dit honnêtement) : instantané de 16:27 ; lecture du moteur par un miroir SQL de rapprochement_v3_lire ;
    doublons sans la limite de 60 candidates ni les refus passés ; Beebs et « trancher » comptés en sur-ensemble.

### D3. Coût par cycle (tarif : 5 $ / 1 000 images d'origine au-delà de 100 ; egress 0,09 $ / Go au-delà de 250 Go)
| Option | Transformations / cycle | Egress en plus | Décisions |
|---|---|---|---|
| Garder l'identique (aujourd'hui) | 59 261 au dernier cycle → **≈ 296 $** ; au rythme du 01-02/11 (3 028 / jour) **≈ 450 $** | 0 | identiques |
| Empreinte sur l'originale (40e4bd3) | **0 $** | ≈ +23 Go / cycle (originale 280 Ko au lieu de 25 Ko) → 0 à ≈ 2 $ ; + une fois 18 Go pour recalculer tout le stock (0 à ≈ 1,6 $) | **différentes** (D2) |
| Originale + orientation EXIF appliquée (non essayée) | 0 $ | idem | les 50 grands écarts disparaîtraient ; les 1-4 bits restent → différentes aussi, ampleur à mesurer par un second essai (≈ 18 Go, ~1 h) |
- Aucune méthode sans transformation ne reproduit l'identique : les écarts de 1-4 bits viennent de la réduction +
  recompression JPEG du service, que rien ne refait à l'octet. **Rien n'est basculé : décision de Nico.**

## Partie E (02/11 soir, terminal problèmes) — point 1 : « une empreinte calculée une seule fois »
Consigne de Nico : sans changer la méthode, chaque empreinte calculée UNE fois et gardée ; d'abord compter combien des
≈ 3 000 transformations par jour sont des recalculs ; décisions identiques au bit près. Mesures 18:54 → 19:15, lecture
seule ; scripts dans `recalculs-0211/`.

### E1. Recalculs : aucun
- **Le code le garantit déjà** (depuis le 08/10) : une URL qui a son empreinte complète n'est plus jamais téléchargée —
  `empreintes-urls` saute toute ligne avec variantes, `fusion_photo_tick` ne demande que les URL absentes de
  `photo_empreintes`, le moteur (`rapprochement`) que les URL sans empreinte complète (`compacteComplete`).
- **Instantané du 02/11 16:27** (531 465 lignes, essai à blanc) contre la base à 18:54 : 849 empreintes calculées depuis,
  **0** pour une URL qui en avait déjà une (dont 381 photos du bucket, toutes neuves).
- **Journaux de la passerelle, 24 h** (01/11 18:55 → 02/11 18:55) : 2 193 images transformées ; 146 l'ont été deux fois
  à moins d'une heure d'écart (photo remise faute de temps de calcul, ou refus passager, puis reprise : même cycle =
  facturée une fois) ; **0 image retransformée après plus d'une heure**.
- Restent possibles, jamais vus depuis 16:27 : les 4 442 photos du bucket sans « variantes » (calculées avant le 08/10 ou
  par `photo-empreinte`) seraient recalculées si le moteur les redemandait (≤ 22 $ si toutes l'étaient).

### E2. Ce que paient les transformations : des photos NEUVES
- 2 607 empreintes du bucket en 24 h (base) : `rapatrie-fiche` 1 747 (photos des fiches importées de Leboncoin, Beebs,
  eBay, Depop, copiées chez nous par handler-watch), `rehosted` 664 (photos re-hébergées pour publier), `raw` 181,
  `enhanced` 15. Chaque jour depuis le 15/10, les photos empreintées sont des fichiers créés le JOUR MÊME (98 %).
- Par jour (base, depuis le 15/10) : 437 à 3 653, **≈ 1 560 en moyenne, ≈ 1 960 sur les 7 derniers jours**.
- Le dernier cycle (59 261) portait un recalcul ponctuel : le **08/10, 22 145 empreintes, dont 14 732 photos de plus de
  7 jours** (ajout des « variantes » du moteur v3) ≈ 74 $. Pas récurrent.
- Seul « double » restant : la MÊME photo (octets identiques, même eTag) déposée sous deux noms — **73 / 2 607 en 24 h
  (2,8 %), 1 939 / 30 063 depuis le 15/10 (6,4 %)**, surtout une photo rapatriée deux fois (59 sur 73). La réutiliser
  sans transformation économiserait ≈ 8 à 25 $ par cycle, mais demande de lire `storage.objects` (fonction SQL =
  migration) : **pas fait sans feu vert**, et sans objet si le point 2 est adopté.
- Constaté au passage : aujourd'hui déjà, deux copies identiques d'une photo n'ont pas toujours la même empreinte —
  193 paires sur 3 127 diffèrent, 163 parce que l'une a été calculée sur l'originale après un refus de la transformation.

### E3. Résultat
- **Rien déployé** : la règle « une fois, gardée » est déjà en place et tenue ; aucun changement ne retire de
  transformation à décisions identiques au bit près, hors les copies identiques (E2, migration).
- **Coût restant après le point 1 = le coût d'aujourd'hui** : ≈ 1 600 à 2 600 photos neuves par jour → 47 000 à
  78 000 par cycle → **≈ 235 à 390 $ par cycle** (≈ 295 $ au rythme des 7 derniers jours). Il croît avec les photos
  importées et rapatriées, donc avec les utilisateurs. Seul le point 2 (méthode sans transformation) le ramène à 0 $.

## Partie F (02/11 soir, terminal problèmes) — point 2 : méthode sans transformation, redressée — verdict
Chiffres : `essai-empreintes-C/RESULTAT.md`. Rien basculé, 0 render/image ; données de travail supprimées.
- **Méthode C** : l'originale redressée selon l'EXIF puis réduite dans 400 × 400 (moyenne des surfaces), puis le calcul
  d'aujourd'hui. Sur tout le bucket (63 828 photos) : dHash identique à 80,5 % (essai B : 66,9 %), **aucun écart
  ≥ 20 bits** (B : 50) ; les 50 grands écarts de B : 48 à ≤ 4 bits.
- **Seuils** : les seuils actuels sont déjà les meilleurs pour chaque règle (250 millions de paires) ; tout décalage
  augmente les désaccords — les écarts restants sont du bruit symétrique de 1-2 bits.
- **Décisions** : moteur, passe du cron : **0 différence**. 200 décisions changent ailleurs (stock rejugé 60, doublons 58,
  JS 54, fiches même photo 27, tick 1), jugées une à une : **82 meilleures, 74 pires, 37 équivalentes, 7 indécidables**.
  Aucune fusion ni aucun rattachement automatique faux avec C (A : 1) ; les pires sont des questions perdues ou fausses,
  et 21 « même » ramenés à « proche ».
- **Verdict : pas de bascule proposée (règle « zéro pire »).** Zéro pire demanderait de reproduire la transformation à
  l'octet (libvips en WebAssembly, réglages d'imgproxy) : essai D possible, non fait. Décision de Nico.
- Coût : aujourd'hui ≈ 235 à 390 $ / cycle ; C : 0 $ (+ ≈ 12 à 20 Go d'egress, 0 à ≈ 1,8 $).
- Mémoire du PC : deux fois, Claude Code a arrêté les calculs (mémoire basse pendant l'attente) ; repris à charge réduite
  sur ordre de Nico (6, puis 1 processus), rien perdu.

## Partie G (02/11 soir, 21:30 → 22:15) — essai D : la transformation Supabase refaite à l'octet — verdict
Chiffres : `essai-empreintes-D/RESULTAT.md` ; scripts : `essai-empreintes-D/scripts/`. Rien basculé ni déployé, lecture
seule ; photos de travail hors dépôt ; un seul processus sur le PC (4,4 Go libres en fin).
- **Identique : OUI.** libvips en WebAssembly (wasm-vips 0.0.19 = libvips 8.18.7 + mozjpeg), pipeline d'imgproxy refait
  (fit 400×400, réduction au décodage JPEG, lanczos3, profil ICC → sRGB après la réduction, JPEG q80 progressif), figé
  après mise au point sur 86 autres photos. Test sur 200 photos tirées au hasard parmi les 1 356 transformées le 02/11
  (relecture de leur version Supabase gratuite : déjà comptées ce cycle, 286/286 vues dans les journaux) :
  **200/200 empreintes identiques au bit près** (dHash, pHash, couleur, variantes), **199/199 JPEG identiques à l'octet**
  au fichier de Supabase, le PNG identique en pixels et en données compressées (seuls deux blocs d'en-tête diffèrent).
- Non couvert (aucun cas parmi les photos du cycle) : orientation EXIF ≠ 1, WebP, gris, CMJN, transparence, réduction
  ×8, profils non sRGB → resteraient à la transformation Supabase (≈ 0 $) tant que non prouvés.
- **Limites des fonctions : NON tenues par wasm-vips tel qu'il est publié.** Temps : oui (plus grosses photos du bucket :
  176 ms au pire, démarrage 445 ms, pour 2 s de CPU). Mémoire et threads : non — 256 Mo de mémoire WebAssembly réservés
  dès le démarrage (= toute la limite d'une fonction) et ≥ 6 Web Workers, absents des fonctions Supabase (doc :
  « libvips, sharp non supportés »). Le calcul lui-même ne demande que 50 Mo : une version mono-thread allégée tiendrait
  probablement, à construire puis à reprouver sur les mêmes références et à mesurer dans une fonction de test (accord de
  Nico requis pour tout déploiement).
- **Coûts** : aujourd'hui ≈ 235 à 390 $ / cycle, ≈ 2 350 à 3 900 $ à 10 fois plus d'utilisateurs ; méthode D dans nos
  fonctions ≈ 0 à 5 $ (egress +13 à 22 Go, invocations), ≈ 16 à 38 $ à 10 fois plus.
- Remesure Supabase 24 h programmée le 03/11 à 16:40 (tâche de la session de ce terminal).
