# Lot A — clôture (29/10/2026 soir)

Push : refusé une première fois par le garde-fou de Claude Code (« Out-of-Place Publication », ~17:57), fait sur ordre explicite de Nico (65d57df..e210a6f). Web servi `2026-10-29T16:58:45Z+e210a6f` (build.json relu ; translate="no" + meta notranslate sur /, /en et /app ; /email/logo-beebs-2910.png 200 ; entrée index-g6MR3RtS.js 200 avec et sans Origin).
Consigne de Nico (29/10 ~15:20) : clore le lot A en entier ; tout ce qui ne demande pas Leboncoin d'abord, puis arrêt
pour la reconnexion Leboncoin du poste de Nico. Heures de Paris. Enquêtes en lecture seule en parallèle (relevé
Leboncoin, eBay, logo Beebs, listes et clôtures), correctifs, tests réels et livraison depuis ce terminal.

## 1. Google Traduction bloquée — CLOS (ordinateur) ; téléphone : rendu prouvé, la bulle ne se voit que sur un téléphone
- `translate="no"` + `class="notranslate"` + `<meta name="google" content="notranslate">` : `index.html` (app web et
  mobile ; `interdireTraductionApp()` les repose au chargement d'App.jsx), `site/gabarits/layout.mjs` (les 55 pages du site,
  fr et en), `chrome-extension/popup.html`, `serveur-cloud/public/connexion.html`. Garde du DOM et pile d'erreur du point 10
  gardées. Selftest `dom-traduit` (18 contrôles).
- **Preuve réelle, Chrome en italien (profil neuf)** : fillsell.app en prod → icône de traduction dans la barre d'adresse et
  bulle « francese / italiano — Google Translate » (vitrine et /login) ; version corrigée (aperçu local du build) → ni
  icône ni bulle, pages rendues normalement. Captures : scratchpad `preuves/avant-*.png`, `apres-*.png`.
- **Téléphone** : rendu 390 px identique AU PIXEL avant/après (vitrine et /login, empreintes sha1 égales). La décision de
  proposer la traduction lit les mêmes marques sur Chrome Android et Safari iOS ; l'app Capacitor n'a pas de traduction.
  La bulle elle-même ne se voit que sur un vrai téléphone : ouvrir fillsell.app/en dans Chrome du téléphone (10 s).
- Livré : OTA 2.9.133, web au push, popup dans la 0.6.154. La page du Cloud partira avec le déploiement du Cloud.

## 2. eBay : GeteBayDetails remplacé par getShippingServices (API Metadata) — CLOS
- `_shared/ebay-shipping.ts` : `GET /sell/metadata/v1/shipping/marketplace/EBAY_FR/get_shipping_services`, jeton
  APPLICATIF (api_scope, `_shared/ebay-app-token.ts`, déjà en prod pour Browse). Nos 161 comptes eBay portent api_scope ;
  le jeton applicatif ne dépend d'aucun vendeur : personne n'a à se reconnecter.
- **Repli** : Metadata en échec → GeteBayDetails (jeton du vendeur), journalisé `[ebay-shipping] repli …` jusqu'au
  15/03/2027 ; les deux en échec → l'écran dit les deux motifs. Les publications ne lisent jamais cette liste (elles
  portent la politique déjà posée) : aucune publication ne dépend de cet appel.
- **Avant/après sur cas réels (compte de Nico)** : 1re comparaison 16:17 → DIFFÉRENTES : transporteur écrit « LA_POSTE »
  (Lettre Suivie, Lettre recommandée, Ecopli sortaient de « courrier »), Chrono13 rangé EXPEDITED (il disparaissait),
  FR_ColissimoReturnsDomestic dit valide (une étiquette de RETOUR apparaissait), 2 Convelio en moins (jamais affichés).
  Lecture alignée (« _ » retirés, EXPEDITED/ONE_DAY = à domicile, service « Returns » jamais proposé) → **comparaison
  16:26 : 19 modes affichés des deux côtés, mêmes codes, mêmes familles, mêmes délais** ; seul écart : le libellé
  FR_DeliveryRecycling reformulé par eBay. Les deux listes réelles sont dans `scripts/fixtures/ebay-modes-envoi-fr-2910.json`
  (selftest `ebay-modes-envoi-metadata` : même écran, famille par famille). Le numéro ShippingServiceID n'existe plus
  chez Metadata ; FillSell n'a jamais lu que le CODE texte, identique des deux côtés.
