# Fiche complète dès l'import : Depop, Beebs, Leboncoin, eBay (25/10/2026, lecture seule, heure de Paris)

## RAPPORT COURT
1. Hors Vinted, le manque réel est PETIT et concentré. Les % de départ (Depop 44, Beebs 36, LBC 14, eBay 3) comptent les
   fiches FUSIONNÉES : Depop 44 % = 8/18 fiches, toutes fusionnées dans une fiche Vinted qui a déjà le texte. Fiches vivantes
   au stock dont le champ manquant n'a JAMAIS été lu là où il existe : Beebs 390 (8 comptes, 124 actifs), LBC 528
   (4 comptes, 493 actifs), eBay 67 (7 comptes, 9 actifs), Depop 0. Total 985, contre 67 405 fiches Vinted sans texte.
   Comptes payants : 2 (photos Beebs). Les autres fiches « incomplètes » ont été LUES et le vendeur n'a rien de plus :
   Beebs 16, LBC 1 068, eBay 2 087 (dont 1 064 timbres dont le texte eBay est « NEUF++ »).
2. La lecture existe partout et marche quand elle passe (captures d'annonces vivantes : texte / état / photos moyennes) :
   LBC, liste API « Mes annonces » : 8 648, 100 % / 94 % / 4,7. Beebs, page lue dans l'onglet : 2 126, 100 % / 100 % / 5,6.
   Depop, API publique depuis la page : 551, 100 % / 100 % / 6,0. eBay, API serveur : 0 annonce sans détail (comptes actifs).
   Les trous viennent de 3 goulots, prouvés sur des fiches réelles :
   a. ⚠️ releve-completer (cron 28, index public Beebs) TOURNE À VIDE. memeContenu compare un jsonb relu (clés triées par
      Postgres) à un objet JS : jamais égaux. Depuis au moins le 18/10, CHAQUE passage dit « 600 écrites, 0 inchangée »
      (≈ 57 600 réécritures/jour, chacune relance annonce_vers_fiche). Les 3 mêmes comptes (> 200 annonces) ne sont jamais
      notés et repassent toujours devant : aucun autre compte Beebs servi depuis le 23/10 18:07 (Louis : 207 annonces sans
      index). Cela enfreint « aucune ligne inchangée réécrite ».
   b. LBC : le relevé de 16eece9b (25/10 14:31) a LU ses 816 annonces avec tout leur contenu mais n'en a écrit que 400
      (budget « sans page ») : 416 fiches nées à 14:34 sans texte, à 1 photo, alors qu'aucune requête de plus ne manquait.
   c. Beebs : les photos ne sont que sur la page (l'index n'en a qu'une). Le relevé lit 27 pages au plus (120 s, environ
      1 relevé/jour/compte) : 390 fiches à 1 photo, dont 194 sur un compte dormant depuis le 14/10.
   + Défaut de règle : annonce_donnees prend la capture AVANT l'index. Pour eBay, l'état pollué de la page (« Neuf: Objet
     neuf et intact… Consulter… ») masque l'état propre lu par l'API (« Neuf ») : 65 fiches sans état.
3. Source de chaque champ :
   · LBC : API « Mes annonces » (body, images.urls_large, attributes, catégorie, lieu) ; repli : __NEXT_DATA__ de la page.
   · Beebs : index Algolia lu par le serveur (texte, marque, état, âge, couleur, matière, taille, rayon), plus la page
     /fr/p/<id> lue dans l'onglet (ld+json pour les photos, lignes libellé/valeur, fil d'Ariane, weight_id).
   · Depop : API products/by-slug. · eBay : GetItem et Browse au serveur (la page ne contient pas le texte).
4. Anti-robot mesuré (7 j). Depuis le service worker, Beebs ET LBC répondent 403 sur 77 % des postes (Vinted 19 %) : jamais
   de lecture hors onglet. Dans l'onglet : Beebs DataDome sur 9 relevés / 285 (3,2 %, 5 comptes), captures 60 échecs
   / ≈ 2 400 (cause non tracée), 0 job ; LBC 403 sur 2 relevés / 450, veille des commandes 9 coupures / 8 099 requêtes
   (1,1 ‰) ; Depop 0 ; eBay : Browse en 429 le 24/10 08:22-08:52 et le 25/10 06:52-07:52, juste avant minuit heure du
   Pacifique (quota du jour épuisé, par déduction). Rythme sûr : Beebs 2 pages/poll, 30 à 60 s d'écart, 120/jour/compte,
   arrêt 12 h au 1er 403/429/captcha ; LBC 0 page (la liste suffit) ; Depop rien à lire ; eBay serveur seul, borné par le quota.
