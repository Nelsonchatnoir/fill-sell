# Chantier « zéro friction » — 18/10/2026 (une passe, 14:35 → fin de soirée, heure de Paris)

## Résumé (à lire en premier)

- **La mesure existait déjà** : `champ_requis_bloquant` nomme le champ depuis le 10/10 (plateforme, catégorie, champ,
  article) — aucun « ? ». Les ≈ 1 000 lignes de la semaine sont TOUTES les lignes (affichée, complétée, abandonnée…) :
  **490 questions affichées**, dont **356 vraies** (levées par la personne ou abandonnées). Ajouté : qui a levé la
  question (`par` : personne / moteur), en combien de secondes, le nom technique du champ, et un bilan SQL
  (`questions_publication_bilan`).
- **Questions affichées, semaine du 11/10 15:00 au 18/10 15:00, rejouées avec les règles d'aujourd'hui** :

  | Plateforme | Affichées avant | Vraies avant | Après (aujourd'hui) | Après bascule des leviers | Facteur (affichées) |
  |---|---|---|---|---|---|
  | Beebs | 151 | 120 | **13** | ≈ 12 | **÷ 11** |
  | Leboncoin | 165 | 91 | **25** | ≈ 17 | **÷ 6,6** (÷ 9,7 après bascule) |
  | eBay | 156 | 139 | **41** | ≈ 40 | **÷ 3,8** — cible ÷ 5 **non atteinte** |
  | Vinted | 18 | 6 | **6** | 6 | ÷ 3 — cible **non atteinte** (6 questions, dont 4 ISBN illisibles) |

- **Trois causes de fond trouvées et corrigées pour tout le parc** : (1) eBay demandait les dimensions au nom de la
  catégorie de l'ICÔNE alors que l'article partait dans une autre : **39 des 42 décorations murales interrogées sur
  Longueur / Largeur / Hauteur ne les exigeaient pas** (105 vraies questions → 7) ; (2) la taille Beebs d'une tranche
  Vinted (« 3-6 mois ») ignorait le titre du vendeur (« Pyjama 3 mois ») — 11 tailles sur 69 différentes du choix de la
  personne → 5 ; (3) sur eBay, l'option que le texte nomme n'était cherchée que dans les listes fermées : « Longueur de la
  robe » 7 justes sur 8 par le texte contre 0 sur 2 par l'IA.
- **Banc d'essai IA construit** : 1 134 cas, 62 comptes + 571 vraies annonces eBay France, vérité = la valeur choisie par
  un humain et acceptée en ligne ; 3,46 $ dépensés. **Aucun levier ne bat l'existant partout.** Branchés en CASCADE (après
  l'existant, sur les seuls champs qu'il laisse vides), nés « fantôme » avec bascule et retour arrière automatiques :
  Leboncoin Produit / Support / Univers (Haiku 5.5, texte), Beebs Âge (lecture des photos). Restent sur l'ancien chemin
  (en recul au banc) : paires Maison & Jardin, Genre des livres, aspects eBay par l'IA, photo directe, Sonnet.
- **Coût IA par article** : existant ≈ 0,0104 $ ; ajout ≤ 0,0006 $ dans le pire cas (≈ + 6 %, plafond 1,5×) ; dépense
  mensuelle projetée inchangée (≈ 96 $ en octobre, + < 1 $). Plafonds codés du matin inchangés ; aucune passe sur le stock.
- **A** (éveil) : le serveur compte toute la file du poste depuis 15:23 (tout le parc) ; le plafond de 4 h disparaît avec
  la **0.6.127**. **B** (vente Beebs déclarée → « Beebs ») : en prod à 15:13, essai à blanc 7/7. **C** : Louis a pris ses
  bordereaux lui-même à 11:30 — la relance ne fera rien (trois verrous relus) ; aucun des 3 critères de la bêta n'est
  rempli (le n° 1 est réécrit) ; hu.anastasia : son Edge n'a pas repris depuis 10:13.
