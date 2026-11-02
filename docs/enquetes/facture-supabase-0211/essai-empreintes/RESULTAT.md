# Essai à blanc — empreintes photo calculées sur l'ORIGINALE (commit 40e4bd3) contre l'ancienne méthode (render/image 400 px)

Lundi 02/11/2026, de 16:20 à 17:20 (heure de Paris). Rien n'a été écrit ni déployé en prod, aucune requête vers
`/storage/v1/render/image`, aucun fichier ajouté au dépôt. Tout est dans ce dossier.

## Verdict

**Les décisions ne sont PAS identiques.** Recalculée sur l'originale, l'empreinte d'un tiers des photos du bucket bouge
de 1 à 4 bits, et celle de 50 photos de 20 à 40 bits (orientation EXIF : render/image tournait l'image, imagescript ne
la tourne pas). Des paires passent ainsi de part et d'autre des seuils, dans les deux sens :

| décision | paires / décisions comparées | identiques | perdues (A seulement) | nouvelles (B seulement) |
|---|---|---|---|---|
| Moteur v3, passe comme le cron (mode normal) | 1 229 décisions, 838 comptes | 835 comptes à l'octet, 2 comptes à la distance notée près | 2 | 2 (même 2 annonces, autre candidat) |
| Moteur v3, tout le stock rejugé (mode réparation) | 6 494 décisions, 838 comptes | 763 comptes à l'octet, 34 à la distance notée près, 20 décisions à l'ordre près | 175 sujets dans 37 comptes (détail §2.1) | |
| Doublons (inventaire_doublon_evaluer) | 38 685 035 paires de fiches en stock | 36 845 096 + 1 834 469 à distance changée, même verdict | 41 questions perdues | 24 questions nouvelles |
| fiches_meme_photo_questions (pHash égal) | 564 (A) / 593 (B) paires | 529 communes | 5 (sans effet : 30 de plus déjà en question) | 19 (+ 45 déjà en question) |
| rapprochement_photo_decisions (fusion_photo_tick) | 1 033 annonces non rattachées | 1 032 | 0 rattachement perdu | 0 rattachement nouveau (1 motif noté autre) |
| beebs_numeros_par_sequence | dépôts Beebs sans numéro (34 des 37 paires changées examinées) | — | 0 | 5 paires deviennent « identiques » |
| Rattachement par photos JS (dépôts, IA, titre) | 30 026 paires réellement jugées | 29 917 | 62 | 47 |

## 1. Les photos

- **Traitées : 65 880** lignes de notre bucket (`listing-photos`) sur 531 465 lignes de `photo_empreintes` (lecture
  16:27 → 16:33). Calcul 16:35:07 → 17:07:55 (**32 min 48 s**), 14 processus Deno × 1 téléchargement, décodage moyen
  420 ms par photo (machine chargée).
- **Lues : 63 827.** **Non lues : 2 053** :
  - **2 052 « HTTP 400 » = fichiers SUPPRIMÉS du stockage** (absents de `storage.objects`, vérifié en lecture ;
    contrôle : 500 fichiers lus sur 500 y sont). Aucune méthode ne peut plus les lire : retirés des DEUX jeux, comptés à
    part. 6 nœuds du moteur portent un de ces fichiers.
  - **1 refus de la nouvelle méthode : « trop de pixels (2500×2500) »** (6,25 Mpx > MAX_PIXELS 6 Mpx) —
    `listing-photos/06b76fe8-ea08-4ce3-822a-0e21163bd61e/rehosted/1791919593410022/1792003893961_0.jpg`, fiche Vinted en
    stock 1791919593410022 « Veste Höhenhorn Cledo enfants » (compte 06b76fe8). Absente de B : cette photo n'a plus
    d'empreinte (1 nœud du moteur, 970 paires de photos sans valeur B).
  - Aucun échec passager (aucun 429 ni 5xx : tout est passé au premier essai).
- **Téléchargé : 18,16 Go** (18,120 Go le calcul complet + 18 Mo l'essai de 60 photos + 23 Mo la lecture EXIF de
  contrôle, 64 Ko par fichier en `Range`) — sous le budget de 20 Go. 65 992 requêtes du calcul (65 880 photos + 14
  téléchargements du décodeur WebP + reprises nulles) ; **0 vers render/image** (le `fetch` les refusait avant envoi).
- **Fidélité du calcul local** : les **1 313** lignes que la prod avait DÉJÀ calculées sur l'originale (image > 400 px
  dans `photo_empreintes`) ressortent **à Δ0** (dHash, pHash, couleur) ; sur l'échantillon de 30, les 10 variantes
  aussi. Le calcul local est celui de la prod, à l'octet.

