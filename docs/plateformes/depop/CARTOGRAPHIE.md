# Depop — cartographie complète (relevé du 08/10/2026)

**[mesuré]** = relevé tel quel (réponse d'API, constante du code servi à la page, ou
ce que l'interface affiche). **« à vérifier »** = non prouvé ; ne pas coder dessus.

Compte du relevé : compte Depop **vide** créé par Nico (France, euros, interface en
anglais même sous `/fr/`, vendeur non configuré). Aucune annonce publiée, aucun
brouillon enregistré, aucun réglage modifié, aucune interaction sociale. La bannière
de cookies n'est pas apparue. Aucun identifiant, cookie ni jeton n'est écrit dans le
dépôt (le fichier brut a été vérifié : les seules occurrences de « cookie » sont des
marques, « Cookie Lee », « Cookies Sf »).

## 1. Les totaux

| | Nœuds | Feuilles | Détail |
|---|---:|---:|---|
| **Catalogue** (identifiants Depop) | **191** | **160** | 4 départements, 27 groupes (26 actifs), 160 types de produit (151 actifs) [mesuré] |
| **Arbre du formulaire** (département > groupe > type) | **399** | **347** | 4 + 48 + 347 ; dont **374 nœuds / 322 feuilles proposés** par le formulaire, 25 feuilles inactives [mesuré] |

- Les **322 feuilles** de l'API = **les 322 options** comptées une à une dans le
  sélecteur « Category » du formulaire (48 en-têtes « Département > Groupe »)
  [mesuré, recoupement automatique dans `scripts/gen-depop-referentiel.mjs`].
- Répartition : Homme 83, Femme 97, Enfants 90, Tout le reste 52 [mesuré].
- **281** feuilles sont dans la liste **officielle** du type (`product_type.department`),
  **41** sont proposées par le formulaire **hors liste** (ex. Homme > Hauts > Blouses) :
  celles-ci n'ont **jamais** de grille de tailles — vu à l'écran, Blouses (Homme) ne
  montre que Quantité et SKU [mesuré].
- **183** feuilles ont une grille de tailles, **139** n'en ont pas (quantité seule) [mesuré].
- Hors arbre : le groupe `jewellery` (« Bijoux ») est **inactif et sans département** ;
  les bijoux passent par `accessories/jewellery` + l'attribut `jewellery-type` [mesuré].
- 9 types inactifs : `footwear/oxfords-brogues`, 7 anciens types de bijoux et casquettes
  sous `accessories`, `home/home-appliances` [mesuré].

## 2. Comment chaque donnée a été obtenue (moyen le plus simple d'abord)

| Donnée | Moyen | Source | Fichier |
|---|---|---|---|
| Arbre (groupes, types, attributs par type, mesures) | 2. appel du site | `GET webapi.depop.com/presentation/api/v1/attributes/groups/` | `brut/attributes-groups.json` |
| États, couleurs, source, âge, style, genre, départements, 57 attributs propres aux types, mesures, **21 752 marques** | 2. appel du site | `GET …/presentation/api/v1/attributes/` | `brut/attributes.json` |
| Tailles (52 grilles) et correspondance feuille → grille par région | 2. appel du site | `GET …/presentation/api/v1/attributes/categories/size-mapping/` | `brut/attributes-categories-size-mapping.json` |
| Ids composites des tailles (`56.4-EUR`) | 2. appel du site | `GET …/presentation/api/v1/search/filters/size/` | `brut/search-filters-size.json` |
| Arbre du filtre de recherche (libellés en-US / en-GB) | 2. appel du site | `GET …/presentation/api/v1/search/filters/category/?lang=` | `brut/search-filters-category-*.json` |
| Liste des pays (localisation) | 1. fichier statique | `assets.depop.com/web/assets/listing/location/countries.json` | `brut/listing-location-countries.json` |
| Options du sélecteur de catégorie | 4. lecture de l'interface (DOM) | `/products/create/first/` | `brut/selecteur-categorie-ui.json` |
| Contraintes (photos, description, hashtags, prix, quantité, SKU, expédition, schéma de validation) | 1. code JS servi à la page | 65 bundles de `static.depop.com/0bbca71/37805891563-1/` | `contraintes.json` (chaque valeur citée avec son bundle) |
| Endpoints du site (215 chemins) | 1. code JS servi à la page | bundle `27evssp8b94rp.js` | `brut/endpoints-bundle-27evssp8b94rp.txt` |
| Vérifications ponctuelles (T-shirts → grille 56 de 27 tailles ; Blouses Homme sans taille ; « Other » de la marque ; aucun brouillon envoyé) | 3. formulaire, sans rien enregistrer | `/products/create/first/` | ce document |

Les endpoints de référentiel sont **publics** : appelés depuis la page **sans aucun
identifiant** (`credentials: 'omit'`), ils répondent 200 [mesuré]. Les six réponses
ont été reprises à l'identique (longueurs égales au caractère près) ; leurs
empreintes sont figées dans le générateur.

**Fichiers structurés** (générés, jamais édités à la main —
`npm run gen:depop-referentiel`, contrôle `npm run selftest:depop-referentiel`) :
- `arbre.json` — chaque nœud : `id`, `niveau`, `nature`, `parent`, `feuille`, `statut`,
  `proposee_par_formulaire`, libellés fr / en / en-GB ; chaque feuille : `liste_officielle`,
  `grille_tailles` par région, `legacy_category_id`, `attributs`, `mesures`,
  `genre_enfant_requis`, `etat_neuf_seulement`, et `libelle_fr_en_double_parmi_freres`.
- `attributs.json` — chaque liste avec ses valeurs, leurs ids, libellés, statut,
  `max_selection`, obligatoire selon l'API **et** selon le formulaire.
- `tailles.json` — les 52 grilles, chaque taille avec id, libellé, position, id composite.
- `contraintes.json` — écrit à la main, chaque valeur avec sa preuve.

## 3. Ce qui conditionne une annonce

### Catégorie [mesuré]
Envoyée en **trois ids** : `group`, `productType` (sans le département), et
`isKids` / `gender`. En Enfants, le **genre est obligatoire** (`male`, `female`,
`unisex`) ; Homme et Femme le posent d'office ; Tout le reste n'en a pas.

### Attributs [mesuré]
| Champ | Valeurs | Max | Obligatoire (formulaire) |
|---|---:|---:|---|
| État (`condition`) | 5 : `brand_new`, `used_like_new`, `used_excellent`, `used_good`, `used_fair` | 1 | **oui** (l'API dit non) |
| Marque (`brand`) | 21 752 (21 697 actives) ; « sans marque » = `unbranded` (libellé « Other ») | 1 | **oui** |
| Couleur | 19, avec code hexadécimal | 2 | non |
| Source | 8 (Vintage, Preloved, Reworked…) | 2 | non |
| Âge | 8 (Modern, 00s…Antique) | 1 | non |
| Style | 39 (32 actifs) | 3 | non |
| Attributs propres au type | 57 listes (51 actives), 405 valeurs (371 actives), filtrées par département | 1 à 4 | non (toutes `is_mandatory:false`) |
| Mesures | 11 (cm pour le compte français) | — | non |

- Beauté : `bath-and-body`, `fragrance`, `hair-products`, `makeup`, `nails`, `skincare`
  n'acceptent **que** `brand_new` [mesuré, `INVALID_USED_CONDITION_PRODUCT_TYPES`].
- `size-fit` figure dans les attributs de 213 feuilles mais la liste est **inactive** :
  le formulaire ne l'affiche pas [mesuré : il ne garde que les valeurs actives].
- ⚠️ Les attributs propres au type (matière, coupe, occasion…) sont rendus par le
  formulaire web d'après le code, mais **je ne les ai pas vus à l'écran** sur le
  parcours `/products/create/first/` : **à vérifier** sur le parcours normal.

### Tailles [mesuré]
- 52 grilles = 13 familles × 4 **régions** : IT (système **EUR**), GB (UK), US, AU ;
  1 816 tailles en tout, dont 360 en EUR. Chaque feuille porte une grille **par région**.
- Compte français = **IT/EUR** : Homme > Hauts > T-shirts affiche la grille 56
  (« One size, 3XS…6XL, 36…48, Other », 27 tailles) [mesuré à l'écran].
- Avec grille : `variants = { <id taille>: <quantité> }` + `variantSetId` ;
  sans grille : `quantity ≥ 1` [mesuré, schéma du formulaire].
- Systèmes par famille (EUR) : vêtements enfant (mois puis ans, jusqu'à 16 ans),
  pointures enfant 16→32 puis « 33 (adult) »→« 40 (adult) », hauts / bas / robes /
  lingerie (bonnets 1A→4H) / manteaux / chaussures (« EUR 34 »→« EUR 49 ») par sexe.

### Contraintes d'annonce [mesuré sauf mention]
- **Pas de titre** : le texte de l'annonce est la **description** seule.
- Description obligatoire, **1 000 caractères**, **5 hashtags** au plus ; liste des
  hashtags interdits servie à un utilisateur connecté (**non relevée : 401 sans jeton**).
- Photos : **1 à 8**, JPEG ou PNG, recadrées puis envoyées en JPEG **1280×1280**.
  Poids maximal : **à vérifier**. Vidéo : code présent, aucun champ web — **à vérifier**.
- Prix : obligatoire, **≥ 1**, < 10¹⁰ côté formulaire (plafond serveur **à vérifier**),
  devise du compte (€).
- SKU ≤ 50 caractères. Localisation (pays + adresse) obligatoire, prise au profil.
- Expédition **France = manuelle** : prix national obligatoire (< 100), prix
  international facultatif (< 100, « Offer worldwide shipping ») ; **aucun poids ni
  format de colis**.

## 4. Ce qui change selon le pays ou la langue (sans tout dupliquer)
- **Tailles** : une grille par région (IT/EUR pour la France et l'UE, GB, US, AU).
- **Expédition** : manuelle hors US / GB / AU. Étiquettes Depop et formats de colis aux
  US (USPS), au Royaume-Uni (Evri, code `MY_HERMES`), en Australie (Sendle, Australia
  Post) ; formats servis par des endpoints authentifiés (**non relevés**).
- **Libellés** : chaque valeur porte `fr`, `it`, `de`, `en`, `en-US`. Le filtre de
  catégories rend de l'anglais quel que soit `?lang=` (fr-FR = de-DE = it-IT = en-GB ;
  seul en-US diffère : « Pants », « Sweaters »…).
- **Langue envoyée** à la publication : fr → fr-FR, it → it-IT, de → de-DE, sinon en-GB.
- **Adresse** : validation Loqate selon le pays.

## 5. Libellés français de Depop : à ne jamais utiliser pour rattacher [mesuré]
Recopiés tels quels, jamais corrigés. Exemples :
- `tops/shirts` **et** `tops/tshirts` : tous deux « T-shirts » (doublon entre frères,
  6 feuilles marquées `libelle_fr_en_double_parmi_freres`) ;
- trois « Vestes » : `tops/vests-tanks-camis` (débardeurs), `coats-jackets/jackets`,
  `underwear/vest-undershirts` (maillots de corps) ;
- `fancy-dress` (Costume / déguisement) = « Robe habillée » ; `home` = « Accueil » ;
  `beauty/grooming` = « Toilettage » ; `art/prints` = « À imprimé » ;
  `swim-beach-wear/cover-ups` = « Protections » ; matière `suede` = « Suède » ;
- `nightwear/robes` (robes de chambre) = « Robes », comme le groupe des robes ;
- les 14 types de robes restent en anglais (« Casual dresses »…).
→ Le rattachement se fait **par identifiant** (cf. `RATTACHEMENT.md`).

## 6. Protections, débit, captchas [mesuré, 08/10]
- `webapi.depop.com` appelé **hors navigateur** (curl) : **403**, page « Forbidden -
  Depop » (3 endpoints essayés une fois chacun). **Non contourné** : tout a été lu
  depuis la page, comme le site le fait.
- `static.depop.com` / `assets.depop.com` : 200 hors navigateur (65 bundles et la liste
  des pays, à 0,5 s d'intervalle).
- Endpoints authentifiés : 401 (`banned-hashtags`) ou 400 (`shipping/providers/*`,
  `shipping-providers`) sans jeton.
- Script anti-fraude **Sift** (`cdn.sift.com/s.js`) chargé sur la page de mise en vente ;
  Cloudflare devant le site.
- **Aucun captcha**, **aucun 429** sur ~25 appels d'API espacés d'au moins 0,6 s ;
  seuil de débit **à vérifier**.

## 7. Complet, partiel, à vérifier
**Complet [mesuré]** : arbre (tous nœuds, ids, libellés, parents, niveaux, feuilles,
statuts), correspondance feuille → grille par région, 52 grilles et leurs tailles,
états, couleurs, source, âge, style, genre enfant, 57 attributs propres aux types et
leurs valeurs, mesures, liste des marques, contraintes du schéma de validation, liste
des endpoints.

**Partiel** : expédition hors France (formats de colis et transporteurs servis à un
utilisateur connecté) ; quels attributs propres au type s'affichent vraiment à l'écran.

**À vérifier** (aucun code ne doit s'appuyer dessus avant) :
- hashtags interdits (liste authentifiée) ;
- plafond de prix serveur, poids maximal d'une photo, vidéo ;
- corps et réponses des appels de **création**, modification, suppression, relevé de
  boutique et ventes (`contraintes.json` § `cycle_de_vie_endpoints` : chemins lus dans
  le code, **aucun appelé**) ;
- seuil de débit, comportement de Sift sur une publication automatisée ;
- l'interface en **français** (le compte du relevé affiche l'anglais) : si les
  libellés à l'écran sont ceux de `name_i18n.fr`, les erreurs du § 5 seront visibles
  des vendeurs.

## 8. Cycle de vie RELEVÉ EN RÉEL (08/10 nuit → 09/10, compte de Nico)
Tout depuis une page `www.depop.com`, avec le jeton de la session (cookie
`access_token` → `Authorization: Bearer`, `credentials: 'omit'`) — exactement ce que
fait le site. Hors navigateur : 403, jamais contourné. Code : `chrome-extension/
content-scripts/depop.js` (connecteur), contrats détaillés en tête du fichier.

| Geste | Appel | Réponse mesurée |
|---|---|---|
| Statut vendeur | `GET /api/v1/sellerOnboarding/sellerStatus/` | `canSell` — false tant que PayPal ou Stripe n'est pas relié : Depop **enregistre en brouillon** et exige « Add payment info » (mesuré le 08/10, brouillon effacé) |
| Photo | `POST /presentation/api/v1/pictures/` `{type, extension, dimensions}` → `PUT` S3 présigné → `POST …/pictures/validate/` `{picture_ids}` jusqu'à `complete` | 201 `{id, url}` ; une photo NON carrée (960×1280) est acceptée |
| Mise en ligne | `POST /presentation/api/v1/listing/products/` (corps : `description`, `price_amount`, `price_currency`, `picture_ids`, `condition`, `brand`, `gender`, `product_type`, `variant_set` + `variants`, `national_shipping_cost`, `country`, `geo_position_*`, `listing_lifecycle_id`, `persistent_id`) | 201 `{id, slug}` (annonce de test 945715025 à 999 €) |
| Lecture | `GET /presentation/api/v1/products/<id>/` ou `…/by-slug/<slug>/` (publique) | `status` STATUS_ONSALE / STATUS_PURCHASED ; 404 « Product not found » |
| Retrait | `DELETE /presentation/api/v1/products/<id>/` | 204 ; relu → 404 |
| Boutique | `GET /presentation/api/v1/shops/<id>/products/` (24 par page, `?after=<last>`) ; `…/by-status/sold/` | annonces en vente ; vendues |
| Lien public | `https://www.depop.com/products/<slug>/` | le slug EST l'identifiant de nos jobs |

- Prix 999 € accepté (aucun plafond rencontré) ; pas de titre (Depop en génère un pour
  l'affichage, « Men's White and Grey T-shirt »).
- Une erreur réseau (« Failed to fetch » : CORS sur un jeton invalide, coupure) n'est
  JAMAIS un verdict — ni déconnecté, ni retirée, ni vendue.
- Vente réelle : **non prouvée de bout en bout** (on ne vend pas) ; la structure d'une
  annonce vendue (STATUS_PURCHASED, `variants_all[].status`) est lue sur une annonce
  publique vendue (936331996).
- État du compte au 09/10 : l'annonce « Scotch » (945704866, 80 €) est **celle de Nico**,
  créée par lui — jamais touchée. Deux images orphelines (sans annonce) restent chez
  Depop, invisibles.
