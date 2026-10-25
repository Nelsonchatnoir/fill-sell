# Champs requis — « zéro question à l'utilisateur » : diagnostic et plan (25/10/2026, lecture seule, base lue à 18:44, heure de Paris)

Demande de Nico (25/10 soir, « moins urgent ») : matière, âge, pointure, taille — l'app les déduit seule et ne pose une
question qu'en tout dernier recours. Rien n'a été écrit (ni dépôt, ni base) pour ce diagnostic. P = prouvé, S = supposé.

## 1. Les 5 cas du jour
1. **Sandra (van-breugel.sandra, 9148e867) — Beebs « Matière »**. Fiche 1792931301953 « Bloomables by Hatchimals Kittyfly –
   Jouet interactif – Neuf » (relevé Leboncoin : état et marque seulement). Rayon Jeux, jouets et loisirs › Jeux d'éveil ›
   Jouets électroniques pour bébé ; liste : Plastique, Bois, Caoutchouc, Tissu, Carton, Autre. DEUX questions en 19 s : 13:48:29,
   « Matière » partagée en texte libre (elle tape « PLASTI ») ; 13:48:39, « Matière » Beebs (hors liste) → « Plastique » ; publié
   (9c6487a8). Pourquoi (P) : rédaction sans photo (generate_listing, 0 image) + consigne Beebs « matière : null si non
   déductible » → copie vide. La Matière est un champ PARTAGÉ, et l'enrichissement (texte, mémoire, apprises) est sauté pour ces
   champs (ListingPreviewScreen.jsx, vers l. 9073) ; aucune règle de rayon ni levier IA pour elle ; la question partagée est un
   champ texte (vers l. 3394) face à une liste fermée. Sur le même article, l'Alimentation a été posée seule (« Avec pile »,
   `_shared/alimentation-beebs.js`) : le mécanisme existe.
2. **Sandra — Beebs « Âge »**. Fiche 1792931123507 « Antidote Magazine n°25 » (magazine de mode pour adultes), rayon … › Livres ›
   Autres livres ; 10 tranches dont « 16 ans et + ». Question à 13:49:48 → « 16 ans et + » en 14 s ; publié (714d0a58). Pourquoi
   (P) : consigne Beebs « âge null hors jouets » ; fiche sans `attributs.age` ; `champDeductibleDuTexte` exclut l'Âge (même
   « dès 3 ans » rend null) ; levier IA L4 en « fantôme » depuis le 18/10 (jamais posé) et il a rendu null. Serveur : « Âge
   Beebs : aucune déduction » hors PEGI écrit — décision du 25/09 (`src/utils/jeuxVideo.js`).
3. **chaouidz (sos.cuisine.valenciennes, 90ace0e4) — eBay « Matière »**. Fiche 1792837509018013 « chausson souris couleur grise
   bebe 3/6mois » (import Vinted, aucune matière écrite) ; catégorie 147285 Bébé : chaussures (choisie à la main) ; aspect requis
   « Matière de la couche extérieure », texte libre, 53 suggestions. Réponse « synthétique » ; publié (6c44aa18). Pourquoi (P) :
   consigne eBay « null si non déductible » ; `ebay_aspects_ia` à 13:50:20 → « restants » (« ne JAMAIS inventer »,
   `_shared/ebay-aspects-ia.ts`) ; aucun défaut pour un aspect libre (seul le MPN en a un). Télémétrie fausse : « retiree », car
   la catégorie journalisée est le type de la fiche (« Mode ») comparé à l'id eBay (vers l. 9468 / 9499).