**Écarts A → B sur les 63 827 photos lues** (distance de Hamming entre l'empreinte stockée et la nouvelle) :

| bits d'écart | 0 | 1 | 2 | 3 | 4 | ≥ 5 |
|---|---|---|---|---|---|---|
| dHash | 42 692 | 15 824 | 3 864 | 871 | 212 | 364 |
| pHash | 46 551 | 0 | 16 289 | 0 | 891 | 96 |
| couleur (16 zones) | 57 193 | 5 650 | 771 | 136 | 35 | 42 |
| variantes, pire des 10 lectures (59 468 photos qui en ont) | 2 558 | 1 774 | 19 803 | 8 432 | 16 518 | 10 383 |
| variantes, chacune des 594 680 lectures | 262 183 | 88 396 | 167 141 | 25 487 | 34 648 | 16 825 |

- Le pHash ne bouge que par paires de bits (seuil à la médiane : un coefficient qui passe la médiane en fait passer un autre).
- **Les grands écarts : 407 photos à Δ ≥ 5** (dHash ou pHash). **50 photos à Δ dHash ≥ 20 (jusqu'à 40)** : 47 portent une
  orientation EXIF 6 ou 8 (rotation de 90°) — render/image appliquait la rotation, imagescript ne la lit pas : la
  nouvelle empreinte est celle de l'image COUCHÉE. Ex. `39bfa95a…/rapatrie-fiche/1790533651374/1790534880992_0.jpg` :
  A 300×400, B 700×525, Δ dHash 40, Δ pHash 30, EXIF 6. Les 357 autres (Δ 5 à 19) n'ont pas de rotation : petites
  images ou fonds unis, où la réduction + recompression JPEG de render/image déplaçait déjà des bits.
- Par source de la ligne A : `empreintes-urls` 62 995 (dont 27 987 à Δ0 sur dHash, pHash et couleur),
  `recensement-2509-sharp` 495 (481), `doublons-balayage` 208 (79), `photo-empreinte` 117 (117 : elle calculait déjà sur
  l'originale), `recensement-2509-vr-sharp` 12 (12).
- Liste complète des 407 : `donnees/photos-grands-ecarts-exif.json` (URL, Δ, dimensions A/B, orientation EXIF).

## 2. Les décisions

Méthode commune : seules les empreintes diffèrent entre A et B ; chaque décision est rejouée avec A puis avec B, avec
le code du dépôt importé tel quel (JS) ou le corps lu en prod (SQL : le rôle en lecture ne peut appeler aucune de ces
fonctions — corps dans `defs/`).

### 2.1 Moteur de rapprochement v3 (`rapprochement`, cron `rapprochement-1min`, actif)

- **Rejeu complet** de `passe()` (`_shared/rapprochement/passe.js`, `moteur.js`, `photos.js`, `fiches-main.js`,
  `remises-en-ligne.js`, importés tels quels), compte par compte, sur les données lues en prod (miroir en SELECT pur de
  `rapprochement_v3_lire`, fonctions internes recopiées depuis leur définition en prod), empreintes sous la forme
  compacte du moteur (`photoDepuisCompacte`, comme la fonction edge). Calcul d'un seul tenant (`CALCUL_DIRECT`, prouvé
  identique aux tranches par le selftest du dépôt). Contrôle A contre A : 0 écart (déterminisme).
- **Comptes** : 1 118 ; 280 n'ont aucune photo empreintée → identiques par construction ; **838 rejoués**, 153 508 nœuds.
- **Passe normale (comme le cron aujourd'hui)** : 1 229 décisions. 835 comptes identiques à l'octet ; 2 comptes
  (771ac4d9, afeef3c7) mêmes décisions, seule la distance notée dans `preuves.photo` change (3 décisions) ; **1 compte
  différent (39bfa95a) : 2 annonces Beebs restent « à vérifier » mais avec un AUTRE candidat et un autre motif**.
- **Tout le stock rejugé** (mode réparation, fiches à la main et remises « toutes ») : 6 494 décisions. 763 comptes
  identiques ; 34 comptes mêmes décisions à la distance notée près (162 décisions) ; 4 comptes ne diffèrent que par
  l'ordre des annonces d'un groupe (20 décisions ; sans effet quand un article existe déjà, sinon l'article serait créé
  depuis une autre annonce du même groupe) ; **37 comptes, 175 sujets, 269 décisions réellement différentes** :

  | catégorie (sujet = l'annonce, le groupe ou la paire) | nombre |
  |---|---|
  | même annonce « à vérifier », autre candidat ou autre motif | 88 |
  | fusion automatique (A) → question (B) | 2 |
  | question (A) → fusion automatique (B) | 1 |
  | fusion automatique qui disparaît (1 fiche importée, 2 annonces) | 2 |
  | fusion automatique qui apparaît (1 fiche importée, 2 annonces) | 2 |
  | question « à vérifier » (A) → entre au stock (B) | 3 |
  | « à vérifier » qui disparaît / apparaît | 15 / 17 |
  | « Annonce en double ? » qui disparaît / apparaît | 25 / 11 |
  | fiche à la main « à vérifier » qui disparaît / apparaît | 1 / 1 |
  | remise en ligne « à vérifier » qui disparaît / apparaît | 2 / 2 |
  | question caduque qui apparaît | 3 |

- **Graphe complet (tout le stock)** : 76 099 arêtes avec A ; **2 953 changent de niveau ou de motif** ; **70 nœuds**
  changent de décision ou de groupe.
- **Paire par paire** : 1 531 725 paires candidates (union A ∪ B ; 36 833 candidates seulement avec A, 36 230 seulement
  avec B). Classe photo du moteur (multi / quasi / une / proche / aucune) : **1 174 776 identiques**, **326 566 distance
  changée sans changer de classe**, **11 394 perdues** (une photo commune ≤ 12 avec A, aucune avec B), **11 660 nouvelles**,
  **7 325 changent de classe** (ex. quasi → une), 4 changent de niveau à classe égale. **Marge minimale au seuil : 0**
  (des paires dont la distance a bougé tombent pile sur un seuil ; ex. compte 001107c2, F1787206169666006 ↔
  F1787224520563 : 15 → 16, le seuil des candidates).

**Exemples concrets** (photo par photo, `scripts/exemple-paire.mjs`) :
- **39bfa95a, « Doudou Minnie multicolore disney baby » : fusion automatique → question.** Annonce Beebs 6aaa5566 (ses
  photos = notre copie `listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rapatrie-fiche/1790533651374/1793422809071_0.jpg`,
  EXIF 6) contre la fiche Vinted 1790106698271006 (`images1.vinted.net/tc/05_00f8e_5Dc3xEfnsE3drv9Cp2ByxRcv/863d6bf7.jpeg`) :
  dPhoto **A 0 → B 21** (seuil « quasi » 4, « proche » 12). A : arête forte photo_quasi → fusion de l'import 1790533651374
  dans la fiche Vinted ; B : doute titre_sans_photo → question.
- **8ac5bbda, « Lee W40 L32 FR50 Homme Jean Bleu Clair » : fusion → question.** Notre copie
  `…/8ac5bbda-0947-4612-82fd-effdaa3ca84a/rapatrie-fiche/1792969346177/1793104561322_4.jpg` contre
  `…/rapatrie-fiche/1792967873071/1792973700738_1.jpg` (Beebs ↔ eBay, deux copies de notre bucket) : **A 0 → B 25**.
- **771ac4d9, « Robe été blanche taille XS » : la fusion disparaît.** Annonce Leboncoin ee73c03b contre la fiche Vinted
  1791365564406007 : deux paires de photos **6,4 → 8** et **9 → 10** (seuil « multi » : deux paires ≤ 9) : photo_multi
  (fort) → photo_proche (doute).
- **39bfa95a, passe normale** : annonce Beebs e3493bbb « Lot 2 doudous Simba » : A propose l'annonce Leboncoin 9b22700e
  (titre_sans_photo, photo 24) ; B propose la fiche 1790106697348007 (même photo à 0, deux annonces de la même plateforme).

### 2.2 Doublons

- **`inventaire_doublon_evaluer` → `meme_objet_signaux` → `photos_distance` → `meme_objet_niveau`** (actif par
  `rapprocher_releve` → `revoir_questions_releve` → `inventaire_doublons_pour` ; aussi par `doublons_examiner_fiche`, dont
  le cron `doublons-balayage-2min` est INACTIF) : **toutes les paires de fiches en stock** de chaque compte, avec
  `fiche_photos_toutes` (corps lu en prod) : **38 685 035 paires** ; verdict photo identique 36 845 096, distance changée
  au même verdict 1 834 469, **verdict changé 5 470** (3 015 vers le bas, 2 455 vers le haut : proche → differente 2 914, differente → proche 2 364,
  identique → proche 97, proche → identique 91, identique → differente 4). Marge minimale au seuil : 0.
  Puis le NIVEAU rejoué (titres, marques, prix relus en entier en prod ; `titre_jetons`, `titre_couleurs`,
  `titre_nombres`, `meme_objet_niveau`, `titres_variante_substituee` recopiés depuis la prod) :
  1 593 paires sans jeton commun (jamais candidates), 1 864 paires de deux fiches Vinted (écartées d'office sauf remise
  en ligne), **2 011 candidates** : 1 552 même niveau et même motif, 373 écartées dans les deux cas (motif seul différent),
  21 questions dans les deux cas avec un autre motif, **65 changent de niveau : 41 questions perdues (probable → écartée),
  24 questions nouvelles (écartée → probable)**, dans **18 comptes**. Ex. 18e461c1, fiches 1791804496543 / 1791804497823
  « Doudoune bébé garçon - neuf - taille 9 mois » (titres identiques) : photos d 9 / p 28 → **proche** avec A,
  d 11 / p 28 → **differente** avec B (seuil proche : d ≤ 10) → **probable/titre_exact → écartée**.
- **`fusion_photo_candidates`** (cron `fusion-photo-lot-10min` INACTIF : aucun effet aujourd'hui) : couvertures
  identiques (d ≤ 5 et p ≤ 8) entre fiches en stock : 2 630 paires avec A, 2 664 avec B (**32 perdues, 66 nouvelles**),
  144 fiches changent de degré (l'« isolement » qui autorise la fusion), 10 paires changent sur les autres photos.
- **`rapprochement_photo_decisions`** (`fusion_photo_tick` §1, cron actif) : sur les 41 735 annonces à couverture, 172
  changent de cas (aucune / une / plusieurs fiches à la même photo) ; **sur les 1 033 annonces non rattachées (les seules
  que le tick examine), 1 seule** : 771ac4d9, annonce Leboncoin d0572758 — A « une fiche + deux annonces de la même
  plateforme », B « plusieurs fiches à la même photo » : non rattachée dans les deux cas, motif noté différent.
- **`fiches_meme_photo_questions`** (actif, fonction `rapprochement`) : pHash ÉGAL des couvertures `photos->>0`. 564 paires
  avec A, 593 avec B : 35 perdues dont **5 sans question existante**, 64 nouvelles dont **19 sans question existante**
  (les autres ont déjà une ligne `inventaire_doublons` : la fonction les saute).

### 2.3 Autres fonctions SQL qui lisent une empreinte

- **`beebs_numeros_par_sequence`** (get-pending-jobs) : « identique » entre la première photo de la fiche du dépôt et la
  couverture d'une annonce Beebs : 2 564 858 paires (sur-ensemble), 6 perdues, 31 nouvelles ; **parmi les fiches qui ont
  un dépôt Beebs publié sans numéro ni lien, 5 paires deviennent « identiques »** (aucune ne le perd ; vérifié sur 34
  des 37 paires changées, les 3 autres n'ont pas été gardées en exemple) — elles pourraient
  poser un numéro si le titre et la séquence concordent aussi (non rejoué : séquence et titres hors photo).
- **`trancher_publications_sans_lien`** : dHash ÉGAL — ne change que le TEXTE du message d'échec (« Elle porte la même
  photo que ton annonce … ») : 14 973 290 paires (sur-ensemble), 235 perdues, 638 nouvelles.
- **`rapprochement_candidats`, `rapprochement_lire_fiches`** : aucun appelant (ni SQL, ni dépôt) — non rejouées ;
  `rapprochement_candidats` passe de toute façon par `rapprochement_photo_decisions` (rejouée).
  `rapprocher_confirmer_photo` ne lit aucune photo (rend toujours « reste_propose »). `urls_resolues`,
  `rapprochement_v3_empreintes(_compactes)` : lecture seule, aucune décision.

### 2.4 Les lecteurs JS hors moteur

Toutes leurs décisions passent par `trancherParPhotos` → `niveauPhoto(comparerPhotos(…))` (`annonce-partagee.js`, importé
tel quel) : « même » = une paire ≤ 4 ou deux ≤ 9, « autre » = rien ≤ 12.

| fonction | ce qu'elle décide avec l'empreinte | rejoué |
|---|---|---|
| `get-pending-jobs` | `jugerCandidates` (recréation : la copie contre les candidates) ; `jugerCycleDepots` (dépôts sans numéro) ; RPC `beebs_numeros_par_sequence` | oui (dépôt ↔ annonce ; §2.3) |
| `handler-watch` | `decisionDepotCoupe` (dépôt coupé : copie ↔ candidates) ; `decisionAlignementTitre` (titre-aligne : annonce ↔ fiche) ; RPC `rapprocher_releve` → doublons | oui (§2.2) |
| `beebs-lien` | `rattacherParPhotos` (copie ↔ annonces Beebs) | oui |
| `rapprochement-ia` | `trancherParPhotos` (annonce partagée ↔ fiches qui la revendiquent) | oui |
| `photo-empreinte` | ne décide rien : calcule (sur l'originale d'abord) pour l'app ; l'app (`jumeauxEnLigne.js`) avertit « jumeau » sur « identique » (d ≤ 5 et p ≤ 8) | par le prédicat (§2.5) |

- Univers : 51 566 182 paires d'objets (dépôt ↔ annonce de sa plateforme ; annonce ↔ fiche, 4 ou 6 photos). Seules
  celles qui contiennent une paire de photos ≤ 16 (A ou B) touchant notre bucket peuvent changer de niveau (les seuils
  sont 4, 9, 12) : **2 111 797 évaluées en entier** ; 76 722 changent de niveau (37 393 vers le bas, 39 329 vers le haut).
- **Restreint aux paires réellement jugées** (dépôt ↔ annonce candidate au sens de `candidatesDuDepot` ; annonce ↔ fiche
  liée par un dépôt ou rangée sur elle) : **30 026 paires, 109 changent : 62 perdues, 47 nouvelles, 30 comptes** —
  dépôt ↔ annonce 4 (toutes chez 39bfa95a, « autre » → « même », photos EXIF : copie 24 → 0) ; annonce ↔ fiche 105
  (eBay 37, Leboncoin 45, Beebs 21, Opla 5, Depop 1), le plus souvent « même » ↔ « proche » à la frontière 4 / 5.

### 2.5 Tous les prédicats, photo par photo (sur-ensemble de toutes les décisions)

250 428 444 paires de photos d'un même compte touchant une photo de notre bucket :

| prédicat | vrai avec A seulement | avec B seulement | avec les deux |
|---|---|---|---|
| identique SQL (d ≤ 5 et p ≤ 8) | 1 331 | 1 663 | 94 028 |
| proche SQL (d ≤ 10) | 25 084 | 24 831 | 565 880 |
| dHash égal | 4 175 | 15 577 | 47 051 |
| pHash égal | 4 416 | 12 714 | 49 000 |
| moteur ≤ 2 | 865 | 2 016 | 85 491 |
| moteur ≤ 4 (quasi) | 777 | 1 335 | 93 794 |
| moteur ≤ 7 (une, plausible) | 4 169 | 4 679 | 125 244 |
| moteur ≤ 9 (multi) | 11 518 | 11 543 | 183 781 |
| moteur ≤ 12 (proche) | 36 878 | 37 138 | 486 443 |
| moteur ≤ 14 | 66 225 | 66 800 | 850 053 |
| moteur ≤ 16 (candidates) | 236 872 | 237 345 | 2 132 816 |

787 947 paires franchissent au moins un seuil ; 894 830 autres changent de distance sans en franchir. Marge minimale : 0.

## 3. Les écarts, avec exemples (les 20 premiers par type ; listes complètes dans `donnees/resultats/`)

#### Moteur v3, passe « normale (comme le cron) » — 2 sujet(s), 2 premiers

| compte | catégorie | décision A | décision B | éléments (titres) | arête en cause : niveau A → B, distance photo A → B |
|---|---|---|---|---|---|
| 39bfa95a | même sujet : a_verifier → a_verifier | a_verifier/titre_sans_photo → {"annonce":"9b22700e-512a-41ec-b265-3d9b | a_verifier/meme_photo_deux_annonces_meme_plateforme → {"fiche":"179010 | Ae3493bbb beebs: Lot 2 doudous Simba Le Roi Lion disney<br>A9b22700e leboncoin: Doudou Simba Le Roi Lion disney ba<br>F17901066 Lot 2 doudous Simba Le Roi Lion disney baby e | Ae3493bbb…/F1790106697348007 : doute/titre_sans_photo → doute/ambigu_plusieurs, 24 → 0 |
| 39bfa95a | même sujet : a_verifier → a_verifier | a_verifier/titre_sans_photo → {"fiche":"1790106697754004"} | a_verifier/photo_proche → {"fiche":"1790106697348005"} | Afc9b6701 beebs: Doudou Simba Le Roi Lion i'm a king di<br>F17901066 Doudou Simba Le Roi Lion disney baby en très <br>F17901066 Doudou Simba Le Roi Lion The lion King disney | Afc9b6701…/F1790106697348005 : doute/titre_sans_photo → doute/photo_proche, 26 → 12 |

#### Moteur v3, passe « tout le stock (réparation) » — 175 sujet(s), 20 premiers

| compte | catégorie | décision A | décision B | éléments (titres) | arête en cause : niveau A → B, distance photo A → B |
|---|---|---|---|---|---|
| 39bfa95a | même sujet : fusionner → a_verifier | fusionner → garde F1790106698271006 | a_verifier/titre_sans_photo → {"annonce":"9124b22e-bb02-41a3-9172-ab6d | A6aaa5566 beebs: Doudou Minnie multicolore disney baby <br>F17905336 Doudou Minnie multicolore disney baby en très<br>F17901066 Doudou Minnie multicolore disney en très bon <br>A9124b22e leboncoin: Doudou Minnie multicolore disney b | A6aaa5566…/F1790106698271006 : fort/photo_quasi → doute/titre_sans_photo, 0 → 21 |
| 771ac4d9 | disparaît : fusionner | fusionner → garde F1791365564406007 | — | Ab1f6fc61 beebs: Robe blanche<br>F17913798 Robe été blanche taille XS<br>F17913655 💥 Robe blanche taille XS🔥🔥 | — |
| 771ac4d9 | disparaît : fusionner | fusionner → garde F1791365564406007 | — | Aee73c03b leboncoin: Robe été blanche taille XS<br>F17913798 Robe été blanche taille XS<br>F17913655 💥 Robe blanche taille XS🔥🔥 | Aee73c03b…/F1791365564406007 : fort/photo_multi → doute/photo_proche, 6.4 → 8 |
| 8ac5bbda | même sujet : fusionner → a_verifier | fusionner → garde F1792968102167008 | a_verifier/titre_sans_photo → {"annonce":"d721067d-6661-4357-8f94-6494 | Abb8f516a beebs: Lee W40 L32 FR50 Homme Jean Bleu Clair<br>F17929693 Lee W40 L32 FR50 Homme Jean Bleu Clair Regula<br>F17929681 Jean Lee Regular Fit bleu clair Homme FR50 W4<br>Ad721067d ebay: Lee W40 L32 FR50 Homme Jean Bleu Clair  | Abb8f516a…/F1792968102167008 : fort/photo_multi → doute/titre_sans_photo, 3.2 → 22.4 |
| 8ac5bbda | apparaît : fusionner | — | fusionner → garde F1792968121799018 | A98620aac beebs: Lee Taille FR 34 Femme Jean Bleu Coupe<br>F17929677 Lee Taille FR 34 Femme Jean Bleu Coupe Droite<br>F17929681 Wrangler Taille W34 L32 FR 44 Homme Jean Bleu | — |
| 8ac5bbda | apparaît : fusionner | — | fusionner → garde F1792968121799018 | Ac6aa7880 leboncoin: Lee Taille FR 34 Femme Jean Bleu C<br>F17929677 Lee Taille FR 34 Femme Jean Bleu Coupe Droite<br>F17929681 Wrangler Taille W34 L32 FR 44 Homme Jean Bleu | — |
| f078cf94 | même sujet : a_verifier → fusionner | a_verifier/ambigu_plusieurs → {"fiche":"1790667067355006"} | fusionner → garde F1790667067355006 | A61a178fb opla: Veste Volcom - Track Jacket - Taille 👚<br>F17906670 Veste Volcom - Track Jacket - Taille 👚 S - S<br>F17906673 Veste Volcom - Track Jacket - Taille 👚 S - S | A61a178fb…/F1790667067355006 : doute/ambigu_plusieurs → fort/photo_quasi, 0 → 0 |
| 771ac4d9 | même sujet : a_verifier → entrer_stock | a_verifier/photo_proche → {"annonce":"aadf231e-49e5-412a-a09a-e2e58630 | entrer_stock | A2b7d2f98 beebs: Pantalon bleu foncé 8 ans<br>Aaadf231e leboncoin: Pantalon à rayures noires | A2b7d2f98…/Aaadf231e… : doute/photo_proche → absente, 12 → — |
| 771ac4d9 | même sujet : a_verifier → entrer_stock | a_verifier/photo_proche → {"annonce":"2b7d2f98-37a1-4a13-a769-e32546a5 | entrer_stock | Aaadf231e leboncoin: Pantalon à rayures noires<br>A2b7d2f98 beebs: Pantalon bleu foncé 8 ans | A2b7d2f98…/Aaadf231e… : doute/photo_proche → absente, 12 → — |
| a99e2876 | même sujet : a_verifier → entrer_stock | a_verifier/photo_proche → {"fiche":"1789855695064003"} | entrer_stock | A26534dcd beebs: Levi&#x27;s 535 legging T:36<br>F17898556 Pantalon denim jeans jennifer 34 skinny noir  | A26534dcd…/F1789855695064003 : doute/photo_proche → absente, 11.2 → — |
| 0f8722f5 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | F17869136 Montre Ferrari plaqué or vintage<br>F17869136 Montre Playboy plaqué or noire vintage | — |
| 18e461c1 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A1351a4d3 beebs: Ensemble été Fille - Crop top aloha & <br>Adb97154c beebs: Ensemble Pyjama Fille - neuf - taille  | — |
| 229c7b07 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | F17935517 Carte Bob razowski SR97 Disney Cardfun D100 M<br>F17935517 Carte Disney Bob Razowski SR 97 Cardfun D100  | — |
| 229c7b07 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A86cd8d22 ebay: Topps Disney100 Chrome Ian Lightfoot #3<br>Ade09f9ec ebay: Topps Disney100 Chrome Mulan #78 Carte  | — |
| 229c7b07 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A78a4b4d5 leboncoin: Deck de départ Neuf - Disney Lorca<br>A9a79ec6b leboncoin: Deck de départ - Disney Lorcana -  | — |
| 229c7b07 | apparaît : annonce_en_double | — | annonce_en_double/annonce_en_double | F17935517 Carte Disney D100 D23 2024 Topps Chrome n• 14<br>F17935517 Carte Disney D100 2024 Topps Chrome n• 143 Me | — |
| 28a45b62 | apparaît : annonce_en_double | — | annonce_en_double/annonce_en_double | F17872081 T shirt Carhartt 100 % cotton / L / Bleu Mari<br>F17880879 T shirt Carhartt 100 % cotton / L / Bleu Mari | — |
| 309d0787 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A7794431c ebay: COTE DES SOMALIS PA N ° 48 48 F SATELLI<br>Adcb220b9 ebay: TAAF POSTE AERIENNE NEUF++ PA 12 Satell | — |
| 309d0787 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A16d72134 ebay: France Année 1971 YT ( 1664 ) 1664c neu<br>Ac7cc5f49 ebay: 1971 FRANCE TIMBRE N° Y&T 1664 " Marian | — |
| 309d0787 | disparaît : annonce_en_double | annonce_en_double/annonce_en_double | — | A1d8e42aa ebay: TIMBRE N° 2717 - COIN DATE DU 29-8-91 -<br>A5834a0f1 ebay: TIMBRE N° 2622 - COIN DATE DU 30.5.91 - | — |

#### Doublons (inventaire_doublon_evaluer → meme_objet_niveau) — 65 paires changent de niveau, 20 premières

| compte | fiche a | fiche b | titres | photos_distance A (d/p → verdict) | B (d/p → verdict) | niveau A | niveau B |
|---|---|---|---|---|---|---|---|
| 16eece9b | 1792935258116 | 1792935259822 | Carte à l'unité - Naruto A5 - Tsunade - Narut<br>Carte à l'unité - Naruto A5 - Naruto -2 - oth | 10/6 → proche | 11/6 → differente | probable/photo_proche | ecarte/photos_differentes |
| 16eece9b | 1792935259291 | 1792935260180 | Carte à l'unité - Puppy Studio - Ishtar<br>Carte à l'unité - Puppy Studio - Misato Katsu | 10/16 → proche | 11/16 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804496440 | 1791804498772 | Top Blouse fleurie Fille - neuf - canada hous<br>Maillot de bain fille– neuf– Canada House– ta | 9/12 → proche | 11/14 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804496543 | 1791804497823 | Doudoune Bébé garçon - neuf - taille 9 mois<br>Doudoune bébé garçon - neuf - taille 9 mois | 9/28 → proche | 11/28 → differente | probable/titre_exact | ecarte/photos_differentes |
| 18e461c1 | 1791804496847 | 1791804497983 | Lit de 2 body garçon - taille 6 mois<br>Lot de 2 body Bébé Garçon - Neuf - taille 6 m | 9/4 → proche | 11/6 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804496889 | 1791795029456023 | T-shirt bébé garçon - neuf - Taille 6 mois<br>Parka à capuche bébé garçon - neuf - zippy -  | 8/20 → proche | 11/20 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804496932 | 1791795101251018 | Ensemble bébé garçon - neuf - taille 6 mois<br>Ensemble été fruité bébé Fille - Neuf - Canad | 10/20 → proche | 11/20 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804496942 | 1791804497040 | Ensemble bébé garçon - neuf - taille 6 mois<br>Ensemble bébé garçon - neuf - taille 6 mois | 10/14 → proche | 11/14 → differente | probable/titre_exact | ecarte/photos_differentes |
| 18e461c1 | 1791804496942 | 1791795001486004 | Ensemble bébé garçon - neuf - taille 6 mois<br>Ensemble Bébé fille - neuf - canada House - t | 10/22 → proche | 11/22 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804497138 | 1791795039539002 | Ensemble bébé garçon - neuf - taille 6 mois<br>👕 Ensemble d'été T-shirt Dinosaures et short | 9/16 → proche | 11/18 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804497933 | 1791804498772 | Débardeur Crop Top Côtelé fille - Neuf - cana<br>Maillot de bain fille– neuf– Canada House– ta | 10/6 → proche | 12/8 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804498166 | 1791794993357012 | Pyjama bébé garçon - Neuf - Zippy - taille 18<br>Pyjama bébé garçon - Neuf - Zippy - taille 18 | 11/30 → differente | 10/32 → proche | ecarte/photos_differentes | probable/titre_exact |
| 18e461c1 | 1791804498772 | 1791795092404010 | Maillot de bain fille– neuf– Canada House– ta<br>Débardeur Crop Top Côtelé fille - Neuf - cana | 10/6 → proche | 12/8 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804498772 | 1791795092404019 | Maillot de bain fille– neuf– Canada House– ta<br>Blouse Top fleurie fille - neuf - canada hous | 10/4 → proche | 12/6 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804498813 | 1791794986810018 | Pyjama garçon - neuf - Taille 3 ans<br>Pyjama velours Bébé garçon (neuf) - Taille 3  | 10/12 → proche | 11/12 → differente | probable/photo_proche | ecarte/photos_differentes |
| 18e461c1 | 1791804498813 | 1791795029456018 | Pyjama garçon - neuf - Taille 3 ans<br>Pyjama Garçon - combinaison - Neuf - Disney - | 11/14 → differente | 10/16 → proche | ecarte/photos_differentes | probable/photo_proche |
| 309d0787 | 1792329165648 | 1792329166005 | Timbre FRANCE Saint François de Sales 1967 Ne<br>Timbre FRANCE Beaumarchais 1967 Neuf ** YT151 | 14/14 → differente | 5/24 → proche | ecarte/photos_differentes | probable/photo_proche |
| 309d0787 | 1792329166005 | 1792329169496 | Timbre FRANCE Beaumarchais 1967 Neuf ** YT151<br>Timbre FRANCE Floralies ORLEANS 1967 Neuf **  | 10/8 → proche | 11/8 → differente | probable/photo_proche | ecarte/photos_differentes |
| 309d0787 | 1792329167373 | 1792329171380 | LOT DE 3 FEUILLE SHEET ANDORRE FRANCAIS Timbr<br>LOT DE 3 bloc coin daté ANDORRE FRANCAIS Timb | 10/20 → proche | 11/20 → differente | probable/photo_proche | ecarte/photos_differentes |
| 39bfa95a | 1790533651374 | 1790106698271006 | Doudou Minnie multicolore disney baby en très<br>Doudou Minnie multicolore disney en très bon  | 3/0 → identique | 36/30 → differente | probable/photo_identique | ecarte/photos_differentes |

#### trancherParPhotos / niveauPhoto (paires réellement jugées) — 109 changements, 20 premiers

| compte | type | élément a | élément b | plateforme | niveau A → B | meilleure distance A → B | photos (a ; b) |
|---|---|---|---|---|---|---|---|
| 0fc66002 | annonce ↔ fiche | 0df01612-2d48 | 1791108421172 | ebay | meme → proche | 4 → 5 | https://i.ebayimg.com/images/g/hsoAAeSwXyxql97U/s-l140.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/0fc66002-bc7d-44de-a4c1-d875b2cbdccc/rapatrie-fiche/1791108421172/1791108541450_0.jpg |
| 2076665e | annonce ↔ fiche | cc42ae23-4576 | 1791108241071 | ebay | meme → proche | 2 → 5 | https://i.ebayimg.com/images/g/7fEAAOSws9tjwEhc/s-l140.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/2076665e-405c-4595-ae65-92427000a21a/rapatrie-fiche/1791108241071/1791152283114_0.jpg |
| 2076665e | annonce ↔ fiche | cc42ae23-4576 | 1791108241071 | ebay | meme → proche | 2 → 5 | https://i.ebayimg.com/images/g/7fEAAOSws9tjwEhc/s-l140.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/2076665e-405c-4595-ae65-92427000a21a/rapatrie-fiche/1791108241071/1791152283114_0.jpg |
| 28865d04 | annonce ↔ fiche | b2c1bd7d-acc9 | 1790533647109 | leboncoin | meme → proche | 3.2 → 4.8 | https://img.leboncoin.fr/api/v1/lbcpb1/images/91/c0/ec/91c0ec8bfbc6e7040b80d2c2c1a2343952ea123b.jpg?rule=ad-large ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/28865d04-f043-43de-8963-10ee3521b825/rapatrie-fiche/1790533647109/1790533981804_0.jpg |
| 28865d04 | annonce ↔ fiche | 243d00c7-ab5a | 1790533646440 | leboncoin | meme → proche | 4 → 5 | https://img.leboncoin.fr/api/v1/lbcpb1/images/d7/9c/2c/d79c2c64859e5d282d55f0d50836cac58bc023a1.jpg?rule=ad-large ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/28865d04-f043-43de-8963-10ee3521b825/rapatrie-fiche/1790533646440/1790533981804_0.jpg |
| 309d0787 | annonce ↔ fiche | f51c84b7-40cf | 1792329172102 | ebay | proche → meme | 6 → 4 | https://i.ebayimg.com/images/g/faAAAeSw46lpNaSS/s-l140.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/309d0787-9000-46cc-9c6a-51f7475d7d41/rapatrie-fiche/1792329172102/1792338483325_0.jpg |
| 309d0787 | annonce ↔ fiche | 11f9be26-1595 | 1792329165277 | ebay | meme → proche | 3.2 → 4.8 | https://i.ebayimg.com/images/g/9mcAAeSwKkFpNaiZ/s-l140.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/309d0787-9000-46cc-9c6a-51f7475d7d41/rapatrie-fiche/1792329165277/1792330205654_0.jpg |
| 39bfa95a | annonce ↔ fiche | 2562d8f2-bb11 | 1790106697348 | beebs | autre → meme | 24 → 0 | https://cdn.beebs.app/0fe25201-3643-40bc-adc4-dd613dcfd679.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348007/1790803620613_watch_0.jpg |
| 39bfa95a | dépôt ↔ annonce | 64a2ef50-5ed3 | e3493bbb-bdc2 | beebs | autre → meme | 24 → 0 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348007/1790803620613_watch_0.jpg ; https://cdn.beebs.app/e9ee6c22-9fee-4b0d-a03e-57ce1270c53a.jpg |
| 39bfa95a | annonce ↔ fiche | fd0b0ca8-27b7 | 1790106697348 | leboncoin | meme → autre | 1.6 → 25 | https://img.leboncoin.fr/api/v1/lbcpb1/images/1b/96/4c/1b964c40891950ecc301ae7a61613f11baad618f.jpg?rule=ad-large ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348005/1790884081586_watch_0.jpg |
| 39bfa95a | dépôt ↔ annonce | 8a66de4d-d8dd | 816e1ba9-3155 | beebs | autre → meme | 25.6 → 0 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348005/1790884081586_watch_0.jpg ; https://cdn.beebs.app/9513a5fe-e605-4987-86f6-24a96f8f643c.jpg |
| 39bfa95a | annonce ↔ fiche | 250f620b-5914 | 1790106697348 | beebs | autre → meme | 25.6 → 0 | https://cdn.beebs.app/c10573f3-ac3b-4d63-8e27-5e633e2f0f18.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348005/1790884081586_watch_0.jpg |
| 39bfa95a | annonce ↔ fiche | 8e1aeca9-a425 | 1790106697348 | leboncoin | meme → autre | 1.6 → 25.6 | https://img.leboncoin.fr/api/v1/lbcpb1/images/de/55/f4/de55f4116ba03fb455d121a63ac3d436af91ad90.jpg?rule=ad-large ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348005/1790884081586_watch_0.jpg |
| 39bfa95a | annonce ↔ fiche | 5aa9a58e-dfa1 | 1790106695686 | beebs | autre → meme | 25 → 0 | https://cdn.beebs.app/c17294fd-6b8f-4d4b-91f0-035919501302.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106695686001/1790940241052_watch_0.jpg |
| 39bfa95a | annonce ↔ fiche | 34d26402-79de | 1790106695686 | beebs | meme → autre | 1 → 26 | https://cdn.beebs.app/5416d727-fd14-497a-ac36-dc284361f778.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106695686001/1790940241052_watch_0.jpg |
| 39bfa95a | annonce ↔ fiche | b968c2c1-c4c3 | 1790533651280 | beebs | autre → meme | 30 → 0 | https://cdn.beebs.app/bce33621-3d00-4252-8ca1-abea09fc5602.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rapatrie-fiche/1790533651280/1793221207640_0.jpg |
| 39bfa95a | annonce ↔ fiche | 6aaa5566-6bca | 1790533651374 | beebs | autre → meme | 21 → 0 | https://cdn.beebs.app/82d8b27c-b869-4b47-8995-c22f59ecae7b.jpg ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rapatrie-fiche/1790533651374/1793422809071_0.jpg |
| 39bfa95a | dépôt ↔ annonce | de036ed3-d783 | fc9b6701-e8ae | beebs | autre → meme | 29 → 0 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348004/1790803620613_watch_0.jpg ; https://cdn.beebs.app/61866389-811e-4cf8-9d57-3e4dfe13a8b9.jpg |
| 39bfa95a | dépôt ↔ annonce | de036ed3-d783 | 816e1ba9-3155 | beebs | autre → proche | 24 → 12 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348004/1790803620613_watch_0.jpg ; https://cdn.beebs.app/9513a5fe-e605-4987-86f6-24a96f8f643c.jpg |
| 42eab075 | annonce ↔ fiche | 46d2563d-a03a | 1790539469594 | leboncoin | meme → proche | 3.2 → 4.8 | https://img.leboncoin.fr/api/v1/lbcpb1/images/ec/54/c5/ec54c5ac8e815898a3daae9669ce771d3c444697.jpg?rule=ad-large ; https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/42eab075-66f2-49de-8e44-212377cfaf41/rapatrie-fiche/1790539469594/1790562960784_0.jpg |

#### fiches_meme_photo_questions (pHash ÉGAL des couvertures) — 24 paires sans question existante qui changent

| compte | paire (fiches) | A → B |
|---|---|---|
| 18e461c1 | 1791804497874|1791804497933 | question → rien |
| 22659b79 | 1790627646677|1790629430499005 | rien → question |
| 3f91c02e | 1792858490823|1792855407839018 | question → rien |
| 53efea05 | 1790174151261|1792750036810 | rien → question |
| 55549217 | 1791813613875|1792944913307 | rien → question |
| 55549217 | 1791813614846|1792944912947 | rien → question |
| 55549217 | 1791813617801|1791813719653012 | rien → question |
| 55549217 | 1791813626944|1791901345613017 | rien → question |
| 55549217 | 1791813634229|1792944912817 | rien → question |
| 771ac4d9 | 1791379859886|1791365547194016 | rien → question |
| 869e5f03 | 1790640029877|1789073662819007 | rien → question |
| 869e5f03 | 1790640029877|1792491793020004 | rien → question |
| 8ac5bbda | 1792967849010|1792968109979015 | rien → question |
| a41f2249 | 1793257863228|1793257512627007 | rien → question |
| a8bcc86e | 1793398221167|1793475857632000 | rien → question |
| a99e2876 | 1790533683836|1790533687751 | rien → question |
| a99e2876 | 1790533683836|1790533687905 | rien → question |
| b245e854 | 1791868497970|1791892419396022 | question → rien |
| b245e854 | 1791868494831|1791892420697021 | rien → question |
| bd380fbf | 1790856892851|1791113504906000 | rien → question |

#### beebs_numeros_par_sequence (dépôts Beebs publiés sans numéro) — 5 paires

| compte | fiche | annonce | photo de la fiche | photo de l'annonce | « identique » A → B |
|---|---|---|---|---|---|
| 39bfa95a | 1790106697348005 | 250f620b-5914 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348005/1790884081586_watch_0.jpg | https://cdn.beebs.app/c10573f3-ac3b-4d63-8e27-5e633e2f0f18.jpg | false → true |
| 39bfa95a | 1790106697348007 | 2562d8f2-bb11 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/39bfa95a-0b8d-46fe-b836-040966d02cfd/rehosted/1790106697348007/1790803620613_watch_0.jpg | https://cdn.beebs.app/0fe25201-3643-40bc-adc4-dd613dcfd679.jpg | false → true |
| 8ac5bbda | 1793214590477000 | 84d090a1-5a21 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/8ac5bbda-0947-4612-82fd-effdaa3ca84a/enhanced/1793215562448_0.png | https://cdn.beebs.app/e3fc4acb-4b9e-40d2-b642-063f061741d7.jpg | false → true |
| 8ac5bbda | 1793214590477000 | aa931e24-eac5 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/8ac5bbda-0947-4612-82fd-effdaa3ca84a/enhanced/1793215562448_0.png | https://cdn.beebs.app/689b0a99-db62-489d-b266-48d83a3a3f90.jpg | false → true |
| f44b5917 | 1793009407689006 | 3b027696-0618 | https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rehosted/1793009407689006/1793011088701_0.jpg | https://cdn.beebs.app/6e6eb704-1e7c-4cc5-b5cf-b0baa162be9f.jpg | false → true |

Autres listes complètes : moteur `donnees/resultats/moteur-sujets.json` (175 sujets) et `moteur-ecarts.json` ;
arêtes `donnees/synthese.json` → `moteur.ecarts_aretes` (2 953) ; doublons `donnees/resultats/doublons-niveau.json`
(86 paires dont 65 changent de niveau) ; JS `donnees/synthese.json` → `autres.S.ecarts` (champ `reelle`) ;
SQL et prédicats par compte : `donnees/resultats/autres/<compte>.json` ; par compte pour le moteur :
`donnees/resultats/moteur/<compte>.json`.

## 4. Ce que la comparaison couvre, et ce qu'elle ne couvre pas

**Couvert**
- Toutes les lignes de notre bucket présentes dans `photo_empreintes` le 02/11 à 16:27 (65 880), recalculées avec le
  code de 40e4bd3, à l'octet (contrôle sur 1 313 lignes déjà calculées sur l'originale par la prod : Δ0).
- Le moteur v3 complet (passe normale ET tout le stock), sur les 1 118 comptes, avec ses vrais modules ; comparaison des
  décisions écrites, du graphe (arêtes, groupes) et des paires une à une.
- Les doublons jusqu'au NIVEAU (question posée ou non) pour toutes les paires de fiches en stock dont le verdict photo change.
- Toutes les fonctions SQL qui lisent `photo_empreintes`, `dhash` ou `phash` en prod (13 trouvées par `pg_proc`, et leurs
  appelants) ; les lecteurs JS (`get-pending-jobs`, `handler-watch`, `beebs-lien`, `rapprochement-ia`, `photo-empreinte`
  et l'app) ; et, en filet, tous les prédicats sur 250 millions de paires de photos d'un même compte.

**Pas couvert, ou couvert en sur-ensemble**
- Un instantané : A lue à 16:27, données des comptes à ~16:40, B calculée de 16:35 à 17:08. Une photo empreintée après
  16:27 n'est pas dans l'essai (elle l'aurait été par l'ancienne méthode).
- Ce qui ne dépend pas de la photo n'est pas rejoué à l'identique de la prod, mais l'est À L'IDENTIQUE ENTRE A ET B :
  la lecture du moteur est un miroir SQL de `rapprochement_v3_lire` (non exécutable par le rôle en lecture) ; les
  doublons ignorent la limite de 60 candidates, les refus passés de la personne, la remise en ligne Vinted et la règle
  « deux annonces vivantes sur la même plateforme » (qui ne change que le motif, pas le niveau) ; `beebs_numeros_par_sequence`
  et `trancher_publications_sans_lien` sont comptés en sur-ensemble (toutes les paires possibles, sans séquence ni titre).
- Les décisions JS par paires (dépôt ↔ annonce, annonce ↔ fiche) sont rejouées au niveau de la paire (« même » /
  « proche » / « autre »), pas au niveau de la règle finale (« une seule même, toutes les autres autre ») : une paire qui
  change peut ne rien changer à la décision finale, ou en changer une.
- Les 2 052 fichiers supprimés du stockage sont hors comparaison (ni A ni B) : en prod, leur empreinte A reste en
  base et continue d'être lue par 6 nœuds du moteur.
- Crons inactifs aujourd'hui (`doublons-balayage-2min`, `fusion-photo-lot-10min`) : leurs écarts sont comptés mais ne
  produisent rien tant qu'ils restent coupés.
- Les photos hors bucket ne changent pas (identiques dans A et B, par construction) ; seules les paires qui touchent notre
  bucket peuvent bouger.

## 5. Les scripts (rejouer : dans cet ordre, depuis ce dossier)

| script | rôle |
|---|---|
| `scripts/sql-lecture.mjs` | une requête SQL en lecture seule (`npx supabase db query --linked --read-only`, depuis le dépôt) |
| `scripts/lire-empreintes.mjs` | lit `photo_empreintes` par pages → `donnees/empreintes-A.ndjson` (jeu A) |
| `scripts/calculer-nouvelle.ts` + `scripts/lancer-calcul.sh` | la nouvelle méthode (Deno, module de 40e4bd3 dans `mod40e4bd3/`) → `donnees/B/shard*.ndjson` |
| `scripts/comparer-echantillon.mjs`, `scripts/verifier-dphoto.mjs` | contrôles : A ↔ B sur un échantillon ; distance bornée = `dPhoto` du dépôt (3 millions de paires, 0 écart) |
| `scripts/lire-donnees-moteur.mjs` | données du moteur, compte par compte (miroir de `rapprochement_v3_lire`) → `donnees/moteur/` |
| `scripts/lire-tables.mjs` | lignes brutes inventaire / annonces / dépôts → `donnees/tables/` |
| `scripts/verifier-absents.mjs` | les HTTP 400 : fichier encore dans `storage.objects` ? → `donnees/absents.json` |
| `scripts/jeux.mjs`, `scripts/preparer-comptes.mjs` | jeux A et B (forme compacte du moteur), par compte → `donnees/emp/` ; statistiques §1 → `donnees/bilan-photos.json` |
| `scripts/rejouer-moteur.mjs` | §2.1 → `donnees/resultats/moteur/` |
| `scripts/rejouer-autres.mjs` | §2.2 à 2.5 → `donnees/resultats/autres/` |
| `scripts/rejouer-doublons-niveau.mjs` | niveau des doublons → `donnees/resultats/doublons-niveau.json` |
| `scripts/verifier-beebs-fmpq.mjs` | précisions Beebs sans numéro et questions déjà existantes |
| `scripts/synthese.mjs`, `scripts/analyser-moteur.mjs`, `scripts/analyser-moteur-sujets.mjs`, `scripts/tables-ecarts.mjs` | agrégats et tableaux |
| `scripts/ecarts-photos.mjs`, `scripts/exif-tous.mjs`, `scripts/exif.mjs`, `scripts/exemple-paire.mjs` | grands écarts, orientation EXIF, détail d'une paire |
| `scripts/pipeline.sh` | enchaîne vérification des absents → préparation → rejeux → synthèse |

Définitions SQL lues en prod (`pg_get_functiondef`) : `defs/*.sql`. Requêtes envoyées : `sql/`.
Aucun fichier image n'a été gardé : seules les empreintes sont écrites (`donnees/B/`).