- **Publication réelle de bout en bout** (compte de Nico, 999 €, « TEST FillSell 999 ne pas acheter ») : eBay
  **820292123879** publiée à 16:18 (rayon 137843, API), retirée à 16:28 (page eBay : « Le vendeur a mis fin à cette
  annonce… », TERMINÉ). Scripts `scripts/essais/20261029_test_bijoux_ebay_nico*.sql` (gestes de l'app sous ses claims ;
  sa file reprise pour le test puis remise en pause à 16:37).
- Fonctions : ebay-account v19 → v20 → v21 (journal complet) → **v22** (lecture alignée), verify_jwt true inchangé.

## 3. Mail eBay du 27/10 — lu en entier (captures de Nico), CLOS
Il n'annonce **aucune date et aucun appel précis** :
1. GA des « Modernized APIs » (REST et GraphQL) — information, rien d'imposé. FillSell : non concerné.
2. Retraite future, sans date, des « Traditional APIs » SOAP/XML = l'API Trading. **FillSell concerné** (aucune date) :
   GetUser (`_shared/ebay-oauth.ts:378`), GeteBayDetails (**traité, point 2**), GetMyeBaySelling
   (`_shared/ebay-trading-releve.ts:98`), GetItem (`ebay-trading-releve.ts:171`, `ebay-api-worker` 1975/2163),
   EndFixedPriceItem / EndItem (`ebay-api-worker:2017`), ReviseInventoryStatus (`ebay-api-worker:3316`), GetMyMessages /
   GetMemberMessages / AddMemberMessageRTQ (`ebay-messagerie`). Remplaçants nommés par le guide de migration
   (developer.ebay.com/develop/guides/sell/modern-apis-migration-guide) : Listing API GraphQL (sellerListingSearch,
   sellerListings, endListing, bulkUpdateInventory — API du 26/10/2026, scopes sell.listing non confirmés), Message API
   (scope commerce.message, que notre connexion n'a pas), Identity. ⚠️ Ceux-là exigeraient de nouveaux scopes → une
   reconnexion eBay des 150 comptes actifs : décision de Nico (lot B), rien n'est daté chez eBay.
3. Retraite des « non-standard REST APIs », sans les nommer (Post-Order, Return Management…) : FillSell non concerné
   (jamais appelées). L'API Inventory v1, que nous utilisons, n'est ni cible ni retirée dans le guide : à surveiller.
4. Guides, outils IA, SDK, API Explorer, GraphQL Explorer, portail, support : non concerné.
- Seule date publiée qui nous touche (page « API Deprecation Status », pas le mail) : GeteBayDetails le 15/03/2027 — traité.
  Les autres retraits datés (ShoppingCartItemEndingSoon, GetSellerDiscountProfiles, Merchandising…) : jamais appelés.

## 4. Logo Beebs (jaune, « B » noir) — CLOS
- Source : icône officielle de l'App Store (app 1457130269, version du 27/10), 1024 px ; ⚠️ le CDN de Beebs sert encore
  l'ancien logo (ne rien y prendre).
- Remplacé : app web et mobile (`BeebsIcon.jsx`, 46 écrans via PlatformLogo ; `platform-logos/source/beebs-icon.png`),
  extension (`chrome-extension/assets/beebs.png`, 0.6.154), mails (`public/email/logo-beebs-2910.png`, nom NEUF car les
  images de fillsell.app sont « immutable » un an ; `_shared/plateformes.ts`, email-tunnel **v75**), site (11 captures :
  9 corrigées au pixel près, 2 refaites par l'outil de captures, tous contrôles verts ; variantes `site:images`), vidéo du
  site (versions A et B re-rendues à l'identique avec le nouveau logo), image de partage `og-image-fillsell.png` (la tuile
  « b » violette, qui n'était ni l'ancien ni le nouveau logo, remplacée par l'icône officielle).
- Rendu contrôlé : clair et sombre (mode sombre forcé de Chrome — FillSell n'a pas de thème sombre propre), téléphone
  et ordinateur (publication, stock, stats, popup). Aucun autre logo touché (couleurs des autres plateformes inchangées ;
  la couleur des barres Beebs des Stats, orange #FF6B35, n'est pas un logo : inchangée).
- Ancien logo encore présent, volontairement : `public/email/logo-beebs.png` (mails déjà envoyés), images de la campagne
  du 26/09 (envoyée), `docs/refonte/captures` (documentation). Hors dépôt : captures des fiches App Store / Play
  (`assets/store-*`) — à remettre par Nico s'il le veut.

## 5. Listes pour les mails (rien corrigé)
**Ianis Martin** (ianismartinn@gmail.com, boutique Vinted ianismartin26) — en ligne, mauvais rayon :
| Plateforme | Annonce | Titre | Rayon actuel | Rayon juste |
|---|---|---|---|---|
| Vinted | 10539835953 | Top case aluminium type GIVI Trekker 65L noir - 2 casques - étanche - universel moto/scooter | Femmes > Vêtements > Hauts et t-shirts > Tops peplum | aucun chez Vinted (accessoire moto) : retirer de Vinted |
| Vinted | 10539893779 | NEUF Sacoches Crash Bars Universelles Moto - Sacoche Latérale Pare-Carter Honda Yamaha BMW Kawasaki | Femmes > Sacs > Sacs à dos | aucun chez Vinted (accessoire moto) |
| Beebs | 34239426 | Phare additionnel GS1200 GS1250 GS1300 Longue portée Feux Additionnels Universels pour Scooter & | Jeux, jouets et loisirs > Livres > Romans pour adultes | aucun chez Beebs (accessoire moto) : retirer de Beebs |
| Vinted | 10542282838 | dossier passager topcase | Enfants > Allaitement et alimentation > Accessoires pour chaise haute | aucun chez Vinted (accessoire moto) |
| Vinted | 10542225361 | Station de remplissage mini bouteille de plongée | Électronique > Appareils photo et accessoires > Stabilisateurs et supports | Sport > Natation > Kits de plongée (4752), probable |
- Les 3 premières : rayon choisi par lui dans une question FillSell le 26/10 (10:28, 11:01, 11:06). Les 2 dernières : créées
  par lui directement sur Vinted. Douteux, à montrer à part : Beebs 34239405 (sacoches moto) en Mode > Homme > Sacs et
  sacoches ; Vinted 10540830589 (phare moto) en Cyclisme > Éclairages pour vélo (posé par lui). Justes : eBay 920075667916
  (Top cases) et ses 9 annonces Leboncoin.
**Dayane** (recrutementgroupezk704) : titre exact du Levi's : « ean Levi’s vintage 514, W34 L32, FR44, coupe droite homme,
bleu marine, J150 » (tel quel, sans « J » au début, apostrophe typographique). Ancienne annonce Beebs : **34165538**
(publiée le 14/10 à 06:33, job d0cb9e74 ; 404 depuis). 34078467 est un AUTRE exemplaire (J157). Sa republication
1a323b66 attend sa réponse (« toujours à vendre ? »).

## 6. Relevé Leboncoin — cause réelle et correctif — CLOS
- **Ce n'est pas un changement de Leboncoin** : 63 relevés Leboncoin verts le 28/10 et 38 le 29/10, par la même adresse.
  Chez annehelene.reve et nadegemarcelin78, CHAQUE échec depuis le 28/10 porte deux fois « jeton non renouvelé
  (session_fermee) » — écrit seulement quand l'onglet de travail a été VU sur auth.leboncoin.fr — et leurs relevés de
  ventes Leboncoin sont en « jeton_absent » depuis le 28/10 (veille des commandes de Nadège : 119 requêtes le 27/10, 0 le
  28/10). Leur session Leboncoin s'est bien fermée.
- **Le message était faux à cause d'une course dans l'extension** : l'adresse est relue 1,5 à 3 s après le chargement
  (encore « Mes annonces ») ; le renvoi vers la connexion arrive PENDANT la lecture (attente du compteur, 5 s) ; le
  document est remplacé, la lecture rend un résultat VIDE, compté comme « liste rendue » → « …couverture inconnue ».
  Même cause chez le poste de Nico (« page de connexion » quand le renvoi tombait avant, « n'a pas rendu sa liste » après).
  Le correctif 0.6.153 ne jouait pas (il exigeait `surLaListe === false`) : poste de Nico à 15:22 en 0.6.153, même message.
- **Correctif (0.6.154, `background.js`)** : un résultat vide n'est jamais « liste rendue » ; l'adresse est relue toutes les
  500 ms pendant 5 s ; la porte de connexion n'est retenue que vue DEUX fois à plus d'1 s d'écart (renouvellement du jeton
  et après la lecture) — jamais « Connecte-toi » sur un passage éclair ; la page quittée et son état s'ajoutent au libellé,
  qui reste mot pour mot (lu par le serveur). Vinted non touché. Selftest `lbc-jeton-releve` (exécution réelle, 57 ✓).
- **Garde-fous** : « Connecte-toi » seulement sur la porte vue (finReleve) ; un relevé incomplet ne date rien « disparu »
  (`releve_preuve_absence` relu en prod : 0 `disparu_le` depuis le 27/10 chez Anne, Nadège et Nico).
- **Preuve réelle, poste de Nico déconnecté, 0.6.154** (16:29) : run « absente », « session leboncoin : page de connexion
  (« Mes annonces » a renvoyé vers la connexion après son chargement [auth.leboncoin.fr/api/authorizer/v2/authorize]) »
  — même poste, même session, 15:22 en 0.6.153 : « failed … couverture inconnue ».
- **Relevé complet après ta reconnexion** (17:01, 0.6.154) : « done », **16 annonces lues sur 16 annoncées**, par l'adresse.
- RESTE (geste des personnes) : Anne et Nadège se reconnectent à Leboncoin dans le Chrome de l'extension (aucun mail envoyé).

## 7. Ce qui restait ouvert
- **thecloset72000, critères Vêtements Leboncoin** — CLOS : dépôt réel sur ton compte (0.6.154, qui porte l'attente des
  critères de la 0.6.153), même forme que ses jeans (Mode > Vêtements, Femme, 40 - L, Lee, Bon état, Bleu / Ciel, Coton,
  poids, transporteurs), 999 € → **3297725351 en ligne à 17:04** (page relue : Univers Femme, Taille 40 - L, Marque Lee,
  État Bon état, Type de vêtement Jeans, Couleur Bleu / Ciel), retirée (job 525f8feb « deleted »).
- **thecloset72000, Depop, Teddy Smith rouge** — CLOS, pas un doublon de FillSell : relu à la source (boutique
  the_closet72, 5 annonces) : UNE seule annonce en ligne (the_closet7b-…-e4be, créée par le vendeur hors FillSell entre
  11:58 et 12:45, rattachée par le relevé sur photo identique) ; celle de FillSell (…-8253, 976442943) est en 404.
  Constat à part (lot B) : à 11:51, ses copies Beebs, Depop, eBay et Leboncoin sont parties en « Sans marque » (la fiche
  n'avait pas de marque ; la copie Vinted avait « Teddy Smith ») — 1 à 2 cas par jour et par plateforme sur 6 jours.
- **Ornella, fausse plante** — CLOS : Leboncoin public, 65 annonces de sa boutique, une seule « Fausse plante » :
  3297610825, active depuis 14:13:55.
- **Rémi, rayon par identifiant** — CLOS : publication réelle sur ton compte avec le chemin PÉRIMÉ
  « Accessoires de mode > Jewellery > Boutons de manchette » et l'identifiant 5564 → Vinted **10584642129** publiée à
  ~16:25 dans **5564** (relu par l'API Vinted : catalog_id 5564, « Pour qui ? » Hommes), retirée à 16:28 (404).
- **10 republications Vinted « menus bloom »** — 3 PARTIES (chaowx1305, revenu à 16:39 : publiées) ; RESTE 7 : abenjemaa (4)
  et labouquinerie85 (3), postes en 0.6.149 éteints depuis le 28/10 au soir. Rien d'autre ne les retient (ni pause, ni
  question) : elles repartent seules au prochain démarrage de leur Chrome (mise à jour automatique). Geste : allumer le PC.
- **Samsung de Thibault** — n'attend que la 0.6.153+ (poste en 0.6.152, vu à 16:13). Trouvé : son 2e poste est en 0.6.149 ;
  la relance n'épinglait pas le build, ce vieux poste aurait pu reprendre le job et perdre la relance unique. **Correctif** :
  toute relance « au build qui corrige » pose `build_min_requis` (handler-watch **v146** ; `recreation-bloquee.js`,
  `relance-apres-maj.js`). RESTE : la mise à jour automatique de son poste.

## 8. paugues.contact (Pro) : « Valider et payer » sous 50 annonces — CLOS (cause Leboncoin ; notre faute corrigée)
- **Cause réelle : son compte Leboncoin est un compte PRO**, et Leboncoin fait payer les dépôts d'un pro hors forfait.
  Preuve : Leboncoin lui-même répond `account.type = "business"` à chaque lecture de ses ventes par l'extension depuis le
  21/10 (usage_logs `releve_ventes`, motif `compte_non_individual_business`, encore le 29/10 à 13:40) ; owner.type « pro » sur
  son annonce (16/10) ; champs pro sur ses annonces ; 5 photos gratuites (défaut d'un pro). Aide Leboncoin « Combien coûte le
  ⚠ **Rectifié le 29/10 soir (lot B partie 3, `docs/enquetes/lot-b-2910/RAPPORT.md`)** : la preuve tient, mais elle se
  date du **19/10 19:39** (6 lignes usage_logs `releve_ventes` du 19/10 19:39 au 29/10 13:40, déclencheur `cron`), lue par
  l'extension de SON Chrome (poste unique b2101271…) avec le jeton Leboncoin de sa session (`background.js`, GET
  `api/account/v2/members/me/account`, motif = `compte_non_individual_${account.type}`). « owner.type pro sur son annonce
  (16/10) » n'a AUCUNE trace en base et la page publique n'est pas relisible d'ici (403 anti-robot) : NON PROUVÉ, retiré.
  dépôt d'une annonce ? » : pour un professionnel, le dépôt est payant en Maison, Loisirs, Multimédia… (gratuit pour un
  particulier hors Véhicules et Immobilier). Le mur est venu après **51 dépôts acceptés** du 15/10 au 27/10 (37 en Maison >
  Décoration, 5 en Loisirs > Antiquités) : premier mur le 26/10 à 20:38, puis 27/10 17:24 / 17:32 / 17:35 et 29/10 13:10 ; il
  ne s'est levé ni en 2 jours ni quand elle a retiré 7 annonces. Elle a raison : jamais 50 annonces EN LIGNE (44 → 40) — ce
  qui compte chez Leboncoin, ce sont les dépôts, pas les annonces en ligne.
- **Écartés** : rayon mal choisi (mêmes rayon et champs que ses dépôts réussis ; le mur touche aussi Antiquités) ; option
  payante cochée (le code ne clique jamais une option : seul le bouton gratuit, et jamais un libellé « payer » ou un prix) ;
  bouton gratuit invisible (5 boutons relevés au mur, aucun gratuit ; le même code l'a trouvé 49 fois avant).
- **Preuve réelle (ton compte, particulier)** : même rayon Maison & Jardin > Décoration, mêmes critères (Tableau et toile,
  Décoration murale, Très bon état, 500 g à 1 kg), 999 € → **dépôt GRATUIT accepté, 3297735492 en ligne à 17:18** (owner
  « private »), retiré ensuite (job 3bf1096c).
- **Notre faute, corrigée pour tout le parc** : FillSell ne prouvait le compte pro que par les champs du formulaire pro,
  absents de ses rayons → elle était traitée en particulier : message « aucune option gratuite… », et chaque relance laissait
  un dépôt impayé de plus chez Leboncoin (3296042567, 3296540613, 3297572371, jamais en ligne). Désormais le TYPE du compte
  dit par Leboncoin prouve le pro : serveur (`comptesLbcProParType`, get-pending-jobs : compte_pro servi à l'extension et
  retenue au mur ; handler-watch : carte « ton forfait pro » et éclaireur), extension 0.6.155 (type lu au mur, noté
  `lbc_depot.type_compte`). Au prochain mur : circuit pro du 18/10 — FillSell prépare le dépôt jusqu'à « Valider et
  payer », l'onglet reste à elle, aucune relance ; message : « Ton annonce est prête sur Leboncoin… clique « Valider et
  payer » (ton compte pro est hors forfait, Leboncoin fait payer ce dépôt). FillSell ne paie jamais à ta place. » ; carte de
  l'app : « Ton compte Leboncoin est un compte pro : hors forfait, Leboncoin fait payer chaque nouvelle annonce… ».
  Selftest `lbc-forfait-pro`. Rien payé, rien coché, aucune donnée de son compte modifiée, aucun mail.
- Pour lui écrire (si tu le décides) : « Ton compte Leboncoin est un compte professionnel. Pour un pro, Leboncoin fait payer
  le dépôt hors forfait (Maison, Loisirs…) : il compte les dépôts, pas les annonces en ligne — en retirer ne rouvre pas le
  gratuit. Ton espace pro Leboncoin dit ce qu'il te reste. FillSell ne paie jamais à ta place. » (le chiffre « 50 » n'est
  écrit dans aucune page officielle de Leboncoin : ne pas le lui annoncer comme un fait).

## Livraison
- Commits (un push) : `345ec4f` (correctifs), `aae6b7b` (EXTENSION_LAST_COMMIT 0.6.154), `ce4397d` (0.6.153 servie),
  `af65373` + `d6f3c9d` (eBay), `bd92047` (2.9.133), `caed134` (captures du site), `5abc9dd` (point 8, 0.6.155),
  `66b269e` (EXTENSION_LAST_COMMIT 0.6.155), `8865c84` (vidéo et image de partage), `0c4a65c` (docs), `35000e3` (2.9.134), docs.
- **Extension 0.6.155 PRÊTE** (contient toute la 0.6.154) :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.155-A-TELEVERSER\fillsell-extension-0.6.155-0c4a65c-cws.zip` (seul dans son dossier ;
  BUILD_ID `2026-10-29T16:50:51Z+0c4a65c` ; 585 655 octets ; sha256 `7f39ec6915791070eeba13968d463b4e340489600e230e79af86e996ab17da40`).
  0.6.154, jamais téléversée, rangée dans `build/CWS-PERIMES/JAMAIS-TELEVERSEE-REMPLACEE-PAR-0.6.155-CWS-0.6.154/` ; 0.6.153 SERVIE
  (9 comptes) → ALREADY_PUBLISHED, zip rangé dans `build/anciens-zips/PUBLIEE-SERVIE-2910-CWS-0.6.153/`. EXTENSION_MIN_BUILD non
  touché. Poste de Nico : 0.6.154 posée à 16:15 (reprise seule à 16:19), puis 0.6.155 posée à 17:52 (sauvegardes dans
  `build/anciennes-extensions-nico/`).
- **OTA 2.9.133** (canal relu 2.9.132 → 2.9.133, build `2026-10-29T15:29:41Z+bd92047`) puis **2.9.134** (canal relu 2.9.133 →
  2.9.134, build `2026-10-29T16:52:36Z+35000e3` : la preuve du compte pro dans l'app).
- **Fonctions** (version et verify_jwt lus avant/après) : ebay-account v19 → **v22** (true) ; email-tunnel v74 → **v75** (false) ;
  handler-watch v145 → v146 → **v147** (false) ; get-pending-jobs v300 → **v301** (true).
- Aucune migration, aucune réparation de données, aucun mail. Tests réels sur le compte de Nico seulement (999 €), tous
  retirés (eBay 820292123879, Vinted 10584642129, Leboncoin 3297725351 et 3297735492 : 410) ; sa file remise en pause à 17:22.
  Les fiches de test restent dans son stock (à supprimer d'un geste dans l'app s'il le veut).
- Suite complète : **486 selftests verts** sur l'arbre final (une première passe coupée par le manque de mémoire du PC,
  relancée sur ton accord) ; `build:essai` vert ; lint sans erreur nouvelle sur les fichiers touchés.
