# Lot 3 — Audit « champs déduits » (lecture seule, 17/10/2026 ~18:00 Paris)

Périmètre : dépôt `C:\Users\nicol\fill-and-sell` à `e1e8cef` (web `2026-10-17T13:56:07Z+e1e8cef`, OTA 2.9.98), base prod `tojihnuawsoohlolangc` (SELECT seulement). Aucun fichier édité, rien déployé. Deux bancs Node purs ont été lancés dans le scratchpad sur les modules du dépôt (`test-juger.mjs`, `test-taille.mjs`, `test-child.mjs`, `test-deco.mjs`) pour prouver le comportement des fonctions — ils n'écrivent rien.

## 0. Ce qu'il faut retenir (10 lignes)

1. **Tous les blocages `champ_requis_bloquant` naissent dans l'APP** (stepper et lot : même moteur, `ListingPreviewScreen` monté en `pilote` par `src/publication/lot/LotPublication.jsx:35,173`), AVANT la création du job. Aucun job Beebs `needs_user` des 14 derniers jours ne porte un champ Taille/Âge : les 3 seuls sont « Connexion Beebs requise » (SQL § 2.3).
2. **Taille Beebs (152 lignes / 131 articles / 9 comptes, 119 le seul 14/10)** : 123 des 131 articles AVAIENT une taille sur la fiche. La fiche porte la taille **dans le vocabulaire de la plateforme d'origine** (« 9-12 mois / 74 cm », source `vinted_liste`, 7 935 fiches en 30 j) ; le moteur ne la traduit JAMAIS vers le libellé Beebs (« 12 mois (74-80 cm) ») avant de poser la question. Prouvé au banc : `jugerValeurContreListe` (`src/publication/moteur/listes.js:223`) refuse « 9-12 mois / 74 cm », « 9 mois », « 6 ans », « Taille unique », « EU 40 », « M », « 34 - XS » contre la grille Beebs bébé (`bloque: true`, aucune suggestion) ; seule l'écriture exacte « 9 mois (67-74 cm) » passe. La table qui SAIT traduire (`src/utils/childSizes.js:31-78`) n'est appelée qu'à l'insert du job (`src/utils/resolutionPublication.js:1469-1474`), APRÈS la question, et n'accepte que la forme canonique (« 9 mois »), jamais un libellé Vinted (`parseChildSize` rend `null` sur « 9-12 mois / 74 cm », banc `test-child.mjs`).
3. **Univers Leboncoin (113)** : 80 lignes le 11/10 (lot de Louis, AVANT le correctif A10 `e14ae19` du 11/10 soir). Depuis le 12/10 : 23 lignes, dont 16 le 17/10 sur **Maison & Jardin > Décoration** (ce n'est pas un genre : « Déco murale … » n'est pas rapproché de « Décoration murale » par `deduireOptionDuTexte` — banc `test-deco.mjs` — et la seconde passe IA le pose 3 à 10 s après : 31 des 113 « affiche » sont complétés en < 15 s).
4. **Produit Leboncoin (55)** : 35 complétés en < 15 s = la seconde passe IA (`lbc_champs_ia`, 46 appels/7 j, 10 posés sur 12 le 17/10). La télémétrie générique « affiche » **ne retient pas** la ligne pendant que l'IA générique est en vol (contrairement à la couleur et à eBay : `ListingPreviewScreen.jsx:8915-8919, 8937`) : ~35 lignes sur 55 sont un artefact de mesure.
5. **Couleur Vinted (65), Couleur eBay (37), Marque Vinted (24), Marque Beebs (11), Marque eBay (17)** : **toutes les lignes sont du 10 et 11/10**, avant `f7750bb` (couleur auto) et `sansMarqueDOffice` (11/10). **0 ligne depuis le 12/10.** Ces trous sont fermés ; la fenêtre de 7 jours les montre encore.
6. **Âge Beebs (22 / 18 articles / 11 comptes)** : la fiche porte `attributs.age` sur 129 fiches (toutes `releve_beebs`) et **l'app ne la lit nulle part** (aucun `attributV("age")`, aucun `attributs.age` dans `src/`) ; seule la REPUBLICATION la reprend côté serveur (`get-pending-jobs/index.ts:5200-5207`). Sur une publication neuve, l'âge vient de la rédaction IA (liste fermée dans le prompt Beebs, `_shared/redaction-plateformes.ts:89`) sinon question — « Affaire Kennedy » et « The grand louvre » avaient « 16 ans et + » sur la fiche et ont été demandés.
7. **Recopie plateforme → plateforme (b)** : elle n'existe QUE via la fiche (`inventaire.attributs.<champ> = {v, source, at}`) : sync Vinted (`vinted_liste`/`vinted_detail`/`capture`), relevés (`releve_<plateforme>` par `fiche_completer_depuis_annonce`, migration `20261004093000:236-238`, **champs vides seulement**), Lens, manuel. La fiche → copies passe par `canonical_fields` (`ListingPreviewScreen.jsx:6150-6164, 6214-6221`) et `redaction-plateformes.ts:626-633` (répliqué TEL QUEL, sans traduction). Il n'existe **aucun lecteur « libellé plateforme → canonique »** : c'est le chaînon manquant.
8. **Mémoire par compte** : elle existe pour Opla (catégories), Vinted (colis par rayon, marques retenues), Leboncoin (poids par tranche, `new_item_type`, transporteurs, adresse) — **jamais pour Univers, Produit, Taille, Âge, Couleur, Style, Longueur**. Aucune mémoire « par compte ET catégorie » générique.
9. **IA** : Haiku 4.5 partout ; `generate_listing` ≈ 2,65 appels, ≈ 8 700 tokens d'entrée et ≈ 0,011 $ par article (912 articles / 7 j, 9,74 $) ; `resolve_categorie` 3 689 appels / 7 j (4,58 $, ~3 par article, plafond par palier 300/900/2 000/4 000 par 24 h, **sans cache**) ; seul `lens-analysis` identify a un cache (24 h). Aucune IA à l'import ; tout se paie à la publication, article par article, sans regroupement.
10. **ops-digest** ne couvre pas « une plateforme ajoute un champ obligatoire » : 21 sections, aucune ne lit `platform_category_aspects` ni `source = 'server_400'`.

---

## 1. Cartographie champ par champ

Conventions : **Demandé** = où la question apparaît à la personne ; **Déduit** = étape et source ; **Liste officielle** = d'où vient la liste des valeurs. `LPS` = `src/components/ListingPreviewScreen.jsx`, `GPJ` = `supabase/functions/get-pending-jobs/index.ts`.

