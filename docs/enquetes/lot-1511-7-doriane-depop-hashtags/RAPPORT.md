# 15/11/2026 soir — Doriane (af37fa49) : la republication coincée ne bloque plus rien ; Depop : 5 hashtags au plus

Ordre de Nico (15/11, ≈ 19:30) : (1) la republication Beebs 3382b821 de Doriane, arrêtée à « retirée » depuis le 11/11
16:51, gelait sa copie Cloud en 0.6.189 et retenait ses republications Leboncoin et Vinted — corriger à la racine (a) mise
à jour jamais bloquée indéfiniment, (b) annonce hors ligne dite et remise en ligne seule à la connexion, (c) les autres
plateformes jamais retenues sauf garde volontaire ; (2) Depop « Trop de hashtags (13, 5 au plus) » chez sebastien64310 —
s'adapter à la règle de Depop. Heure de Paris partout. Rien touché au compte Beebs de Doriane, aucun mail, aucun push.

## 1. Doriane — fait, à la racine, serveur seul (aucune extension : PAS de 0.6.192)
Règle : `_shared/recreation-attend-connexion.js` (+ `retenue-hors-ligne.js` règle 5, `get-pending-jobs`, `handler-watch`).
- **(a) La mise à jour n'attend jamais indéfiniment.** `get-pending-jobs` rend dans `retenues_deleted` toute republication
  `pending` à `deleted` que ce poll ne sert pas à ce poste, ou retirée depuis plus de 2 h. Les extensions servies (≥ 0.6.153,
  PC et Cloud) ne la comptent plus « en jeu » et rechargent sous leur verrou de flux ; le job reprend à son étape. Un job
  `processing` diffère toujours la mise à jour (règle du 12/08).
  **Preuve** : gpj v378 a rendu 3382b821 dans `retenues_deleted` à 20:50:22 ; `usage_logs maj_extension` à **20:50:24** :
  copie Cloud **0.6.189.45717 → 0.6.191.45898** (« rechargement:fin de cycle », build `2026-11-15T17:45:58Z+9fdb844-cloud`) —
  après 3 reports tracés (18:46, 19:47, 20:48). Le job n'a pas bougé (toujours à `deleted`, recréation intacte).