4. **Marta (mele.marta, ac19c8c9) — Leboncoin « Pointure »**. Fiche 1792826989406002 « Scarpe da nike Runallday » (Vinted 2648 ;
   taille « 37.5 » capturée le 24/10 à 10:41:55 ; description « Taglia 37.5 ») ; grille Leboncoin de 16 à 50, « 37,5 » comprise.
   12 « Pointure » + 2 « Size » affichées du 24/10 11:43 au 25/10 07:12 : 11 abandons, 1 publication partie sans Leboncoin.
   Pourquoi (P) : (a) copie rédigée SANS les champs de la fiche → copie Leboncoin sans taille, et l'écran ne relit la fiche que
   pour Opla (`genericKnownSource`) → « Size » ; (b) sa réponse « EU 37.5 » jugée hors liste → « Pointure ». Leboncoin ne pouvait de
   toute façon pas partir : adresse hors de France. Déjà corrigé : « EU N » = « N » (2ac9148, 25/10 01:07) ; Leboncoin hors de
   France décoché sans question (8cfd98c, OTA 2.9.116) et refusé à la création (migration 20261025181500). Restent : la fiche lue
   au jugement, et la pointure lue dans le texte (« Taglia 37.5 » sur une copie vide → rien aujourd'hui).
5. **Johan (tiblancdeshaut, 7b9d8a71) — « Taille » Vinted (Doudounes) + Beebs (Vestes femme)**. Fiche 1792909660810 « Doudoune
   noire puffer » The North Face, née du Lens à 07:27 ; UNE question pour les deux, « S » en 5 s. Pourquoi (P) : Lens sans taille
   estimée, titre et description muets — rien à déduire : vrai dernier recours (S : sauf une étiquette visible sur une photo).
   7 jours chez lui : 38 questions Beebs (27 articles) + 14 Vinted (10). Parc : 48 des 107 scans Lens « mode » sans taille.

**Valeurs FAUSSES en ligne nées d'une question (P)** : chaouidz, « Adidas Torsion… Pointure 31 » (fiche EU 31) → « 16 » choisi en
9 s, publié sur Leboncoin 3294638238 et Beebs 34229052 ; louis-seller : 27 livres Beebs en « 8 ans - 12 ans » (romans pour adultes
compris) ; matières tapées « PELUCHE », « Peluche polyester » (devenues « Autre »).

## 2. Où se décide la question (P) — écran « Publier » ET lot (le lot monte ListingPreviewScreen en « pilote »)
- Champs partagés taille / couleur / matière / marque : `missingSharedFieldsDetailed`, dus dès que le catalogue les exige, jugés
  sur la COPIE seule ; saisie en texte libre.
- Champs des rayons : `genericRequiredStatus` → `genericKnownSource` (la copie ; la fiche seulement pour la taille Opla et l'Âge
  Beebs) → `jugerValeurContreListe` (`moteur/listes.js` : childSizes, tailleDansGrille, pointureNuePourEu, tailleDeduiteDuTexte →
  `_shared/taille-du-texte.js` « ⛔ jamais une pointure ») → pré-remplis → « missing ».
- Puis : univers Leboncoin de la fiche → `deduireOptionDuTexte` (Alimentation Beebs ; Âge exclu) → mémoire compte × rayon →
  déduction apprise (allumée pour eBay Département seulement) — rien de tout cela pour un champ partagé. IA : resolve_aspects ;
  leviers (Leboncoin Support actif ; Univers, Produit et Beebs Âge en fantôme) ; eBay : `gardeAspectsEbay` (MPN, Département,
  liste à 1 valeur), `ebay-aspects-ia.ts`. Couleur : `moteur/couleurAuto.js` (connue → IA photo → « Multicolore », jamais de
  question) = le modèle à suivre.
- Rédaction (`_shared/redaction-plateformes.ts`) : matière, âge, taille « null si non déductible » ; seule la fiche passée AU
  MOMENT de la rédaction est recopiée ; la rédaction de Sandra est partie sans photo.
- Extension : `beebs.js` — Matière : repli « Autre » seulement si une valeur arrive ; Âge posé seulement si `fields.age` ;
  sinon question. `leboncoin.js` : pointure = `fields.taille` sans « EU ».
- Ordre réel : personne → copie (IA + fiche du moment) → fiche (Opla, Âge Beebs) → grille → texte (hors pointure, âge, champs
  partagés) → mémoire → apprises → IA (Âge en fantôme) → question.

## 3. Ampleur sur 7 jours (18/10 19:44 → 25/10 18:44)
418 questions affichées, 26 comptes : 190 levées par la personne, 70 par le moteur, 45 abandons, 113 sans issue comptée. Jobs en
attente sur ces champs : 6 — la friction est dans l'app, avant le job. Les 4 champs : 273 affichages (65 %), 204 articles, 21 comptes.

| plateforme · champ | affichées | articles | comptes | abandons | jamais publiés ensuite (dont abandons jamais repris) |
|---|---|---|---|---|---|
| Beebs · Taille | 135 | 114 | 11 | 16 | 71 (15) |
| Beebs · Âge | 52 | 52 | 6 | 3 | 8 (3) — 34 livres, 9 jeux vidéo, 4 DVD/VHS |
| Vinted · Taille | 25 | 22 | 7 | 3 | 6 (3) |
| Leboncoin · Pointure | 17 | 5 | 4 | 11 | 1 (1) — dont Marta 12 |
| eBay · Taille | 17 | 17 | 6 | 2 | 3 (2) |
| Beebs · Matière | 11 | 9 | 3 | 4 | 3 (3) |
| eBay · Matière | 8 | 7 | 5 | 1 | 4 (1) — dont 7 faux « retiree » |
| Leboncoin · Taille/Size | 5 | 4 | 3 | 0 | 1 (0) |
| Beebs · Pointure | 3 | 3 | 3 | 0 | 1 (0) |

Beebs Taille (S) : 65 des 118 articles avaient la taille sur la fiche (Vinted, avant les correctifs jeans des 23-24/10) ; 11 bijoux
(grille de bagues en mm).

## 4. La règle proposée (tous les comptes ; écran, lot, serveur)
« Un champ requis vide se REMPLIT ; il n'est demandé que s'il dit l'article lui-même et qu'aucune source ne le porte. » Une seule
chaîne, pure, partagée app / serveur : 1 la personne (jamais recouverte) → 2 la FICHE lue au jugement (capture, Vinted, relevé,
manuel, Lens) puis les autres copies, traduites dans la grille → 3 le texte du vendeur → 4 la règle du rayon → 5 l'IA avec photos
(une entrée de la liste, une fois par article × champ) → 6 le bac de la grille quand il est vrai (« Autre », « Ajustable »,
« Taille unique ») → 7 question : une seule pour toutes les plateformes, liste fermée, rien de pré-coché. Toute valeur déduite se
voit (« déduit de… »), se change, est tracée et n'écrit jamais la fiche.
- **Matière Beebs** (10 rayons, même liste) : fiche / copies (Coton, Polyester… → Tissu ; Silicone → Caoutchouc) → mots du texte
  (« en bois », « peluche », « Playmobil ») → rayon : Figurines, Jouets électroniques, Voitures, Jouets de bain → Plastique ;
  Peluches, Doudous → Tissu ; Jouets en bois → Bois ; Puzzles → Carton ; Jeux de formes, Montessori → IA photo → « Autre ».
  (Annonces publiées sur 90 j : Figurines Plastique 15/17, jouets électroniques 2/2, Voitures 4/7, Doudous Autre 11/20, Puzzles Carton 2/3.)
- **Matière eBay** (37 catégories l'exigent, toutes en texte libre) : fiche / copies → composition écrite (« 100 % coton ») → IA
  photo (matière dominante, parmi les suggestions) → repli à décider ; jamais demandée sur une catégorie provisoire.
- **Âge Beebs** : fiche → texte (« dès 3 ans », « 3+ », « 0-6 mois », « à partir de 18 mois », PEGI/USK écrit) → rayon : livre,
  magazine, film ou jeu pour adultes → « 16 ans et + » ; PEGI connu → tranche ; jouet → IA photo (âge sur la boîte) → défaut du
  rayon. Seule question restante : un jouet sans aucun indice et sans défaut validé.
- **Pointure** (Leboncoin, Beebs, Vinted, eBay) : « EU N » = « N » (fait) → fiche lue au jugement → texte (« pointure 31 », « P31 »,
  « taille 40 » sur un rayon chaussures, « Taglia 37.5 », « EU 42 ») : UNE option exacte, demi-pointure jamais arrondie ; UK/US,
  deux pointures ou public incohérent → question.
- **Taille des vêtements** : fiche lue au jugement partout (pas seulement pour Opla) ; règles existantes ; bijoux Beebs autres que
  les bagues → « Ajustable » ; Lens : lire l'étiquette ; sinon (cas de Johan) UNE question, posée au scan.
- Fichiers : nouveaux `_shared/matiere-du-rayon.js` et `_shared/age-du-rayon.js` (modèle : `alimentation-beebs.js`) ;
  `_shared/taille-du-texte.js` (pointure) ; `moteur/listes.js` ; nouveau `moteur/matiereAuto.js` (modèle : `couleurAuto.js`) ;
  `ListingPreviewScreen.jsx` (fiche lue par `genericKnownSource` et le jugement des champs partagés ; enrichissement des champs
  partagés ; question Matière en liste fermée ; eBay après la catégorie finale ; télémétrie) ; `redaction-plateformes.ts`,
  `ebay-aspects-ia.ts` ; serveur : get-pending-jobs (pose au départ, filet pour les anciens clients) + `questions-tranchees.ts` ;
  filet `beebs.js` (« Autre » sur une Matière requise vide).
- Selftests à écrire : matiere-du-rayon, age-du-rayon, pointure-du-texte, taille-de-la-fiche, matiere-auto,
  question-partagee-liste-fermee ; rejeu des 273 questions de la semaine + 90 jours d'annonces publiées (0 valeur changée).

## 5. Décisions de Nico
1. Matière Beebs : table par rayon + repli « Autre » (la question disparaît).
2. Matière eBay sans source : IA photo « dominante probable » ? Quel repli (le champ accepte tout ; une matière fausse peut finir
   en litige) ?
3. Âge Beebs : « 16 ans et + » pour les livres, magazines, films et jeux pour adultes, PEGI connu de l'IA, défauts pour les
   jouets — renverse la décision du 25/09 ; activer le levier L4 sans attendre la fin de son fantôme ?
4. Pointure lue dans le texte : lève le « ⛔ jamais une pointure » de la règle du 19/10.
5. Bijoux Beebs autres que les bagues → « Ajustable ».
6. Taille sans aucune source (Lens sans étiquette) : la demander au scan ?
7. Valeurs fausses en ligne (script de réparation, jamais à la main) : chaouidz (16 au lieu de 31 : Leboncoin 3294638238, Beebs
   34229052) ; louis-seller (27 livres Beebs en « 8 ans - 12 ans »).