5. Plan, dans l'ordre gain/risque :
   ① Serveur, 0 requête plateforme : réparer memeContenu (comparaison canonique). Texte et état Beebs en 15 min pour tous
     les comptes actifs, ≈ 57 600 écritures/jour en moins. C'est une fonction edge (feu vert).
   ② Extension : écrire TOUTES les captures de la liste LBC (budget de 400 levé pour « jamais capturée / une photo »), CPU
     mesuré d'abord. Fiche LBC complète dès le premier relevé.
   ③ Migration : annonce_donnees prend la 1re valeur SAINE (capture, puis index). +65 états eBay.
   ④ Extension 0.6.145 : lireFondBeebs = lireFondVinted + lireHtmlMemeOrigine + capturerFicheEnPage("beebs") + l'écriture
     de capture mise en commun avec le relevé (les déclencheurs complètent la fiche). lecture-fond.js servi PAR PLATEFORME,
     demandes d'abord, coin_config.lecture_fond_mode_beebs, refus comptés par plateforme.
   ⑤ Au clic : la fiche demandée passe en tête des captures du relevé (pas le cas aujourd'hui).
   Rien à ajouter pour eBay, Depop, ni LBC à session fermée (77 fiches : DataDome, faible gain).
6. Pilote (poste de Nico, 0.6.144, 13 annonces Beebs) en mode mesure, ≥ 48 h et ≥ 200 lectures. Critères : 0 refus,
   médiane < 3 s, aucune navigation de l'onglet, CPU stable. Puis comptes payants, puis tous après 7 j sous 0,5 % de refus.
   ① se vérifie en un passage : « ecrites » doit tomber au nombre réel de changements.

---------------------------------------------------------------------------------------------------------------------

## 1. Le manque réel

Définitions (celles de `supabase/functions/_shared/contenu-fiche.js`) : plateforme d'origine = `plateformeOrigine(fiche)`
(`vinted_sync` → vinted, `releve_<pf>` → pf) ; « sans description » = moins de 2 mots (`texteSuffisant`) ; « sans état » =
`attributs.etat.v` vide ; « ≤ 1 photo » = tableau `photos` de longueur ≤ 1. Payant = `is_premium OR is_pro OR is_business
OR is_comped` (même règle que `palierDuProfil` ≥ premium). Requêtes lancées le 25/10 entre 16:00 et 16:40.

### 1.1 Les chiffres de départ, refaits
Sur 30 jours, description strictement vide, fiches FUSIONNÉES comprises : Vinted 77,2 %, Depop 44,4 % (8/18), Beebs 36,0 %,
LBC 13,5 %, eBay 2,7 %. Ce sont les chiffres cités. Sans les fusionnées (`fusionne_dans` NULL), description vide : Depop
0 %, Beebs 32,8 %, LBC 15,0 %, eBay 1,6 %. Les 8 fiches Depop vides ont toutes été fusionnées quelques minutes après leur
naissance dans une fiche Vinted qui a son texte. Exemple : 1792216677731 (a3002ab6), créée le 17/10 07:57, fusionnée à
12:19 dans une fiche `vinted_sync` dont le texte fait 95 caractères.

### 1.2 Fiches vivantes au stock (non fusionnées, `statut='stock'`)
| origine | palier | créées ≤ 30 j | sans desc | sans état | ≤ 1 photo | incomplètes (comptes) | toutes dates | sans desc | sans état | ≤ 1 photo | incomplètes (comptes) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Beebs | gratuit | 613 | 239 | 239 | 395 | 395 (7) | 619 | 239 | 239 | 400 | 400 (8) |
| Beebs | payant | 120 | 0 | 0 | 6 | 6 (2) | 162 | 0 | 0 | 6 | 6 (2) |
| Depop | payant | 8 | 1 | 0 | 1 | 1 (1) | 8 | 1 | 0 | 1 | 1 (1) |
| eBay | gratuit | 4 133 | 1 121 | 1 377 | 1 294 | 1 558 (26) | 4 852 | 1 155 | 1 481 | 1 322 | 1 697 (31) |
| eBay | payant | 736 | 14 | 460 | 12 | 484 (5) | 841 | 49 | 469 | 14 | 523 (5) |
| LBC | gratuit | 2 785 | 470 | 780 | 1 184 | 1 467 (43) | 3 308 | 689 | 1 028 | 1 434 | 1 744 (50) |
| LBC | payant | 301 | 0 | 7 | 43 | 50 (10) | 400 | 0 | 7 | 50 | 57 (12) |
| Vinted (repère) | gratuit / payant | 20 462 / 6 403 | 16 038 / 3 268 | — | — | — | 69 542 / 11 012 | 62 106 / 5 299 | — | — | — |

### 1.3 Lu ou jamais lu ? Le vrai manque
Pour chaque fiche incomplète, j'ai regardé si son annonce d'origine vivante (`annonces_plateforme`, même plateforme,
`disparu_le` NULL) avait été lue à une source qui porte le champ manquant :
· texte et état : `capture` ou `donnees_index` ;
· photos : `capture` pour Beebs, LBC et Depop ; `capture` ou `donnees_index.photos` pour eBay. L'index Beebs ne porte
  qu'une image.

| origine | palier | incomplètes | annonce plus en ligne | JAMAIS lu à la source | dont desc / état / photos | sur comptes actifs (7 j) | comptes | tout lu, rien de plus chez le vendeur |
|---|---|---|---|---|---|---|---|---|
| Beebs | gratuit | 400 | 0 | 388 | 239 / 239 / 388 | 122 | 7 | 12 |
| Beebs | payant | 6 | 0 | 2 | 0 / 0 / 2 | 2 | 1 | 4 |
| Depop | payant | 1 | 0 | 0 | — | 0 | 0 | 1 |
| eBay | gratuit | 1 697 | 6 | 67 | 67 / 67 / 67 | 9 | 7 | 1 624 |
| eBay | payant | 523 | 60 | 0 | — | 0 | 0 | 463 |
| LBC | gratuit | 1 744 | 202 | 528 | 526 / 528 / 526 | 493 | 4 | 1 014 |
| LBC | payant | 57 | 3 | 0 | — | 0 | 0 | 54 |

### 1.4 Une fiche naît-elle complète ? (30 j, stock, non fusionnées ; date de complétion relevée dans `inventaire_journal`, champ description, motif `champ_vide_complete`)
| origine | fiches | nées avec texte | complétées ≤ 10 min | ≤ 24 h | > 24 h | toujours sans |
|---|---|---|---|---|---|---|
| LBC | 3 086 | 2 566 (83 %) | 8 | 27 | 16 | 469 (15 %) |
| Beebs | 733 | 171 (23 %) | 93 | 176 | 54 | 239 (33 %) |
| eBay | 4 869 | 3 | 940 (19 %) | 3 483 (72 %) | 372 (8 %) | 71 (1,5 %) |
| Depop | 8 | 7 | 0 | 1 | 0 | 0 |
Une fiche eBay naît toujours sans texte : il arrive ensuite par l'API, en quelques heures. La publication est retenue
jusque-là (`lectureOrigineEnAttente`, avec le message « Rien à faire »).

### 1.5 Où se trouvent les manques (comptes)
- Beebs 18e461c1 (gratuit, extension 0.6.110, vue pour la dernière fois le 14/10 20:38) : 194 fiches jamais lues, créées
  du 12 au 15/10. Le compte est dormant, donc hors de `comptes_actifs(7)`.
- Beebs 3f91c02e (gratuit, actif, 0.6.141) : 23 fiches jamais lues, créées le 24/10. C'est l'un des 3 comptes coincés
  dans la boucle (§ 2.3).
- Beebs 6a400667 (vu le 28/09) : 20.
- LBC 16eece9b (gratuit, actif, 0.6.141) : 416 fiches jamais lues, importées le 25/10 à 14:34 (§ 2.2).
- LBC 4cd4d9ae (vu le 22/10, 0.6.128) : 77. Ses 9 relevés LBC des 30 derniers jours ont tous échoué avec « session
  leboncoin : page de connexion ».
- LBC 28865d04 (vu le 05/10) : 34, et 128 annonces disparues.
- eBay 94403189 (vu le 12/09, 0.6.32) : 35. Compte dormant ; `releve_ebay_details_a_lire` ne sert que les comptes actifs.
- Faux manque eBay, 309d0787 : 1 237 fiches incomplètes, toutes lues par Browse le 18/10. Ce sont des timbres dont la
  description eBay est « NEUF++ », avec 1 photo et sans état : il n'y a rien d'autre à lire.

Poids de chaque origine dans les publications sur 30 jours (jobs `publish`) : Vinted 42 188, eBay 5 506, LBC 3 559, Beebs
984, Depop 16.

## 2. Ce que FillSell lit déjà, où, quand, et pourquoi il manque encore

### 2.1 Le chemin commun
Une capture est écrite dans `annonces_plateforme.capture` et `capture_le` (avec `ligne` : titre et prix vus dans la liste),
ou dans `donnees_index` et `donnees_index_le` (lectures côté serveur). Les déclencheurs prennent ensuite le relais :
· `annonce_vers_fiche` appelle `fiche_completer_depuis_annonce`, qui ne remplit QUE les champs vides de la fiche
  (description, marque, type, prix, poids, état, taille, couleur, matière, âge), en lisant
  `annonce_donnees(platform, capture, donnees_index)` ;
· `annonce_capture_complete_fiche` appelle `fiche_completer_photos_capture`, qui remplace la vignette par toutes les
  photos ;
· côté extension, `reporterCaptureSurArticle` applique les mêmes règles.
Rien n'est jamais écrasé : il n'y a pas de travail de règle à faire de ce côté.

### 2.2 Leboncoin : la liste porte tout
- Relevé : `lancerRelevePlateforme`, puis `releverLeboncoinParApi()` dans l'onglet LBC. Appel
  `POST api.leboncoin.fr/api/dashboard/v1/search` (jeton de la personne, 100 annonces par page, 30 pages au plus, 0,7 à
  1,6 s entre les pages). La fonction `captureDe(a)` produit `capture_liste` = { body, images.urls_large (toutes les
  photos), toutes les `attributes` (état, marque, taille, couleur, matière, plus `attributs_bruts`), category_name,
  location }.
- Écriture : `capturerAnnonces` envoie les annonces dont la liste porte des photos dans `choisirCapturesARefaire(parListe,
  …, { budget: 400 })`. **400 au plus par relevé**, alors que la liste a déjà tout rendu. Les annonces sans photo dans la
  liste passent par la page (`__NEXT_DATA__` → `props.pageProps.ad`), 30 par relevé, dans un budget de 120 s.
- Mesure : 8 648 captures `liste_api` sur des annonces vivantes (5 417 dans les 7 derniers jours) : texte 100 %, état
  94,3 %, 4,7 photos en moyenne.
- **Preuve du goulot** : relevé de 16eece9b le 25/10, de 14:31 à 14:32. Message : « 816 en ligne lues sur 816 annoncées ·
  [capture] 400 fiche(s) capturée(s), 416 au prochain relevé ». La fiche 1792935257419 (annonce 3267600410), créée à
  14:34 et vue à 14:32, n'a jamais été capturée : aucun texte, 1 photo. Sur 7 jours, 5 relevés LBC ont atteint ce budget
  de 400, et 34 comptes ont vu « au prochain relevé » > 0 (maximum 808). Un compte fait environ 0,85 relevé LBC par jour.
- Session fermée : 4cd4d9ae, fiche 1790105237622 (annonce 2584415805), vue le 23/09 09:35 pour la dernière fois, capture
  jamais faite. Tous les relevés suivants ont buté sur « page de connexion ».

### 2.3 Beebs : l'index au serveur, les photos sur la page
- Relevé dans l'extension : page « Mes annonces », plus l'index public. La liste ne donne que le titre et 1 image.
- Capture par annonce : `capturerAnnonces` lance `lireHtmlMemeOrigine(url, id)`, un fetch de même origine depuis l'onglet
  www.beebs.app, sans navigation, d'environ 1 s, puis `capturerFicheEnPage("beebs", html)`. On en tire :
  · le ld+json Product (image[], description, brand, color) ;
  · les lignes État / Taille / Pointure / Marque / Couleur / Matière / Âge, et TOUTES les paires libellé/valeur
    (`attributs_affiches`, 25/10, chaouidz) ;
  · le fil d'Ariane ld+json (`rayon_fil`) ;
  · le `weight_id` (format de colis).
  Budget : 30 par relevé et 120 s. En pratique **27 au plus, 20 le plus souvent** (33 relevés sur 7 jours). Mesure :
  2 126 captures `meme_origine` (1 317 sur 7 jours) : texte et état 100 %, 5,6 photos en moyenne.
- Côté serveur, `releve-completer` (cron 28, `7-59/15`, version 3, verify_jwt false) interroge l'index Algolia public
  (`prod_MARKETPLACE_mobile`) : 1 requête par vendeur rend tout son dressing (texte, marque, état, âge, couleur, matière,
  taille, catégorie, sans les photos). Il écrit `donnees_index`, en se limitant à 3 comptes par passage, 200 écritures par
  compte, et `comptes_actifs(7)`.
- **⚠️ D1, la boucle** (code déployé = dépôt, lu par `get_edge_function`). `memeContenu(x, y)` fait
  `JSON.stringify(a) === JSON.stringify(b)`. Or `x` est le jsonb relu, dont les clés sont triées par Postgres
  (`{"etat":…, "prix":…, "lu_le":…, "titre":…, "marque":…, "source":…}`, constaté sur 3f91c02e), alors que `y` suit l'ordre
  d'insertion de `normaliserBeebs` (`source, lu_le, titre, description…`). Les deux ne sont jamais égaux. Constaté dans les
  journaux :
  · 18/10 16:07 → 19/10 15:52 : 96 passages sur 96 avec « inchangees: 0 », dont 95 avec « ecrites: 600 » ;
  · 22/10 16:07 → 23/10 15:52 : 94 sur 94 ;
  · chaque passage du 23 au 25/10.
  Un compte qui a plus de 200 lignes garde donc toujours des « reportées ». Il n'est jamais noté dans
  `releve_index_passages`, reste en tête (`NULLS FIRST`) et réécrit les 200 MÊMES lignes toutes les 15 min. Aujourd'hui :
  | compte | lignes rattachées vivantes | avec index | sans index |
  |---|---|---|---|
  | 3f91c02e | 1 099 | 200 (toutes réécrites à 15:52) | 899 |
  | 90ace0e4 | 351 | 351 | 0 |
  | 7373c96c | 295 | 267 | 28 |
  Dernier passage noté, tous comptes confondus : le 23/10 à 18:07. Depuis, aucun autre compte Beebs n'a été servi, par
  exemple Louis (447d920c : 207 lignes sans index, dernier passage le 19/10 10:52), faf5021a (116) ou eacbe32c (120).
  Coût : 600 × 96 ≈ 57 600 mises à jour par jour, chacune relance `annonce_vers_fiche` (complétion, suivi du prix, poids)
  et, quand la capture porte plus d'une photo, `fiche_completer_photos_capture`. La partie eBay du même fichier réécrit
  aussi `donnees_index` à chaque lecture (25 par passage, sans boucle puisque `donnees_index_le` avance).
- Preuves :
  · fiche 1791804493818 (18e461c1), annonce 34092066 : vue au relevé le 14/10 10:36, jamais capturée, jamais indexée ;
  · fiche 1792860311186 (3f91c02e), annonce 32913156 : vue le 25/10 10:18, jamais capturée, jamais indexée (ligne bloquée
    derrière les 200 réécrites).

### 2.4 Depop : l'API publique depuis la page
- Relevé : `listerMesArticles()` dans `content-scripts/depop.js` interroge `webapi.depop.com/presentation/api/v1/shops/<id>/products/`
  (sans authentification, depuis www.depop.com). La liste contient déjà `description` et `pictures` : le code en prend la
  1re ligne comme titre et la 1re photo.
- Capture : `DEPOP_CAPTURE_ARTICLE` → `capturerArticle(slug)` → `products/by-slug/<slug>/`. On en tire : toutes les
  photos, la description, la marque, la taille (variant), l'état (`condition`), la couleur, `group/product_type`, le genre
  et la quantité. 30 par relevé. Mesure : 551 captures `api` (texte et état 100 %, 6,0 photos) ; 937 en 7 jours, 1 échec.
- Manque : 0. Le chiffre de 44 % vient des fiches fusionnées (§ 1.1).

### 2.5 eBay : côté serveur, pas d'extension
- `ebay-releve-api` : Trading GetMyeBaySelling, puis GetItem pour le détail. 60 par relevé, 150 quand la demande vient de
  `serveur:lecture_origine`, fraîcheur de 7 jours.
- `releve-completer` : Browse `get_item_by_legacy_id` avec le jeton applicatif, 25 par passage (`releve_ebay_details_a_lire`,
  comptes actifs). Ces deux lectures écrivent `donnees_index` : texte HTML converti en texte, aspects, état, photos s-l1600,
  catégorie.
- `ebay-account` `lire_description` (au clic) : regarde `capture.description`, puis appelle Browse. Il ne regarde pas
  `donnees_index.description` déjà lue, ce qui coûte un appel Browse de trop sur un quota déjà saturé le matin.
- La page eBay (`capturerFicheEnPage` en ld+json, 925 captures) donne 0 % de texte (`itm.ebaydesc.com` est hors de nos
  permissions) et un état souvent pollué.
- Comptes actifs : 6 255 annonces rattachées vivantes, aucune sans détail. Comptes dormants : 55 sans détail, sur 3
  comptes.
- **D3** : `annonce_donnees` fait `COALESCE(capture->>k, donnees_index->>k)`. Pour 65 fiches, la capture de page porte un
  état du type « Neuf: Objet neuf et intact… Consulter l'annonce du vendeur… », refusé par `valeur_attribut_saine`, alors
  que l'index porte « Neuf » (`valeur_attribut_saine('Neuf')` = true). Résultat : la fiche reste sans état. Exemple :
  1790174164543 (b6005a59).

### 2.6 Au clic (« Publier ailleurs »)
`lectureOrigineEnAttente` retient la publication tant que l'annonce d'origine n'a jamais été lue.
`demander_lecture_origine` lance alors, pour LBC, Beebs et Depop, un relevé `serveur:lecture_origine` ; pour eBay, un
relevé de 150 détails. Le relevé ne fait PAS passer la fiche demandée en premier : l'ordre est une photo → changées →
jamais → périmées, 20 à 30 pages. L'extension (`lireAnnoncesOrigineEnAttente`) ne lit elle-même que Vinted. Sur 7 jours,
`lectures_origine_demandees` ne compte aucune demande hors Vinted.

## 3. Ce qu'une lecture complète demanderait (source de chaque champ, d'après le code ; aucune visite des sites)
| champ | Leboncoin | Beebs | Depop | eBay |
|---|---|---|---|---|
| description | liste API `body` ; page `__NEXT_DATA__ ad.body` | index Algolia `description` ; page ld+json | `products/by-slug` `description` (déjà dans la liste) | GetItem / Browse `description` (HTML vers texte) |
| état | `attributes` (libellé « État » ou clé `condition`) | index `attributes.condition` ; page, ligne « État » | `attributes.condition` | Browse `condition` / GetItem ; jamais la page |
| photos | `images.urls_large` (liste ou page) | **page seulement** : ld+json `image[]` (l'index en a 1) | `pictures` (détail ; liste à vérifier) | Browse `image` et `additionalImages` (s-l1600) |
| marque, taille, couleur, matière | `attributes` | index `attributes.*` ; page, lignes | `brand`, `variant`, `colour` | aspects |
| rayon | `category_name` | index `category_search_terms` ; page, fil d'Ariane ld+json | `group/product_type` | `categoryPath` |
| propre à la plateforme | `attributs_bruts`, lieu | âge, `attributs_affiches`, `weight_id` | genre, quantité | — |
| lu où | onglet LBC (jeton) ; serveur impossible | index : serveur ; page : onglet, même origine | onglet Depop (API publique) | serveur (API) |
Fonctions déjà écrites, à reprendre telles quelles : `releverLeboncoinParApi`/`captureDe`, `lireHtmlMemeOrigine`,
`capturerFicheEnPage` (branches leboncoin, beebs, ebay), `capturerArticle` (Depop), `normaliserBeebs` et `normaliserBrowse`
(serveur), `reporterCaptureSurArticle`, `estPageBotShield`.

## 4. Risque anti-robot mesuré (7 jours, jusqu'au 25/10 vers 16:30)
| signal | Vinted (repère) | Beebs | Leboncoin | Depop | eBay |
|---|---|---|---|---|---|
| sonde du SERVICE WORKER (`extension_sessions.http`, 138 postes vus) | 403 : 26 (19 %) | 403 : 106 (77 %) | 403 : 106 (77 %) | 0 | 403 : 1 |
| relevés « Mes annonces » dans l'onglet | — | 285 relevés, 46 comptes : **9 DataDome** (3,2 %, 5 comptes) | 450 relevés : 2 avec 403 sur l'API (5 essais, rattrapés) | 101 relevés : 0 | API : 0 × 429 (30 j) |
| lectures d'annonces dans l'onglet | lecture de fond (pilote) : 73, 0 refus | captures : ≈ 2 400 essais, 60 échecs (2,5 %, cause non tracée) | — | 937 captures, 1 échec | Browse au serveur : **429 le 24/10 08:22-08:52 et le 25/10 06:52-07:52** |
| lectures répétées en arrière-plan | — | — | veille des commandes : 8 099 requêtes, **9 coupures 403** (1,1 ‰, 36 comptes) | — | — |
| jobs (publication/republication) | 10 662 : 176 marqués anti-robot (5 comptes) | 2 697 : 0 | 5 939 : 1 | 630 : 0 | 2 281 : 0 |

Ce que j'en retiens :
1. Beebs et Leboncoin sont derrière DataDome, comme Vinted (`content-scripts/beebs.js` : « DataDome sert sa vérification
   anti-robot sous la même adresse (403, captcha-delivery) »). Une lecture ne peut donc se faire que DANS l'onglet de
   travail.
2. Beebs se montre plus nerveux que Vinted sur les fetch de « Mes annonces » (3,2 % des relevés).
3. Attention : `lireHtmlMemeOrigine` renvoie « HTTP 403 » AVANT de regarder si la page est un captcha, puis la capture
   navigue vers la page de l'annonce. Une lecture de fond doit au contraire classer tout 403, 429 ou captcha comme
   anti-robot et s'arrêter net.
4. Le 429 eBay tombe juste avant minuit heure du Pacifique (07:00 UTC). Il cesse au passage de 07:07 UTC. C'est la
   signature d'un quota Browse journalier épuisé, partagé avec `ebay-api-worker`, `ebay-ventes-sync` (04:40 UTC),
   `ebay-account` et `ia-banc-deduction`. C'est une déduction, à vérifier dans le portail développeur eBay.

Rythme sûr d'après ces mesures :
- **Beebs** : aujourd'hui, jusqu'à 27 pages en environ 2 min (0,8 à 1,6 s d'écart), et cela passe à 97,5 %. Pour une lecture
  de fond, je propose 2 pages par poll, 30 à 60 s d'écart, 120 par jour et par compte, et un arrêt de 12 h au premier
  403/429/captcha. Jamais pendant un relevé ou une republication Beebs du même poste, jamais si l'onglet est déchargé
  (il faut le réveiller comme pour Vinted et Opla dans `workTabForFetch`). Un retard de 200 fiches se résorbe alors en
  2 jours, un compte de 1 099 en 10 jours.
- **Leboncoin** : aucune page à lire (la liste suffit). Pour une session fermée, ne rien faire : 77 fiches seulement, et
  1,1 ‰ de coupures même à 1 requête toutes les 10 min.
- **Depop** : aucun manque. Si l'on en avait besoin, le rythme de Vinted conviendrait (API publique, 0 refus mesuré).
- **eBay** : côté serveur, borné par le quota. Pas d'appel Browse supplémentaire sans avoir lu ce quota.

## 5. Plan

### 5.1 Ce qu'il faut ajouter
- **① D1, `supabase/functions/releve-completer/index.ts`** (fonction edge, cron, `--no-verify-jwt`). Remplacer
  `memeContenu` par une comparaison canonique (sérialisation qui trie les clés récursivement, ou comparaison des seuls
  champs utiles), sans `lu_le`, et ajouter un selftest avec un objet dans l'ordre jsonb. Effet attendu : les lignes
  inchangées sont sautées, les 3 comptes avancent de 200 par passage (3f91c02e terminé en 5 passages environ), puis sont
  notés, et la file Beebs se remet à tourner pour tous les comptes actifs.
- **② LBC, extension** (`capturerAnnonces`) : le budget `parListe` (400) ne s'applique plus aux annonces « une photo » et
  « jamais capturées ». Les captures des annonces périmées ou changées restent bornées. Aucune requête vers LBC en plus ;
  coût : environ 4 requêtes Supabase et les déclencheurs par annonce. CPU à mesurer avant (règle), et le relevé doit tenir
  en 5 min.
- **③ D3, migration `annonce_donnees`** (réécrite depuis `pg_get_functiondef` en prod) : pour etat, taille, couleur,
  matière, marque et âge, prendre la première valeur `valeur_attribut_saine` entre capture et index. La description reste
  « capture puis index ». Les 65 fiches se complètent au prochain passage du déclencheur, ou par un script de réparation.
- **④ Beebs en arrière-plan.**
  Serveur, `_shared/lecture-fond.js` : passer à une table par plateforme.
  · `LECTURE_FOND_RYTHMES.beebs = { par_cycle: 2, ecart_s: [30,60], par_jour: 120, pause_refus_h: 12 }`.
  · Mode `coin_config.lecture_fond_mode_beebs` (absent = 1, pilotes).
  · `aLireEnFondBeebs` : annonce vivante, rattachée à une fiche au stock non fusionnée qui a ≤ 1 photo, pas de texte ou pas
    d'état, avec `capture_le` NULL, ou une lecture ratée de plus de 7 jours.
  · Liste servie : `[{plateforme:'beebs', annonce_id, inventaire_id, listing_id, url, manque[], ecrire}]`, avec les fiches
    de `lectures_origine_demandees` d'abord, puis les plus récentes ; 50 au plus, lues par pages.
  · Dans `get-pending-jobs`, compter les refus PAR plateforme : aujourd'hui `metadata->>resultat='antirobot'` sans
    plateforme, si bien qu'un refus Beebs couperait aussi Vinted. Faire de même dans `ops-digest`.
  Extension 0.6.145 :
  · `lireFondBeebs(session)`, calquée sur `lireFondVinted`, appelée sous le verrou du poll ;
  · pause par plateforme (`fs_lecture_fond_pause_jusqua_beebs`) ;
  · lecture : `lireHtmlMemeOrigine` (403/429/captcha → `antirobot`, sans navigation de repli), puis
    `capturerFicheEnPage("beebs", html)` ;
  · écriture : sortir de `capturerAnnonces` une fonction `ecrireCaptureAnnonce(platform, annonce, capture)` (lecture
    `avant`, PATCH `capture`/`capture_le`/`ligne`, `reporterCaptureSurArticle`), commune au relevé et à la lecture de
    fond : une seule règle ;
  · trace : `tracerLectureFond` complétée de `plateforme`, `listing_id` et du nombre de photos.
- **⑤ Au clic** : `choisirCapturesARefaire` place d'abord les annonces des fiches en attente
  (`rpc/lectures_origine_en_attente`, qui renvoie déjà toutes les plateformes).
- **Rien à faire** pour eBay ni Depop dans l'extension, ni pour LBC à session fermée. À vérifier un jour sur le pilote : la
  liste Depop porte-t-elle toutes les photos et l'état ? Si oui, on économiserait l'appel de détail.

### 5.2 Ordre (fiches complètes gagnées / risque)
1. ① D1 : 0 risque côté plateforme, et le bug de CPU disparaît. Il débloque le texte et l'état Beebs de tous les comptes
   actifs, ainsi que les futurs imports Beebs (complétés en 15 min au lieu de jamais).
2. ② LBC : 0 requête de plus. 416 fiches aujourd'hui, et chaque gros import LBC devient complet dès son premier relevé.
3. ③ D3 : migration seule, 65 états eBay.
4. ④ Beebs photos : le seul ajout qui charge une plateforme. 390 fiches aujourd'hui (124 sur comptes actifs, 2 payantes),
   plus chaque import Beebs futur (l'index n'a qu'une photo).
5. ⑤ Priorité au clic.

### 5.3 Protocole de mesure sur le poste pilote avant ouverture
- **①** : sur le premier passage après déploiement, on doit lire « inchangees » > 0 et « ecrites » tombé aux vrais
  changements. Dans les 2 h, `releve_index_passages` doit avoir des lignes neuves (les 3 comptes, puis 447d920c, faf5021a…).
  Comparer `veille-cpu` avant et après. Lire version et `verify_jwt` avant et après.
- **②** : sur le poste de Nico (12 annonces LBC), le relevé doit écrire toutes les captures de liste. Sur le parc, la mention
  « au prochain relevé » doit disparaître pour les annonces jamais capturées. Durée du relevé < 5 min, CPU mesuré.
- **④** : poste de Nico (f44b5917, 0.6.144 aujourd'hui, 13 annonces Beebs vivantes, toutes capturées), avec
  `lecture_fond_mode_beebs = 1` : même chemin, même rythme, rien d'écrit, lecture en rotation.
  · Au moins 48 h et ≥ 200 lectures, dont certaines pendant un relevé ou une republication Beebs du même poste.
  · Critères : 0 refus (403/429/captcha) ; médiane < 3 s ; échecs hors anti-robot < 5 % ; aucune navigation de l'onglet ;
    republications Beebs du poste intactes ; CPU stable.
  · Puis un vrai trou à combler : une annonce de test Beebs à 999 € DÉJÀ en ligne (celle de Call of Duty). Une annonce de
    ≥ 500 € fraîchement déposée reste invisible 48 à 126 h chez Beebs (`_shared/beebs-sortie-verification.js`) et ne
    serait donc pas lisible. On relève, on vérifie que la fiche naît à 1 photo, que la lecture de fond la complète
    (photos, texte, état, rayon) sans aucun geste, puis on fait « Publier ailleurs ».
  · Ouverture : mode 2 (payants : 2 fiches), puis mode 3 après 7 jours à moins de 0,5 % de refus, aucune coupure de compte
    répétée, et un `ops-digest` qui compte bien les lectures et les refus Beebs. Coupure : `lecture_fond_mode_beebs = 0`.
- Avant ④, tracer la cause des 60 échecs de capture Beebs : `meme_origine_ratees` et leur motif sont aujourd'hui
  seulement dans la console.

## Annexe : requêtes lancées (execute_sql, projet tojihnuawsoohlolangc ; query_logs, fenêtres de 24 h)
- Manque par origine × palier (§ 1.2) : `inventaire` (origine `vinted_sync` | `releve_*`, `fusionne_dans IS NULL`,
  `statut='stock'`) ⨝ `profiles`. Sans desc : `description IS NULL OR btrim(description) !~ '\S\s+\S'`. Sans état :
  `coalesce(btrim(attributs->'etat'->>'v'),'')=''`. Photos : `jsonb_array_length(photos) <= 1`. Agrégé avec
  `filter (created_at >= now()-'30 days')`.
- Chiffres de départ (§ 1.1) : même table, 30 j, `btrim(description)=''`, fusionnées comprises ou non.
- Lu ou jamais lu (§ 1.3) : pour chaque fiche, `LATERAL` sur `annonces_plateforme` (même plateforme,
  `disparu_le IS NULL`) : `bool_or(capture_le IS NOT NULL OR donnees_index IS NOT NULL)` pour le texte et l'état ;
  `bool_or(capture_le IS NOT NULL OR (ebay AND jsonb_typeof(donnees_index->'photos')='array'))` pour les photos. Comptes
  actifs : `comptes_actifs(7)`.
- Naissance (§ 1.4) : `min(inventaire_journal.created_at)` où `champ='description' AND motif='champ_vide_complete'`.
- Sources des captures (§ 2) : `annonces_plateforme` vivantes, regroupées par `capture->>'source'`, `capture->>'lecture'` ;
  % de description, % d'état, photos moyennes.
- Boucle (§ 2.3) : `query_logs` sur `function_logs`, `[releve-completer] {` (18-19/10, 22-23/10, 23-24/10, 24-25/10) ;
  `releve_index_passages` ; par compte, `annonces_plateforme` Beebs `donnees_index_le > now()-1h` ; `get_edge_function
  releve-completer` (version 3).
- Plafond LBC (§ 2.2) : `vinted_sync_runs` (kind `annonces`) et regexp sur `erreur` (`\[capture\] (\d+) fiche`,
  `(\d+) au prochain relevé`).
- D3 (§ 2.5) : fiches sans état ⨝ annonces eBay où `valeur_attribut_saine(capture->>'etat')` est faux et
  `valeur_attribut_saine(donnees_index->>'etat')` est vrai.
- Anti-robot (§ 4) : `profiles.extension_sessions->'http'` (postes vus en 7 j) ; `vinted_sync_runs.erreur` (`[anti_robot]`,
  `http_403`, `http_429`) ; `usage_logs` `veille_commandes` (résumés `jour`), `releve_ventes`, `lecture_fond` ;
  `cross_post_jobs.platform_fields` (`blocage_antirobot`, `mur_antirobot`, `attente_antirobot_compte`,
  `antirobot_pause_cumul_ms`, `needs_user_source`) ; `query_logs` pour `HTTP 429` dans releve-completer.
- Fréquence des relevés : `vinted_sync_runs` `done|incomplete` sur 7 j, `lead()` par compte → relevés par compte et par
  jour, écart médian.