- **Zip à téléverser APRÈS l'acceptation de la 0.6.126** : `build\CWS-0.6.127-A-TELEVERSER\fillsell-extension-0.6.127-e7d0714-cws.zip` (seule la version change au manifeste).

---

## 1. Mesure

- **Ce que dit la télémétrie** (`usage_logs` `champ_requis_bloquant`, 11/10 15:00 → 18/10 15:00) : 490 lignes « affiche »
  (une ligne = une question montrée), 356 levées par la personne (complétées ≥ 20 s après l'affichage) ou abandonnées,
  110 levées par le moteur en moins de 20 s (l'IA arrivée après l'affichage — artefact corrigé le 17/10 au soir : une
  ligne n'est plus ouverte pendant qu'une IA est en vol).
- **Les champs qui font 80 % des questions affichées** (398 / 490) : Beebs Taille 127, Leboncoin Univers 95, Leboncoin
  Produit 47, eBay Longueur 42 + Largeur 38 + Hauteur 32, Beebs Âge 17.
- **Ajouté** (web de ce soir) : `champ_cle`, `affiche_le` ; sur « complete » / « retiree » : `par` (personne = un geste
  dans le bloc de questions ou une réponse notée ; moteur = sinon) et `delai_s`. Bilan : `questions_publication_bilan
  (debut, fin)` (migration 20261018160000) — la mesure « après » sur le vrai trafic se relit avec lui (vers le 25/10).
- **Comment « après » est calculé** : chaque vraie question de la semaine est rejouée avec les règles d'aujourd'hui
  (`childSizes`, `universLbcDeLaFiche`, catégorie eBay qui part, regroupement des dimensions) sur la fiche de l'article
  telle qu'elle était avant la réponse ; « après bascule » applique en plus les taux de la cascade mesurés au banc.

## 2. Champ par champ : la source qui le devine, la qualité, pourquoi une question reste

| Champ | Vraies avant → après | Source maintenant | Qualité (banc / rejeu) | Pourquoi une question reste |
|---|---|---|---|---|
| Beebs · Taille | 114 → 7 | taille de la fiche traduite par la table (17/10) ; **tranche Vinted tranchée par le texte du vendeur** (18/10) | rejeu : 67 égales au choix de la personne, 5 différentes (titres « 12-18 mois » : vraie ambiguïté, parc 11 « 18 mois » / 7 « 12 mois »), 41 sans annonce publiée | taille absente ou hors grille (« Taille unique », « EU 40 » sur une grille enfant, tour de tête d'un bonnet) |
| Leboncoin · Univers | 71 → 5 | la fiche (genre, racine Vinted, taille enfant, titre — 12/10) ; IA ; cascade L1 hors Maison & Jardin (fantôme) | rejeu Mode 53/55 ; IA existante 151 justes / 6 faux sur 159 | objets hors Mode sans signal (Décoration) |
| Leboncoin · Produit | 16 → 16 (≈ 8 après bascule) | IA seconde passe (existant) ; **cascade L1 Haiku 5.5** sur ses vides (fantôme) | existant 103 j / 21 f sur 144 ; cascade 10 j / 1 f sur 20 vides | objet que la liste Leboncoin ne nomme pas |
| Leboncoin · Univers et produit (Maison & Jardin) | (dans Univers / Produit) | IA paire (existant) | existant 88 j / 45 f sur 152 ; **tous les leviers en recul** | vraie ambiguïté (« Bibelot » / « Sculpture » / « Objet décoratif ») |
| eBay · Dimensions | 105 → 7 | **la catégorie qui partira** (pré-calcul) au lieu de l'icône ; **une seule question** « Dimensions » | 39 / 42 articles partis dans une catégorie sans dimension exigée (Taxonomy relue le 18/10) | la mesure n'existe nulle part (texte, photos, autres annonces : 3 / 46 seulement) |
| Beebs · Âge | 5 → 5 (≈ 4) | âge de la fiche (relevé Beebs), PEGI écrit (jeux), IA ; **cascade L4 lecture des photos** (fantôme) | existant 13 j / 3 f sur 46 (30 vides) ; L4 4 j / 0 f sur les vides | âge écrit nulle part (livres, DVD) |
| eBay · Longueur de la robe, Style, Type, Plateforme, Matière de la couche extérieure | 13 → ≈ 12 | **l'option que le texte nomme, AVANT l'IA** | robe 7/8 (IA 0/2) ; Plateforme +1 j −1 f ; Style, Type à égalité ; couche ext. +1 | longueur, style non écrits |
| eBay · autres (Matière, Taille, spécifications d'appareils) | ≈ 21 → 21 | IA existante | banc : aucun levier meilleur (Matière : photo 7/12, trop faible) | caractéristique absente du texte et des photos |
| Vinted · ISBN | 4 → 4 | texte puis photos (resolve_isbn, existant) | — | ISBN illisible ou absent (livre ancien) |

## 3. Banc d'essai IA (`scripts/bancs/zero-friction/banc-ia.mjs`, résultats `banc-ia.json`)

- **Vérité** : (1) annonces Leboncoin et Beebs **créées par les vendeurs eux-mêmes** et relevées par FillSell (489 cas,
  61 comptes) ; (2) réponses des personnes à nos questions, 45 jours (74 cas) ; (3) **571 vraies annonces eBay France
  d'occasion** (API Browse officielle, 8 catégories des questions eBay du mois) — la valeur choisie par le vendeur.
  Contexte donné à l'IA : titre, description, marque, taille, genre, catégorie, attributs lus — jamais la réponse.
- **Leviers** : L0 existant (Haiku 4.5, texte, liste ≤ 120) · L1 Haiku 5.5 texte, liste entière · L2 L1 + photos ·
  L3 Sonnet 5.5 texte + photos (seulement où L2 n'a rien rendu) · L4 lecture des photos (« Lens étoffé ») versée au
  contexte puis L1 · R règle du texte (sans IA).
- **Lecture** (juste / rendu) : Leboncoin Univers L0 151/157, L4 155/156 ; paires L0 88/133, L1 87/138, L2 82/137 ;
  Produit L0 103/124, L1 106/133 ; Beebs Âge L0 13/16, L2 16/25, L4 10/11 ; eBay Style L0 119/198, R 68/78 ; Type L0
  68/80, R 48/50 ; Longueur de la robe L0 0/2, R 7/8 ; Matière L0 2/13, R 9/9, L2 7/12 ; Capacité L0 24/34, L1 28/33 ;
  Plateforme L0 24/39, R 13/17 ; L3 (Sonnet) 4/10 sur les paires, 0,0107 $ le cas — jamais branché.
- **Règle de branchement** (écrite avant de lire les chiffres) : un levier n'est branché sur un champ que s'il fait
  aussi bien ou mieux que l'existant — soit en remplaçant (plus de justes ET pas plus de faux), soit en cascade sur les
  vides de l'existant (précision ≥ celle de l'existant sur ce champ). Un champ en recul reste sur l'ancien chemin.
  Résultat : aucun remplacement ; cascade sur 4 champs ; règle du texte avant l'IA sur 5 aspects eBay.
- **Coût du banc** : 3,46 $ (L0 1,27 · L1 0,13 · L2 0,44 · L4 0,54 · L3 1,07) ; API Browse gratuite.
- **Trou corrigé en passant** (levier L1) : la liste fermée envoyée à l'IA est bornée à 120 entrées ; Bricolage
  Leboncoin a 147 paires « Type › Produit » — les 27 dernières n'étaient jamais proposées. La cascade envoie la liste
  entière ; l'existant n'est pas touché (pas de gain mesuré sur les paires).

## 4. En prod : fantôme, bascule et retour arrière automatiques

- **Table `ia_leviers_bascule`** (migration `20261018160000`, appliquée ≈ 15:20) : Leboncoin Produit / Support / Univers →
  L1, Beebs Âge → L4, toutes « fantome ». `generate-listing` **v119** (15:23) : après l'existant, sur les seuls champs
  vides, le levier tourne ; « fantome » = noté (`usage_logs ia_levier`), jamais posé ; « actif » = posé (une entrée de
  la liste). Niveau « moteur » du plafond IA ; client d'avant (sans `plateforme`) = chemin d'hier.
- **Critères (dans le code de la migration)** : fantôme → actif quand ≥ 48 h, ≥ 15 cas jugés (réponse du levier puis
  annonce publiée du même article avec ce champ) et précision ≥ celle de l'existant au banc (Produit 0,83, Support 1,00,
  Univers 0,96, Âge 0,81). Actif → coupé quand < 95 % des valeurs posées sont gardées jusqu'à l'annonce (≥ 10 en 72 h) ou
  quand les refus de la plateforme dépassent de 15 points la semaine d'avant. Cron `ia-leviers-6h` (`47 */6`), chaque
  bascule écrite (`ia_levier_bascule`). Couper à la main : `update ia_leviers_bascule set etat='eteint'`.
- **Première bascule possible** : 20/10 vers 16:00, si le trafic donne 15 cas par champ (Support et Univers en auront
  peu : ils resteront fantômes tant que la preuve manque — c'est voulu).

## 5. Oranges (needs_user)

| Type (comptes actifs 7 j, 18/10 15:00) | Avant | Après (16:00) |
|---|---|---|
| **Vrais gestes** (Leboncoin pro « Valider et payer » 23, nom / prénom Leboncoin 13, Depop finir le compte vendeur 12, Vinted anti-robot 8, Depop autoriser 5, eBay relier / mise à niveau / pas encore vendeur / site étranger 12, connexions 5, boutique Vinted à ouvrir 1, doute « déjà remise en ligne ? » 1, eBay retours refusés 1) | ≈ 82 | ≈ 82 + 1 (b67c3bfb réduit au seul poids, inconnu) |
| Attentes automatiques (grises, « En pause ») | 12 | 12 |
| **Pas des gestes** | **6** | **2** |
| · Leboncoin 9e1fc76b — « Type d'article neuf » déjà répondu par le compte + poids répondu « pour le lot » | 1 | **0 — repartie 15:57** |
| · Leboncoin 233e165d — Produit et poids déjà sur le job | 1 | **0 — reprise une fois, 15:57** |
| · Leboncoin b67c3bfb — « Type d'article neuf » né d'un état neuf DÉDUIT (état choisi « Très bon état ») | 1 | question réduite au poids (vrai geste : aucune source) |
| · Depop f441eebf — « Enfant XL / S Homme » : rayon demandé alors que la catégorie Vinted dit « Hommes » | 1 | **0 — rayon menswear/tops/tshirts, repartie 15:57** |
| · Leboncoin b1b9bb68 — poids sur le job, non posé par l'extension (formulaire pro) | 1 | 1 (voir ci-dessous) |
| · Vinted 5d993767 — titre refusé « trop de symboles d'affilée » | 1 | 1 (décision de Nico) |

- **Règles** (handler-watch **v119**, 15:54, pour tout le parc) : `questions-tranchees.ts` § 6 — un champ Leboncoin demandé que
  FillSell connaît est posé (valeur déjà sur le job, réponse du compte à « Type d'article neuf », poids répondu « pour le
  lot » — `poids_lbc_du_lot` d'un frère) ; « Type d'article neuf » né d'un état neuf déduit alors que l'état choisi ne l'est
  pas tombe (l'état déduit est recalculé) ; jamais une valeur hors de la liste ; une passe par job. `depop-rayon.js` : un
  texte « enfant ET adulte » suit la catégorie d'ORIGINE quand elle nomme un seul rayon ; les questions d'avant la règle
  sont rejugées une fois. Selftest `zero-friction-oranges` (18 contrôles, cas réels).
- **Restent, et pourquoi** : b1b9bb68 — défaut de l'extension sur le formulaire PRO de Leboncoin (la sonde des critères
  attend 4 s ; rien vu → tout le remplissage saute, la seconde passe aussi, seul l'état est reposé au verdict) : correctif
  écrit (reposer au verdict chaque champ dont le job porte la valeur), **non livré** — il ne se prouve que sur un compte
  Leboncoin PRO, et les essais réels ne sont permis que sur les comptes de Nico et d'Ornella. 5d993767 — la règle exacte de
  Vinted n'est pas connue (« – » seul passe 4 430 fois, « — » jamais) et le texte du vendeur fait foi : à Nico de choisir
  entre une proposition en un geste (mêmes mots, symboles simplifiés sur la seule copie Vinted) et une reprise automatique
  unique (précédent : le texte nettoyé de Leboncoin).
- **À noter** : la réponse « 1 » au poids de 233e165d (6 cuillères) a été lue comme 1 g → « Jusqu'à 100 g ». C'est la
  réponse de la personne, gardée ; un nombre nu sous 10 mériterait la question « g ou kg ? » (non fait).

## 6. Points A, B, C

- **A — éveil du PC** : `get-pending-jobs` **v261** (15:23) compte pour l'éveil TOUT job en attente de ce poste
  (créneau lointain, limite du jour, pause anti-robot) et exclut les jobs d'un autre poste — servi à tout le parc par le
  champ que toutes les versions lisent. Extension **0.6.127** : plus de plafond de 4 h ; relâche quand la file est vide,
  sans session, ou après 2 h sans un seul poll réussi ; un job en cours et une publication du popup demandent l'éveil.
  Constat avant : 7 « relache_plafond » entre 13:00 et 15:34 (155 jobs encore en file) — elles s'arrêteront avec la
  0.6.127. Selftest `eveil-file` (14 contrôles, l'extension chargée en vrai dans un vm).
- **B — vente Beebs déclarée** : migration `20261018150000` (15:13), `enregistrer_vente_atomique` réécrite depuis la prod
  (md5 cf93c3b6 → 40cbf2ce), une ligne : un job Beebs sans preuve garde « Beebs ». Essai à blanc sur le compte de Nico
  (ROLLBACK) : Beebs → beebs / Beebs / fiche Beebs ; Leboncoin et eBay sans preuve → « ailleurs » ; 0 mail, 0 note à
  envoyer ; l'inverse rend le md5 d'avant. Choix : une preuve « vendu » arrivée plus tard sur une autre copie montrera
  « Déjà enregistrée » au lieu de se fermer en silence (comme une vente Beebs saisie depuis le Stock).
- **C — suivi** :
  - **Louis** : ses deux commandes Vinted (23283842931, 23305737164) sont passées en 230 « bordereau prêt » à 11:35 —
    messages Vinted « Article à emballer et envoyer » à 11:30:03 et 11:31:24 : **il a obtenu ses étiquettes lui-même**.
    La relance ne peut rien commander : la base exige un bordereau « indisponible » ou « à obtenir » (consommée sans
    relance au premier passage d'une 0.6.126), l'extension saute 200/220/230/250, et relit la transaction avant tout
    geste. Dans l'app, sa carte dit « Récupérer le bordereau » (servi à toutes les versions).
  - **Bêta bordereaux — 3 critères : aucun rempli.** (1) la relance de Louis : impossible désormais → **réécrit** :
    « une génération Vinted neuve réussie de bout en bout avec la 0.6.126 (bordereau dans l'app) » ; (2) aucune commande
    Leboncoin ni Beebs depuis le 16/10 (20 commandes, toutes Vinted) ; (3) 0 bilan `ventes_beebs_commandes` (il faut la
    0.6.126). Verdict inchangé : **NON**.
  - **hu.anastasia** : son seul poste (Edge, 0.6.124) n'a plus appelé depuis 10:13:39 ; 177 republications Vinted en
    attente, la pause anti-robot se posera à son prochain passage ; **une republication Leboncoin (7a0dc3ea) arrêtée
    entre le retrait (10:11) et la remise en ligne** : l'annonce n'est plus sur Leboncoin — elle repart au retour du
    poste. Rien ne peut se faire sans son ordinateur. meminiandmove : 3 postes en 0.6.110, sous le minimum : rien ne lui
    est servi tant que Chrome n'a pas mis l'extension à jour.
  - **Correspondances apprises** : 8 champs « fantome » depuis 12:03, 0 cas noté (le web qui les porte est servi depuis
    14:24, une seule publication Leboncoin depuis, hors règle) — première bascule possible le 20/10 après-midi.
  - **Ventes Beebs (fantôme)** : `ventes_beebs_commandes = 0`, 0 bilan (la lecture vient avec la 0.6.126).

## Livraison

- **Migrations** (appliquées, `migration repair` fait, inverses dans `supabase/rollbacks/`) : `20261018150000` (15:13),
  `20261018160000` (≈ 15:20). Essai à blanc de la première : `scripts/essais/20261018150000_essai.sql` (7/7, ROLLBACK).
- **Fonctions** (verify_jwt lus avant / après, inchangés) : get-pending-jobs v260 → **v261** (15:23, `true`) ;
  generate-listing v118 → v119 (15:23) → **v120** (16:04, même code que le commit) (`true`) ; handler-watch v118 → **v119**
  (15:54, `false`) ; ia-banc-deduction v2 → **v6** (`false`, banc seulement). ebay-api-worker **v90** non redéployé (les
  options ajoutées à `_shared/ebay-aspects-ia.ts` sont sans effet par défaut).
- **Commits** : `6c7634a` (code, docs, selftests), `e7d0714` (EXTENSION_LAST_COMMIT = 2026-10-18T14:04:00Z), puis la version
  2.9.102 de l'app.
- **Extension 0.6.127** : `build\CWS-0.6.127-A-TELEVERSER\fillsell-extension-0.6.127-e7d0714-cws.zip` (BUILD_ID
  `2026-10-18T14:04:22Z+e7d0714`, 37 entrées, 553 Ko) — seul zip de ce dossier. Le zip de la 0.6.126 est rangé dans
  `build\CWS-PERIMES\CWS-0.6.126-EN-EXAMEN-AU-CWS\`. **Manifeste relu : seule la version change** (0.6.126 → 0.6.127),
  aucune permission nouvelle, même liste de fichiers (41). **À téléverser SEULEMENT APRÈS l'acceptation de la 0.6.126.**
  Après son acceptation à elle : `ALREADY_PUBLISHED` += 0.6.127 et, si Nico le veut, `EXTENSION_MIN_BUILD =
  2026-10-18T14:04:22Z`.
- **Web et OTA** : voir le § Servi (relu après le push).
- **Selftests** : 358/358 avant (suite de référence du matin, 14d133d) → **363/363** après (deux suites complètes, la
  dernière après tous les changements) ; `build:essai` vert ; eslint : aucune erreur nouvelle (7 d'avant dans
  ListingPreviewScreen) ; harnais du stepper (deux peaux), du bloc de questions et du lot : verts.

## Servi

- **Serveur** : servi et relu (fonctions, migrations, crons — § Livraison) ; les oranges tranchés sont repartis à 15:57.
- **Web et OTA 2.9.102 : en attente.** Le push a été **refusé par l'outil** à 16:06 (premier refus, dit tout de suite à
  Nico avec la commande), puis la construction de l'OTA (`npm run build`) refusée aussi. Tant que le web n'est pas servi :
  la télémétrie « par / delai_s », la question « Dimensions », la catégorie eBay du pré-calcul, la règle du texte sur eBay,
  la tranche Vinted et l'envoi du contexte de la cascade (donc les notes « fantôme ») ne tournent pas encore chez les gens ;
  les règles serveur, elles, tournent. À relire après le push : `build.json`, entrée avec `Origin`, Vercel READY, canal
  production 2.9.102.

## Incidents

- Deux selftests rendus rouges par mes propres changements pendant la suite de référence (ancres sur le texte du code :
  `ebay-aspects-auto`, `champs-deduits`) — recalés sur la nouvelle écriture, rien en prod.
- **Push refusé par l'outil** (16:06, premier refus, signalé aussitôt à Nico avec `! git push origin main`) et construction de l'OTA refusée aussi.
- Une regex abîmée par le shell (antislash perdu) dans la fonction de banc : les « s » disparaissaient des descriptions
  eBay — vue au premier essai, corrigée avant le banc, fonction redéployée.
- `sed -i` sous Git Bash avait converti deux fichiers en fins de ligne LF — remis en CRLF (git les normalise de toute façon).

## Choix pris sans Nico

1. Une question « réelle » = levée par la personne (≥ 20 s avant le 18/10, `par` ensuite) ou abandonnée — c'est la base des
   chiffres « vraies » ; les « affichées » restent données à côté.
2. Règle de branchement des leviers : cascade seulement (jamais de remplacement de l'existant), précision ≥ l'existant.
3. Haiku 5.5 pour la cascade (10× moins cher que Haiku 4.5, sans température, réflexion coupée) ; Sonnet jamais branché.
4. Tranche Vinted : le texte du vendeur tranche ; sans texte, la table (borne haute) reste.
5. Catégorie de l'encart eBay : choix de la personne → copie → pré-calcul → icône.
6. Critère n° 1 de la bêta bordereaux réécrit (la relance de Louis ne peut plus avoir lieu).
7. Texte de la permission `power` (`Legal.jsx`) : « s'arrête dès que la file est vide, ou si l'extension ne peut plus
   joindre FillSell pendant deux heures ».
8. Vente Beebs déclarée : la carte « Déjà enregistrée » quand une autre copie prouve une vente plus tard.
9. Les nouvelles règles des oranges s'appliquent aux jobs déjà arrêtés : trois publications de trois comptes (Leboncoin ×2,
   Depop ×1) sont reparties seules à 15:57 — aucune action à la main chez eux, c'est la règle qui les relance, comme les
   règles « État » et « Marque Depop » existantes.
10. Vinted n'a pas de banc dédié : aucun champ Vinted dans les 80 % ; 6 vraies questions en 7 jours (4 ISBN illisibles, déjà
    lus sur le texte et les photos par `resolve_isbn`).
11. Lens (lens-analysis, à la prise de photo) n'est pas modifié : sa version « étoffée » (L4, lecture des photos versée au
    contexte) ne gagne qu'un champ, Beebs Âge — branchée au moment de publier, sur ce seul champ, sans toucher la capture.

## Ce qui reste à Nico

- **Maintenant (refusés à l'outil)** : `! git push origin main`, puis l'OTA : `! npm run build` et
  `! npx @capgo/cli bundle upload --channel production --bundle 2.9.102 --path dist`. Claude relit ensuite le web
  (`build.json`, entrée avec `Origin`, Vercel) et le canal production.
- Téléverser `build\CWS-0.6.127-A-TELEVERSER\fillsell-extension-0.6.127-e7d0714-cws.zip` **après** l'acceptation de la 0.6.126 (c'est déjà le zip), « Envoyer pour examen ».
- Décider : titre Vinted « trop de symboles d'affilée » (proposition en un geste, ou reprise automatique unique) ; le correctif du formulaire PRO Leboncoin ne se prouve que sur un compte pro.
- Rien d'autre : les leviers basculent seuls ; Claude relit vers le 20-25/10 (`ia_leviers_bascule.mesure`,
  `questions_publication_bilan(now()-interval '7 days')`).