- **(b) L'annonce hors ligne est dite et reviendra seule.** `handler-watch` (3 min) : compte au Cloud actif, plateforme du
  Cloud non connectée au coffre, retirée depuis 30 min → `needs_user`, source `recreation_attend_connexion`. Levée
  automatique (retour en file à l'étape `deleted`, donc recréation, jamais un nouveau retrait) dès que la plateforme est
  connectée au Cloud ou que le Cloud n'est plus actif.
  **Preuve** : 3382b821 passé à **20:51:04** : « Connexion Beebs requise : ton annonce « Bottines Nike enfant 25 noir » est
  hors ligne sur Beebs depuis le 11/11 (retirée pour être republiée), et Beebs n'est pas connecté à FillSell Cloud. Connecte
  Beebs dans l'app (« Me connecter ») : elle sera remise en ligne toute seule, avec ses photos, son titre et sa description.
  Rien n'est perdu. » — l'app la range dans « À régler » (`causeARegler` = completer) avec le bouton « Me connecter » du
  Cloud (même ancre que `MUR_CONNEXION_ANCRE`), vérifié par le verrou.
- **(c) Les autres plateformes du même article ne sont plus retenues.** Une annonce qui attend une connexion (cette source,
  et elle seule) retient SA plateforme, jamais le même article ailleurs.
  **Preuve** (20:53:47, premier passage du poste Cloud après la pose) : Vinted **20a1d4d2** libérée (« En file : ta
  republication passera à son tour… ») et **publiée à 20:58:34** par le Cloud (https://www.vinted.fr/items/10830151446-bottines-nike-enfant-pointure-25-noir) ; Leboncoin **0ff8f06e**
  libérée de la Beebs — elle attend seulement 3b218e58 (« Établi Smoby… »), une AUTRE republication Leboncoin du compte
  en cours de remise en ligne (garde ci-dessous, quelques minutes) ; à 21:03 : « En file », plus aucune retenue.
- **Gardes volontaires gardées, et pourquoi** : « une seule annonce hors ligne par plateforme » (05/11) — un compte n'a
  jamais deux annonces retirées en même temps sur une plateforme ; ses 16 autres republications Beebs restent derrière
  3382b821 (et Beebs n'étant pas connecté, elles ne pourraient pas partir) ; à la connexion, 3382b821 est recréée la
  première. La règle 4 (« jamais le même article hors ligne sur deux plateformes ») tient pour toute remise en ligne EN
  COURS — seule l'attente d'un geste de la personne en est sortie.
- **Faux positif évité avant la prod** : 7cecc29c (autre compte, PC) porte une marque `attente_session` du 11/11 sur une
  republication en REPRISE après interruption ; une première version de la règle (attente de session ≥ 30 min) l'aurait
  crue « en attente de connexion » et aurait libéré le même article sur Beebs. Règle resserrée à la source posée par le
  serveur (verrou : cas 7cecc29c).
- Verrou **`selftest:republication-attend-connexion`** (52) : rouge sur le code d'avant (module absent : 1 rouge ; module
  seul sans câblage : 11 rouges), vert après.
- Reste pour Doriane : connecter Beebs à son Cloud (code Kiabi). Rien d'autre à faire : 3382b821 repartira seule.

## 2. Depop, trop de hashtags — fait, serveur seul (aucune extension)
- Cause : le pré-vol du connecteur (`content-scripts/depop.js`, MAX_HASHTAGS = 5) refuse au-delà de 5 ; la description du
  job portait les 13 hashtags de la copie Vinted. Sur une REPUBLICATION, ce pré-vol tourne à la recréation, APRÈS le
  retrait : l'annonce serait restée hors ligne.
- Règle (`_shared/description-depop.ts`, appliquée par `get-pending-jobs` au texte SERVI, publications et republications,
  PC et Cloud) : les 5 plus spécifiques restent (même classement que Leboncoin : marque, mots du titre, génériques en
  dernier ; ordre d'écriture à égalité), le reste du texte à l'octet ; le job en base n'est pas modifié.
  Classement RECOPIÉ (le fichier Leboncoin est verrouillé par son empreinte, `selftest:lbc-relance-identique`, rouge
  pendant la suite sur une première version qui le modifiait — rendu à l'octet) ; le verrou vérifie que les deux rendent
  les mêmes hashtags.
- Autre plateforme à plafond : **Leboncoin (5)**, plafonné au même endroit depuis le 10/09 (inchangé). Vinted : sans
  limite ; Beebs, eBay, Opla : aucune.
- Verrou **`selftest:depop-hashtags-plafond`** (29) : 13 hashtags → 5, le pré-vol RÉEL du connecteur (relu dans son
  source) l'accepte ; rouge avant (2), vert après.
- **Essai réel (compte de Nico, au Cloud)** : republication Depop de la cobaye « Sweat Tommy Jeans bleu marine – Taille
  M » (fiche 1793009407689011), copie portée à 9 hashtags → job **b71014fc** ; servi à 20:51:37 « 9 hashtags → 5 (retirés :
  #Streetwear #Vintage #Mode #PullHomme) — reste du texte intact » ; ancienne annonce retirée 20:53:55 ; **publiée à 20:59:53** (Cloud 0.6.191.45898) :
  **https://www.depop.com/products/nelsonczatnoir-je-vends-un-sweat-tommy-97c4/** — page publique relue à 21:03 : 8 €,
  texte intact, exactement 5 hashtags (#TommyJeans #TommyHilfiger #SweatHomme #TailleM #BleuMarine). Avant ce correctif,
  la même republication aurait retiré l'annonce puis buté au pré-vol de la recréation (annonce hors ligne).
- **sebastien64310, job 950ee139** : déjà relancé depuis l'app à 19:40 (2e relance manuelle), en file ; je n'y ai pas
  touché. Son ordinateur (extension 0.6.186) n'est pas vu depuis 18:00 : il partira à son prochain passage, avec le texte
  servi à 5 hashtags (#bettybarclay #jupeplissee #90s #leopard #baroque). Relu à 21:03 : toujours `pending`, son poste n'est pas revenu — le lien Depop viendra à son
  prochain passage (à relire, état de prod).
- Seul job du parc arrêté sur ce motif : celui-là (relu en base).

## Livraison
- Commit b17ae06 (code + verrous) ; `get-pending-jobs` **377 → 378** (verify_jwt true, 20:50:03), `handler-watch`
  **207 → 208** (verify_jwt false, 20:50:10), relus avant et après ; aucune dépendance commitée non déployée embarquée.
- Coût de la nouvelle passe de handler-watch (3 min) mesuré en base : 23,7 ms + 5,9 ms (EXPLAIN ANALYZE), pour un passage
  d'environ 10 s. get-pending-jobs : une lecture de 20 lignes au plus, seulement si le compte a des republications en attente.
- Suite complète **800/800** (20:20 → 20:49, par morceaux après une coupure pour mémoire basse) ; 25 selftests voisins
  verts ; lint propre ; typage : aucune erreur nouvelle.
- Aucune migration, aucune extension (le zip 0.6.191 reste le bon), ni web ni OTA, aucun mail, aucun push. Données écrites
  par moi : la republication d'essai b71014fc (compte de Nico). Jobs clients touchés : seulement par la règle, en prod
  (3382b821, et les retenues levées de son compte).