Journalisation commune (app seulement) : `LPS:8863-8868` (`usage_logs.feature = 'champ_requis_bloquant'`, `metadata = { issue: affiche|complete|abandonne|retiree|bloque_au_clic|publie_sans_plateforme, champs: [libellé], platform, categorie, inventaire_id, partage?, complete?, categorie_encart?, categorie_apres? }`) ; boucle « affiche » `LPS:8895-8968` (générique 8916-8931, eBay 8936-8948, partagé 8954-8967), « abandonne » 8984-8989, « bloque_au_clic » 9707 / 10155, « publie_sans_plateforme » 10478.

### 1.1 Univers Leboncoin (`clothing_type`, `shoe_type`, `*_univers`, `house_and_garden_type`…)
- **Demandé** : app, encart requis générique (`genericRequiredStatus`, `LPS:8434+`, ligne `state:"missing"|"invalid"` avec `dedicatedTarget:"univers"` `LPS:8419` ; « Produit attend son Univers » 8640-8647) ; extension au dépôt : `chrome-extension/content-scripts/leboncoin.js:3282-3309` (`LBC_PSEUDO_FIELDS.univers`, `needsUserField` avec `allowed_values` relevées), remplissage `fillUnivers(fields.univers || fields.genre)` 2845-2846 / 4436.
- **Déduit** :
  - app, à l'écran Publier : `universLbcDeLaFiche` (`src/publication/moteur/champsLbcAuto.js:53-75`, appelé `LPS:8696-8707`) — genre des copies / fiche, racine du chemin Vinted (`attributs.categorie_vinted.chemin` ou `edited.vinted.platform_fields.categoryPath`), taille enfant, mot du titre ; sources contradictoires = rien ; valeur exacte de la liste. Puis `deduireOptionDuTexte` (`listes.js:63-69`, `LPS:8708`), paire Maison & Jardin (`LPS:8713-8726`), seconde passe IA (`champsLbcSecondePasse` `champsLbcAuto.js:107-124`, effet `LPS:9211-9289`, `generate-listing` mode `resolve_aspects`, trace `lbc_champs_ia`).
  - serveur, au service du job : `GPJ:9754-9799, 10089-10128` — synonymes (`Fille/Garçon/Bébé → Enfant`…), racine Vinted des jobs frères, taille d'âge → `Enfant` ; **Mode > Vêtements et Mode > Chaussures seulement**.
- **Liste officielle** : `platform_category_aspects` (platform `leboncoin`, 292 lignes / 35 rayons, `source = 'dom'` ou `'server_400'`, `last_seen_at` 17/10 15:55) — ex. `Mode > Vêtements / clothing_type` = `Femme | Maternité | Homme | Enfant`, `Maison & Jardin > Décoration / house_and_garden_type` = 6 valeurs ; listes dépendantes Maison & Jardin dans `src/utils/lbcMaisonJardin.js`.
- **Pas de mémoire par compte.**

### 1.2 Produit Leboncoin (`decoration_type`, `*_product`, `clothing_category`, `baby_clothing_category`)
- **Demandé** : app (`LPS:8640-8650`, bloquant dès que l'Univers est posé) ; extension `leboncoin.js:3284` (`LBC_PSEUDO_FIELDS.produit` → `lbcProduit`).
- **Déduit** : app — texte (`LPS:8708`), paire « Type › Produit » (`lbcPaireDepuisTextes`, 8713-8726), seconde passe IA « Univers et produit » (`LPS:9225-9228, 9266-9278`) ; serveur — uniquement `Décoration + Univers « Autre » → « Autre »` (`GPJ:10212-10220`).
- **Liste officielle** : `platform_category_aspects` + `lbcMaisonJardin.js` (listes dépendantes relevées le 07/09).
- **Mémoire** : aucune.

### 1.3 Taille Beebs (`Taille` / `Pointure`)
- **Demandé** : app — ligne générique Beebs `state:"invalid"` bloquante (`LPS:8557-8565`, `jugerValeurContreListe` + `horsListeBloque`) ou question partagée « Taille · Beebs » quand la copie n'en porte aucune (`missingSharedFieldsDetailed`, `LPS:8954-8967`, `partage:'taille'`) ; extension — `beebs.js:1659-1909` (`needsUserField`, cible `BEEBS_DEDICATED_TARGETS` 1669-1678, liste relevée sur le panneau) ; serveur — `handler-watch` répond seul aux questions de taille qu'il sait trancher (`_shared/taille-question-auto.js`, `handler-watch/index.ts:4391-4417`).
- **Déduit** :
  - fiche → copie : `src.taille = tailleDiteSurLaFiche() ?? …` (`LPS:6150`, sources `capture|vinted|releve|manuel`, `LPS:4879-4883`) → `canonical_fields.taille` (`LPS:6215`) → `redaction-plateformes.ts:626-633` (valeur recopiée telle quelle sur vinted/beebs/leboncoin/ebay) ;
  - jugement à l'écran : `listes.js:223-250` = exact (`normAspectVal`) → `tailleDansGrille` (`_shared/tailles.js`, R0 : orthographe, pays, W lu, étiquette composite) → composant d'étiquette à tiret (`34 - XS`) ; **aucun passage par `childSizes.js` ni par `taille-de-service.js` (R1-R4)** ;
  - insert du job : garde des tailles inventées (`resolutionPublication.js:1452-1461`, `src/utils/tailleInventee.js`) puis `toPlatformChildSize` (`resolutionPublication.js:1469-1474`, `childSizes.js:172-195`) — canonique seulement ;
  - serveur : re-épellation exacte (`_shared/beebs-valeurs.ts`, `GPJ:8600-8654`) ; `tailleBeebsDeLaFiche` **seulement si le job n'a AUCUNE taille** (`GPJ:5149-5169, 5224-5231`, `_shared/beebs-taille-de-la-fiche.js:31-46` : exact, puis `tailleDeService` R1-R4) ; arbitrage IA `resolve-categorie` mode listes éteint pour toute extension ≥ 0.6.21 (`GPJ:287, 8677-8678`) ;
  - extension : cascade `tailles-vocabulaire.js` (copie générée de `tailles.js`), valeur neutre « Taille unique » si la copie n'a RIEN (`beebs.js:1630-1657`), sinon `needsUser`.
- **Liste officielle** : `platform_category_aspects` platform `beebs` (920 lignes / 188 rayons, `source = 'dom'`, relevé 17/10 14:34 ; grille bébé = 20 valeurs « 3 mois (54-60 cm) … 16 ans (164-176 cm) ») ; au dépôt, la liste VIVANTE du panneau.
- **Mémoire** : aucune (par compte ni par catégorie) ; le lot regroupe seulement les questions identiques (`src/publication/lot/regles.js:396-407`, même plateforme + champ + liste ≤ 60 → une réponse pour plusieurs articles).

### 1.4 Âge Beebs (`Âge`)
- **Demandé** : app — ligne générique Beebs `Âge` manquante (`genericKnownSource` → `pf.age`, `LPS:8349`) ; carte Beebs champ `age` select (`LPS:1022`, options 831-835) ; extension `beebs.js:1755-1776` (note « tranche d'âge de l'ENFANT », liste relevée ; champ posé 1424-1432).
- **Déduit** : rédaction IA (`redaction-plateformes.ts:89`, liste fermée de 10 tranches, `null` hors enfant) ; `resolve_aspects` générique Beebs (`LPS:8992-9167`) sauf JEU VIDÉO : classement PEGI/USK écrit (`generate-listing/index.ts:472-484`, `src/utils/jeuxVideo.js:420-431`, fiche `attributs.classement_age` `LPS:9824-9832, 10464`) ; serveur **republication seulement** (`GPJ:5195-5207`, `_shared/beebs-age-releve.js:66-78`).
- **Jamais lu** : `inventaire.attributs.age` (129 fiches, 100 % `releve_beebs`) sur une publication neuve.
- **Liste officielle** : prompt + `LPS:831-835` (relevé Figurines 09/07) + `platform_category_aspects` (`Âge`, `source dom`).
- **Mémoire** : aucune.

### 1.5 Couleur Vinted (`color`)
- **Demandé** : plus jamais depuis le 11/10 (`moteur/couleurAuto.js`, effet `LPS:9291-9369`) ; la télémétrie retient la ligne tant que la couleur auto n'a pas fini (`LPS:8915`). Avant : question partagée / ligne générique. Extension : `vinted.js:4103-4118, 8395-8402` (republication : couleur de l'annonce d'origine, `needs_user` si introuvable).
- **Déduit** : copie / fiche (`attributs.couleur`, 10 509 fiches) / Lens → palette (`couleurConnue`, `couleurAuto.js:115-128`) ; sinon IA photo `resolve_couleur` (`_shared/couleur-ia.ts:140-201`, Haiku 4.5, 1-2 photos, 60 tokens de sortie, délai 6 s) ; sinon « Multicolore » (`repliCouleur` 191-197). Serveur : filet `_shared/vinted-couleur-marque-filet.js` (`GPJ:9314+`) et `couleurParArticle` pour Leboncoin (`GPJ:10130-10137`).
- **Liste officielle** : palette Vinted complète (29, `src/utils/vintedColors.js`), forcée sur toute ligne `color` (`avecPaletteVintedComplete`, `couleurAuto.js:63-66`) parce que le relevé `platform_category_aspects` était tronqué à 20.
- **Mesure** : 65 lignes, **toutes du 10-11/10** ; 0 depuis le 12/10 ; `couleur_auto` 31 appels / 7 j, 7 comptes, 0,10 $.

### 1.6 Couleur eBay (`Couleur`, `Couleur de la monture`, `Couleur extérieure`)
- Même moteur que 1.5 (`ASPECTS_COULEUR_EBAY = EBAY_ASPECT_LABELS.couleur`, `champsPartages.js:262`) ; correspondance palette → liste eBay (`FAMILLE_EBAY`, `couleurAuto.js:133-163`, `couleurPourPlateforme` 174-188 : liste fermée sans entrée → `null`, `SELECTION_ONLY` respecté). Liste officielle : aspects eBay par catégorie (`fetch-ebay-aspects`, `ebayRequiredStatus` avec `mode` et `allowedValues`).
- **Mesure** : 37 lignes, 1 compte, 6 articles, **toutes le 10/10** ; 0 depuis.

### 1.7 Marque (toutes plateformes)
- **Demandé** : question partagée « Marque · <plateforme> » (`LPS:8954-8967`) ; aspect eBay « Marque » ; extension Vinted « marque hors catalogue » (`vinted.js:6635-6763`, `needsUserField`) ; Beebs/Leboncoin saisie à la pose.
- **Déduit** : Lens (marque lue, `lens-analysis`) ; rédaction IA (« marque exacte si déductible, sinon null ») ; `comblerMarquesVides` depuis la fiche (`moteur/reponsesPartagees.js:353-367`, `marqueDeLaFiche` 330-334, appelé `LPS:4990-4991`) ; `sansMarqueDOffice` (`reponsesPartagees.js:484-496`) ; réponse rangée sur la fiche `attributs.marque_vinted` (`attributMarqueVinted` 523-527, `appliquerMarqueVintedArticle` 505-519) ; serveur `appliquerMarqueRetenue` (`_shared/marque-absente.js`, `GPJ:9286-9312`, `platform_settings.vinted.marques_retenues`), `_shared/vinted-marque-par-id.js` (republication par identifiant, `BUILD_VINTED_MARQUE_PAR_ID`), `_shared/marque-depop.js` ; eBay : « texte libre, JAMAIS de liste au modèle » (`ebay-aspects-ia.ts:270`) puis recalage sur la liste complète ; 17/10 (`e1e8cef`) : une marque hors relevé reste la sienne, jamais rapprochée (`LPS:8568-8571`, `listes.js:247-248`).
- **Liste officielle** : référentiels à recherche (Vinted ~ milliers, Beebs ~1 400) — le relevé `platform_category_aspects` est coupé à 60/200 donc **ne fait jamais foi** (`champARecherche`, `listes.js:89-93`).
- **Mesure** : Vinted 24 (22 le 10/10), eBay 17 (10/10), Beebs 11 (10/10) ; **2 lignes depuis le 11/10**.

### 1.8 Style eBay et 1.9 Longueur (de la robe) eBay
- **Demandé** : encart eBay (`ebayRequiredStatus`, `aspectBloquant`), tracé `LPS:8936-8948` seulement quand l'IA de la catégorie a fini (`ebayIaFiniePour`) ; `bloque_au_clic` `LPS:10155`.
- **Déduit** : `aspectsADemanderIa` (`moteur/aspectsEbayAuto.js:180-185`, une demande par aspect ET catégorie, appel `LPS:7895-7937` → `generate-listing` `resolve_aspects` → `completerAspectsIA` (`_shared/ebay-aspects-ia.ts:455-484`) : 1re passe liste (`resoudreAspectsIA` 297-373, Haiku 4.5, `max_tokens` 500), 2e passe « un aspect par appel, mot RECOPIÉ du titre » (`libre:"titre"`, 274) contrôlée par `valeurLueDansLeContexte` (438-444) ; défaut déterministe MPN (241-243) ; `valeursAutoAReprendre` au changement de catégorie (200-213). Voie API : `_shared/ebay-publication.ts` (`remplirAspects`).
- **Liste officielle** : aspects eBay (API Taxonomy) avec `mode` `SELECTION_ONLY | FREE_TEXT`.
- **Mesure** : Style 10 lignes / 7 articles / 4 comptes (IA restants 8) ; Longueur de la robe 12 / 8 / 4 (IA restants 15 sur 5 comptes — rien dans le texte ne la dit, aucune lecture photo pour cet aspect) ; `ebay_aspects_ia` 200 appels / 34 comptes / 7 j.
- **Mémoire** : par écran seulement (`dejaDemandes`), jamais par compte.

---

## 2. Recopie (b) depuis une annonce en ligne — plateforme par plateforme

### 2.1 Le seul canal : la fiche (`inventaire.attributs`)
Il n'y a **aucune recopie directe copie-à-copie entre plateformes**. Tout passe par la fiche :

| Source → fiche | Où | Champs | Condition |
|---|---|---|---|
| Vinted (sync dressing / détail / capture de republication) | `chrome-extension/background.js` (sync), `vinted_republish_captures` | `taille` (`vinted_liste` 23 272 fiches/30 j, `vinted_detail` 223, `capture` 2 000), `etat`, `marque`, `couleur`, `categorie_vinted` (805 fiches seulement ; `vinted_catalog_id` colonne : 3 223) | la base refuse qu'une lecture IA écrase une valeur Vinted/saisie (trigger de fusion) |
| Beebs, eBay, Leboncoin, Opla, Depop (relevés) | `annonces_plateforme.capture` / `donnees_index` (extension + `releve-completer`), SQL `fiche_completer_depuis_annonce` (`supabase/migrations/20261004093000_releve_reprend_toute_l_annonce.sql:183-185, 236-238`) | `description, marque, categorie→type, etat, taille, couleur, matiere, age` | **champ VIDE seulement** (`NULLIF`/absence) : une fiche importée de Vinted garde « 9-12 mois / 74 cm » même quand l'annonce Beebs du même article affiche « 12 mois (74-80 cm) » |
| Lens | `LPS:6173-6195` | `taille, couleur, matiere, etat, genre, isbn, attributs_visibles` (source `lens`, la plus faible) | |
| Personne | Stock, questions | source `manuel` | fait foi |

Fiche → copies : `LPS:6140-6164` (`src.taille = tailleDiteSurLaFiche() ?? …`, `couleur`, `matiere`, `etat`, `isbn`), `canonical_fields` `LPS:6214-6221`, répliqué sans transformation par `redaction-plateformes.ts:626-633` sur `vinted, beebs, leboncoin, ebay` (couleur : pas Leboncoin). Marque : `comblerMarquesVides` (`reponsesPartagees.js:353`). Âge : **absent de cette chaîne**. Genre : `attributs.genre` n'existe que sur 2 fiches.

### 2.2 Matrice source → cible (ce qui arrive réellement sur la copie cible, hors question)

| Champ | Vinted → Beebs | Vinted → Leboncoin | Vinted → eBay | Beebs/LBC/eBay → autres |
|---|---|---|---|---|
| Taille | valeur Vinted telle quelle (« 9-12 mois / 74 cm », « M / 38 / 10 », « EU 40 ») → **jugée hors liste** par `listes.js:223-250` (banc : `dans:false`, `bloque:true` pour toutes les formes sauf l'exacte Beebs) → question. Serveur : `tailleBeebsDeLaFiche` ne joue que si le job n'a **aucune** taille (`GPJ:5149`) et rend `null` sur ces formes (banc `test-taille.mjs`) | valeur telle quelle ; extension `leboncoin.js` remplit la Pointure (Mode>Chaussures) par composants ; `lbcChildSizeCategory` à l'insert (`resolutionPublication.js:1136`) sur canonique seulement | valeur telle quelle ; eBay accepte le libre sur beaucoup de catégories ; sinon `taille-question-auto` côté serveur | relevé → fiche seulement si vide ; republication Beebs : `cap.taille` de l'annonce prime sur la copie (`GPJ:5215-5223`) |
| Couleur | `couleurConnue` → palette → posé (`couleurAuto.js:115-128, 215-230`) ✔ | `couleurParArticle` au service (`GPJ:10130-10137`) ✔ (pas dans la génération) | `FAMILLE_EBAY` → entrée de liste ✔ | ✔ via fiche |
| Marque | `comblerMarquesVides` ✔ ; hors catalogue → question extension puis `marque_vinted` mémorisée sur la fiche ✔ | ✔ | ✔ (aspect « Marque ») | ✔ via fiche (`releve_*` si vide) |
| Matière | ✔ (canonique) | ✔ | ✔ | ✔ |
| État | ✔ mappé (`_shared/etat-plateformes.js`, `redaction-plateformes.ts:637+`) ; LBC : grille exacte au service (`GPJ:10139-10210`) | | | |
| Âge | — (fiche jamais lue) | n/a | n/a | relevé Beebs → `attributs.age` ✔ mais **jamais relu** sauf republication (`GPJ:5200`) |
| Univers LBC | racine `categorie_vinted` (805 fiches/43 250) ou `edited.vinted.categoryPath` quand Vinted est cochée dans le même passage ; **`vinted_catalog_id` (3 223 fiches) n'est pas utilisé** par `universLbcDeLaFiche` | | | serveur : jobs Vinted frères (`GPJ:10100-10117`) ✔ |
| Catégorie | transposition `catalog_vinted` + IA (`resolutionPublication.js`) | idem | idem | relevé → `type` FillSell seulement |

### 2.3 Chaîne BEEBS entière (import → fiche → job → dépôt) et où ça casse

1. **Import** : sync Vinted → `attributs.taille {v:"9-12 mois / 74 cm", source:"vinted_liste"}` (forme Vinted enfant : 7 935 fiches/30 j, dont 7 220 `vinted_liste`, 519 `capture`, 78 `vinted_detail`) ; relevé Beebs d'un article déjà sur Beebs → `releve_beebs` « 9 mois (67-74 cm) » **seulement si la fiche n'avait rien** (migration `20261004093000:236`).
2. **Stepper / lot** : `attributsBase` lu en base (`LPS:5700, 5747`) → `src.taille` (`LPS:6150`) → `canonical_fields` → copie Beebs `platform_fields.taille = "9-12 mois / 74 cm"` (`redaction-plateformes.ts:632`, aucune traduction). Prompt Beebs demande une taille enfant canonique à l'IA (`redaction-plateformes.ts:89`) mais `canonicalProvided` prime (`:626`).
3. **Écran Publier** : `genericKnownSource("beebs","Taille") = pf.taille` (`LPS:8345`) → `jugerValeurContreListe` (`LPS:8557`) → `tailleDansGrille` ne connaît ni la convention Vinted « N-M mois / cm » ni les statures Beebs « (67-74 cm) » → `state:"invalid"`, `blocking:true` (dropdown, 20 valeurs, `listeFaitFoiRelevee`) → **question « Taille » avec la liste Beebs** → `affiche`. **C'EST ICI QUE ÇA CASSE** (`src/publication/moteur/listes.js:231-245` + `LPS:8557-8565`). Banc `test-juger.mjs` : « 9-12 mois / 74 cm » `dans:false bloque:true` ; « 9 mois (67-74 cm) » `dans:true`.
4. **Réponse** : la personne choisit dans la liste (délais mesurés : 18 complétés < 15 s, 67 entre 15 s et 2 min, 32 > 2 min, 35 jamais) ; le lot regroupe les listes identiques (`lot/regles.js:396`).
5. **Insert** : `toPlatformChildSize(pf.taille,"beebs")` (`resolutionPublication.js:1470`) — n'aurait traduit QUE « 9 mois » canonique (banc `test-child.mjs` : `parseChildSize("9-12 mois / 74 cm") = null`).
6. **Service du job** (`GPJ`) : `beebs-valeurs.ts` re-épelle (exact) ; `tailleBeebsDeLaFiche` inactif (le job a une taille) ; IA listes éteinte (≥ 0.6.21).
7. **Dépôt** (`beebs.js`) : cascade `tailles-vocabulaire.js` → même vocabulaire que `tailles.js` → une valeur Vinted enfant ne matcherait pas → `needsUser` « la fiche porte « … », une valeur que Beebs ne propose pas dans ce rayon » (`beebs.js:1857-1870`). (Ce cas n'apparaît pas en base : la question est déjà réglée dans l'app.)

**Exemple réel** (SQL `usage_logs` ⋈ `inventaire`, 14/10 09:27-09:28 Paris, lot d'un compte `vinted_sync`) : `inventaire 1790852582370003` « Pantalon 9 mois », fiche `taille = {v:"9-12 mois / 74 cm", source:"capture"}`, catégorie Beebs `Mode > Bébé > Vêtements (bébé) > Pantalons (bébé)` dont la grille (`platform_category_aspects`, 20 valeurs) contient « 12 mois (74-80 cm) » → `champ_requis_bloquant affiche [Taille] beebs` 09:27:43. Même lot : `1790852581560002` « Body 9 mois », fiche `{v:"9 mois (67-74 cm)", source:"releve_beebs"}` — **l'écriture exacte de Beebs** — et pourtant `affiche` 09:28:37 : la copie Beebs ne portait pas cette valeur (fiche complétée par le relevé APRÈS la génération ou copie générée à partir d'une autre source — la copie « ne suit pas les modifications de la fiche », cf. message `beebs.js:1716`). Les jobs créés à 09:29-09:30 portent bien « 3 mois (54-60 cm) », « 24 mois (86-94 cm) » (réponses de la personne) pour des fiches « 1-3 mois / 56 cm », « 18-24 mois / 86 cm » (`vinted_detail`).

Chiffre : sur les 131 articles bloqués « Taille Beebs » en 7 j, **123 avaient une taille sur la fiche** (sources : `releve_*` 49, `vinted*` 12, `capture`/autres 58, `manuel` 4), 8 n'en avaient pas.

### 2.4 Chaîne LEBONCOIN entière

1. **Import** : fiche = taille (forme Vinted), `categorie_vinted` rare (805), `genre` quasi absent (2), `vinted_catalog_id` 3 223.
2. **Génération** : prompt LBC sans taille (volontaire) ; `canonical_fields` recopiés (`taille, matiere, marque`, pas `couleur`) ; `univers` demandé au prompt LBC (contrat JSON `etat/format_colis/univers/…`, `GPJ:9863`).
3. **Écran Publier** (ordre réel, `LPS:8684-8735`) : (1) `universLbcDeLaFiche` si `dedicatedTarget === "univers"` ET la liste est relevée (`a.allowedValues.length`, sinon rien — `LPS:8687`) ; (2) `deduireOptionDuTexte` titre → objet IA → description (identité : description seule ne décide pas, `LPS:8676-8677`) ; (3) paire Maison & Jardin ; (4) seconde passe IA (`LPS:9211-9289`, une demande par (catégorie, champ, liste), JAMAIS taille/marque/couleur/matière/état `champsLbcAuto.js:100`) ; (5) question. Banc `test-deco.mjs` : « Décoration Murale Colibri … » → « Décoration murale » (titre) ✔ ; « Déco murale Guitare … », « Hibou chouette », « Statuette décoration … » → rien → IA (posé « Décoration murale › Tableau et toile », « Objet décoratif › Bibelot » ; 2 restants sur 12 le 17/10).
4. **Service du job** (`GPJ:9754-10262`) : Univers (Mode seulement), Couleur de la fiche, État mappé, Produit « Autre », mémoire vendeur (`new_item_type`, poids par tranche — rebâtie à chaque poll depuis `needsUserResolved` des jobs passés, `GPJ:10007-10043`).
5. **Dépôt** (`leboncoin.js`) : `fillUnivers(fields.univers || fields.genre)` ; validation LBC → `blockedFields` → `needsUserField` avec options relevées (`:3293-3309`), pseudo-champs univers/produit.

**Où ça casse encore** : (a) Décoration/Sport : « Univers » = famille d'objet ; le rapprochement texte ne gère pas « Déco » ≠ « Décoration », l'IA ne vient qu'en 4e position et la télémétrie compte la ligne avant sa réponse ; (b) Mode : `universLbcDeLaFiche` ignore `vinted_catalog_id` et ne reçoit le chemin Vinted que si la fiche porte `categorie_vinted` (805/43 250) ou si Vinted est cochée dans le même passage ; (c) aucune mémoire « ce compte publie toujours en Univers Femme » ; (d) serveur : Univers déduit seulement sur Mode > Vêtements/Chaussures.

---

## 3. Mémoire par compte (et par catégorie)

Support unique : `profiles.platform_settings` (jsonb), écrit **uniquement** par `rpc platform_settings_fusionner` (`src/utils/reglagesPlateformes.js:26-32`, migration `20261002153000`). Clés présentes en prod (SQL `jsonb_object_keys`) : `extension_jours` 654 comptes, `plateformes_vendeur` 487, `leboncoin` 193, `plateformes_ecartees` 66, `ebay` 39, `vinted` 21, `opla` 13, `alertes_hors_ligne_masquees` 13, `beebs` 6, `depop` 6.

| Mémoire | Clé | Champs | Lue | Écrite | Comptes |
|---|---|---|---|---|---|
| Catégories Opla tranchées | `platform_settings.opla.categories[cle] = {code,titre,options,mot,le}` | catégorie (même liste d'options = même réponse) | `GPJ:10360-10397` | `GPJ:10454-10472` (fusionner) ; oubli : `src/reglages/OplaCategoriesMemorisees.jsx` | 13 |
| Format de colis Vinted par rayon | `platform_settings.vinted.colis_retenus` | colis | `GPJ:3104-3133` (`_shared/vinted-colis.js`), lot `LotPublication.jsx:73-74` | question colis (app, `retenirColisVinted`) | 10 |
| Marques retenues Vinted | `platform_settings.vinted.marques_retenues` | marque (hors catalogue → marque du catalogue) | `GPJ:9286-9312` (`_shared/marque-absente.js`) | question « Marque » (app/StockTab) | 1 |
| Poids / transporteurs / adresse Leboncoin | `platform_settings.leboncoin.{poids_choix, poids_exige, transporteurs, adresse, code_postal, ville, rue}` | poids, port | `GPJ:643-651, 3135+, 8465-8498`, `src/utils/choixPoidsLeboncoin.js` | Réglages, question poids | 8 / 3 / 2 / 192 |
| Adresse eBay | `platform_settings.ebay.adresse_expedition` | | `ebay-account/index.ts:134-146` | Réglages | 39 |
| « Mémoire de vendeur » LBC pro | **pas dans platform_settings** : rebâtie à chaque poll depuis `cross_post_jobs.platform_fields.needsUserResolved` | `new_item_type`, `estimated_parcel_weight` par tranche | `GPJ:10007-10043, 10222-10254` | réponses « ✋ Compléter » | — |
| Réponse « marque hors catalogue » | `inventaire.attributs.marque_vinted {v,de,source,at}` | marque | `reponsesPartagees.js:505-519`, `GPJ` | StockTab (`attributMarqueVinted`) | par article |
| Classement d'âge jeu vidéo | `inventaire.attributs.classement_age` | âge Beebs | `LPS:9824-9832` | `LPS:10464` | par article |
| Verdict IA Beebs | `cross_post_jobs.platform_fields.beebs_ia_valeurs` | listes Beebs | `GPJ:8685, 8749` | idem | par job (éteint ≥ 0.6.21) |
| Demandes IA déjà faites | `lbcSecondePasseFaite` (`LPS:9210`), `dejaDemandes` eBay | | | | par écran |
| Choix de plateformes du lot | `localStorage` (`LotPublication.jsx:78-79`) | | | | par appareil |

**Conclusion** : aucune mémoire « réponse du compte pour cette catégorie » pour Univers, Produit, Taille, Âge, Couleur, Style, Longueur. Les réponses de la personne aux questions de l'app (`champ_requis_bloquant complete`, 366 en 7 j) ne sont rangées que sur la copie du job ; `needsUserResolved` n'est relu que pour `new_item_type` et le poids.

---

## 4. Preuve chiffrée (usage_logs, 7 derniers jours glissants au 17/10 ~18:00 Paris)

Forme réelle de `metadata` (1 090 lignes, feature exacte `champ_requis_bloquant`) : `issue` (1 090), `champs` tableau de libellés (1 090), `platform`, `categorie` (1 090), `inventaire_id` (1 045), `complete` (385), `partage` (154 — question partagée taille/couleur/matiere/marque), `categorie_encart` (22), `categorie_apres` (17). Une ligne = un affichage d'UN champ (`champs` a toujours un élément dans la pratique).

Requête exacte (celle dont les chiffres suivent) :

```sql
SELECT metadata->>'platform' AS plateforme, c AS champ,
       count(*) AS n, count(DISTINCT user_id) AS comptes,
       count(DISTINCT metadata->>'inventaire_id') AS articles
FROM usage_logs, jsonb_array_elements_text(metadata->'champs') c
WHERE feature = 'champ_requis_bloquant'
  AND created_at >= now() - interval '7 days'
  AND metadata->>'issue' = 'affiche'
GROUP BY 1, 2 ORDER BY n DESC;
```

Résultat du jour (`issue = 'affiche'` ; total toutes issues : affiche 621, complete 366, abandonne 40, bloque_au_clic 35, retiree 17, publie_sans_plateforme 4) :

| Plateforme | Champ | n | comptes | articles | Référence 17/10 (Nico) | Par jour (10→17/10) |
|---|---|---|---|---|---|---|
| beebs | Taille | **152** | 9 | 131 | 152 | 14 · 13 · 0 · 0 · **119** · 0 · 4 · 2 |
| leboncoin | Univers | **113** | 9 | 91 | 119 | 10 · **80** · 0 · 0 · 1 · 5 · 1 · 16 |
| vinted | Couleur | **65** | 3 | 12 | 65 | 59 · 6 · 0 · 0 · 0 · 0 · 0 · 0 |
| leboncoin | Produit | **55** | 9 | 45 | 41 | 2 · 19 · 0 · 2 · 0 · 13 · 5 · 14 |
| ebay | Couleur | **37** | 1 | 6 | 43 | 37 · 0 · 0 … |
| vinted | Marque | **24** | 2 | 6 | 26 | 22 · 2 · 0 … |
| beebs | Âge | **22** | 11 | 18 | 21 | 6 · 2 · 0 · 4 · 1 · 1 · 6 · 2 |
| ebay | Marque | 17 | 2 | 3 | | 17 · 0 … |
| leboncoin | Genre | 12 | 4 | 12 | | 0 · 6 · 0 · 0 · 1 · 1 · 4 · 0 |
| ebay | Longueur de la robe | 12 | 4 | 8 | | 6 · 0 · 0 · 1 · 0 · 0 · 5 · 0 |
| beebs | Marque | 11 | 3 | 3 | | 11 · 0 … |
| vinted | ISBN | 11 | 4 | 8 | | 4 · 5 · 0 · 1 · 0 · 1 · 0 · 0 |
| ebay | Style | 10 | 4 | 7 | | 4 · 0 · 0 · 1 · 1 · 0 · 3 · 0 |
| ebay | Matière | 9 | 5 | 8 | | 2 · 0 · 0 · 1 · 0 · 1 · 4 · 1 |
| vinted | Taille | 8 | 6 | 7 | | 1 · 0 · 0 · 2 · 1 · 0 · 2 · 2 |
| ebay | Taille | 7 | 5 | 6 | | |
| leboncoin | Type | 7 | 3 | 6 | | |
| beebs / leboncoin | Pointure | 6 / 6 | 4 / 4 | 4 / 4 | | |

Les écarts avec la référence du matin (Univers 119→113, Couleur eBay 43→37, Marque Vinted 26→24, Produit 41→55) sont la fenêtre glissante (lignes du 10/10 matin sorties, lot du 17/10 15:00 entré).

Délai entre « affiche » et le « complete/retiree » du même (compte, article, champ) — distingue une pose automatique (< 15 s) d'une réponse humaine :

| Champ | affiches | < 15 s | 15 s – 2 min | > 2 min | jamais |
|---|---|---|---|---|---|
| Taille Beebs | 152 | 18 | 67 | 32 | 35 |
| Univers LBC | 113 | 31 | 16 | 59 | 7 |
| Produit LBC | 55 | **35** | 8 | 7 | 5 |
| Âge Beebs | 22 | 11 | 4 | 0 | 7 |

Lecture : Taille Beebs est une vraie friction humaine (99 réponses au-delà de 15 s, 35 jamais) ; Produit LBC est aux deux tiers un artefact (l'IA générique pose la valeur quelques secondes après l'affichage, la télémétrie ne l'attend pas — `LPS:8916-8931` n'a pas l'équivalent de `couleurRetenue` / `ebayIaFiniePour`).

Jobs `needs_user` Beebs des 14 derniers jours (SQL `cross_post_jobs ⋈ inventaire`) : **3**, tous « Connexion Beebs requise », `needsUserField` nul, tailles présentes (« S », « XS / 34 », « 39 »). Aucun job Beebs `needs_user` sur Taille/Âge : le blocage est entièrement dans l'app.

---

## 5. Coût IA (import et publication)

Mesure 7 j (`usage_logs`) :

| feature | lignes | comptes | appels Claude | tokens in | tokens out | USD |
|---|---|---|---|---|---|---|
| `resolve_categorie` | 3 689 | 63 | — | — | — | 4,58 |
| `generate_listing` | 912 | 88 | 2 417 | 7 947 595 | 359 037 | 9,74 |
| `ebay_aspects_ia` | 200 | 34 | 324 | — | — | — |
| `lens_identify` | 59 | 13 | — | — | — | 1,06 |
| `lbc_champs_ia` | 46 | 11 | (compris dans generate-listing `resolve_aspects`) | | | |
| `couleur_auto` | 31 | 7 | 31 | 98 104 | 619 | 0,10 |
| `isbn_auto` | 2 | 2 | 2 | 12 848 | 120 | 0,01 |

Par article (génération) : ≈ 2,65 appels, ≈ 8 700 tokens d'entrée, ≈ 390 de sortie, ≈ 0,011 $. Modèle partout : `claude-haiku-4-5-20251001`.

Où l'IA est appelée et avec quoi :
- **Import** : AUCUN appel IA par article. La sync Vinted (`background.js`), les relevés (`annonces_plateforme`), `releve-completer` (index Beebs / API eBay, cron, 3 comptes Beebs et 200 écritures par passage, `releve-completer/index.ts:28-45`) ne touchent pas l'IA. Seul `rapprochement-ia` (cron, doublons) : 60 questions par appel, 100 s, plafond 1 € par compte et par passage (`rapprochement-ia/index.ts:11-12`).
- **Lens** (`lens-analysis/index.ts`) : identify `max_tokens 1200` (`:1821-1822`), prompt FR/EN, 1 à N photos ; **cache `lens_identify_cache`** clé = user + mode + `VERSION_PROMPT` (`2026-10-03-marque-lue-entiere`, `:1609`) + URLs triées (`:1646-1649`), purgé à 24 h, mode identify seulement (`:1514, 1638-1680`) ; plafonds 60 / user / 24 h (`:1585`), 3 000 / jour global (`:1591`, ≈ 30 €), remboursements « contredite » 2 / 24 h (`:1604`). Scan payant : pas de cache.
- **generate-listing** (`generate-listing/index.ts`) : 1 appel par plateforme (`_shared/redaction-plateformes.ts:523, 532` : `max_tokens 1400`, prompts Vinted/Beebs/LBC/eBay ≈ 1 500-2 500 tokens chacun avec le contexte) + `category_icon`/objet (`:933-997`, `max_tokens 60`, légende de 164 icônes) ; micro-appels de secours sans débit : `resolve_genre` (`:305-341`, 50 tokens), `resolve_aspects` (`:457-616` → `ebay-aspects-ia.ts:317-318` 500 tokens, 2e passe un appel par aspect en parallèle `:466`), `resolve_couleur` (`:357-403`, `couleur-ia.ts:26, 162` 60 tokens, 1-2 photos ≈ 3 500-4 000 tokens in ≈ 0,002-0,004 $, plafond 400 / compte / 24 h `:364-372`), `resolve_isbn` (`:414-446`, 4 photos, plafond 400). **Aucun cache** : une régénération repaie (la dédup 24 h de `quota_annonces_consommees` ne concerne que le quota, `:1351-1354`).
- **resolve-categorie** (`resolve-categorie/index.ts:252-253, 361-362`, `max_tokens 150/120`, `temperature 0`) : ≈ 3 appels par article (`resolutionPublication.js:833, 1396, 1535, 1710` ; mesuré 65 pour 20 articles le 11/10) ; plafond par palier `free 300 / premium 900 / pro 2 000 / business 4 000` par 24 h (`_shared/plafond-resolve-categorie.js:10`, `:171-177`) ; **aucun cache ni regroupement** (grep `cache|memo|idempot` : 0).
- **Serveur Beebs** : arbitrage listes via resolve-categorie, 1 job par poll, 4 champs, 6 s (`GPJ:8656-8722`) — éteint pour toute extension ≥ 0.6.21.

Import de plusieurs milliers d'articles : l'import lui-même est gratuit ; la facture arrive à la publication en lot, **article par article, séquentiellement** (pilote `LotPublication.jsx:173`), sans plafond de taille de lot depuis le 12/10 (`lot/regles.js:26`), bornée seulement par le quota de publication du palier (« mur de conversion », `lot/regles.js:410-420`) et par les plafonds 24 h ci-dessus. Ordre de grandeur Business : 1 000 articles ≈ 2 650 appels de rédaction + ≈ 3 000 resolve-categorie + aspects/couleur ≈ 12-15 $ ; le plafond resolve-categorie (4 000 / 24 h) s'atteint vers 1 300 articles, puis les rayons partent sans IA (question ou suggestion plateforme).

---

## 6. Ops digest

`supabase/functions/ops-digest/index.ts` : 21 sections (lignes 84, 911-1185) — failed 24 h, processing > 15 min, deletes > 24 h, boucles techniques, ventes prouvées, CPU, relevés en pause, boucles serveur, veilleur, fournisseurs IA (crédit épuisé / échecs), republications retenues, IAP, abonnés, email_logs, publications jamais exécutées (30 j), sync dressing (garde-fous), stockage photos, tentatives, **« needs_user posés sans motif » (`:1145-1154`, filet `champ_a_choisir`)**, pending > 48 h, dressings croisés, plafond Lens identify.

Sur « une plateforme ajoute un champ obligatoire » : **rien**. grep `champ|requis|aspects|obligatoire` → 3 lignes hors sujet (`:131, 265, 1149`). Le catalogue `platform_category_aspects` (`required`, `source dom|server_400`, `first_seen_at`, `seen_count`) est alimenté par `background.js` (`persistDiscoveredAspects`, coupe à 200) et par les refus 400 (`GPJ:7297, 7449, 7650`, `_shared/requis-recreation-lbc.js`) mais aucune alerte ne signale un `required = true` apparu (`first_seen_at` récent) ni un champ requis sans `allowed_values`. La seule remontée indirecte : les `needs_user` sans `needs_user_source` et les lignes `champ_requis_bloquant`, que personne n'agrège dans le digest.

---

## 7. Trous constatés (classés par blocages sur 7 j)

1. **Taille Beebs — 152 affiches, 131 articles, 35 jamais complétés** (le plus gros, et structurel) : la fiche porte la taille dans le vocabulaire de la plateforme source (7 935 fiches « N-M mois / cm » Vinted en 30 j) ; `listes.js:223-250` (app) ne traduit pas vers Beebs ; `childSizes.js` (la seule table Vinted↔LBC↔Beebs↔eBay) n'est appelée qu'à l'insert et seulement sur la forme canonique (`parseChildSize` ignore les libellés plateforme) ; `taille-de-service.js` R1-R4 n'a pas de règle « étiquette composite enfant d'une autre plateforme » ; `fiche_completer_depuis_annonce` ne remplace jamais une taille existante par celle que Beebs affiche. Conséquence : chaque vêtement enfant importé de Vinted et publié sur Beebs pose la question, même quand l'annonce Beebs du même article existe et affiche la bonne valeur.
2. **Univers Leboncoin — 113, dont 80 avant le correctif du 11/10** ; reste ouvert : Décoration/Sport (famille d'objet, pas un genre : 16 lignes le 17/10), `universLbcDeLaFiche` sans accès à `vinted_catalog_id` (3 223 fiches) et sans mémoire « Univers habituel de ce compte » ; déduction serveur limitée à Mode > Vêtements/Chaussures.
3. **Produit Leboncoin — 55, dont ~35 artefacts de télémétrie** : la ligne « affiche » part avant la réponse de la seconde passe IA (`LPS:8916-8931` sans attente `iaGeneriqueEnVol`) ; vrai reste ≈ 20 (listes dépendantes Maison & Jardin, « Déco » non rapproché de « Décoration »).
4. **Âge Beebs — 22, 11 comptes** : `attributs.age` (129 fiches, relevé Beebs) jamais lu sur une publication neuve ; pas de recopie depuis l'annonce Beebs en ligne hors republication ; pas de mémoire ; livres/DVD adultes rangés dans « Jeux, jouets et loisirs » → l'IA rend `null` → question (la bonne réponse serait « 16 ans et + », valeur que portent justement les fiches relevées).
5. **Longueur de la robe eBay — 12** et **Style eBay — 10** : seconde passe IA texte seulement ; aucune lecture photo (le seul micro-appel photo est la couleur) ; pas de mémoire par catégorie.
6. **Genre Leboncoin — 12**, **Type Leboncoin — 7**, **Pointure Beebs/LBC — 6/6**, **Taille Vinted — 8** : même famille que 1 (vocabulaire de grille) ou 2 (champ d'identité).
7. **Télémétrie** : « affiche » générique compté avant l'IA (voir 3) ; les comptes de la référence du matin incluaient 10-11/10 (couleurs, marques) qui sont FERMÉS depuis `f7750bb`/`e14ae19` : Couleur Vinted 65, Couleur eBay 37, Marque Vinted 24 / eBay 17 / Beebs 11 = 0 ligne depuis le 12/10.
8. **Mémoire par compte et catégorie** : inexistante pour tous les champs du sujet (seuls Opla catégories, colis Vinted, marques retenues, poids/new_item_type LBC existent) ; les 366 réponses « complete » de la semaine ne sont rangées que sur la copie du job.
9. **IA sans regroupement ni cache** : resolve-categorie ≈ 3 appels par article sans mémoire (3 689 / 7 j), génération sans cache, couleur/aspects par article ; seul Lens identify est en cache. Un lot de milliers d'articles paie tout à l'unité.
10. **ops-digest** : aucune surveillance d'un champ obligatoire nouveau (`platform_category_aspects.required` + `first_seen_at`) ni du volume `champ_requis_bloquant` par champ.
