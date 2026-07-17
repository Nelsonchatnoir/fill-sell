# Registre — Champs obligatoires par plateforme/catégorie

> Chantier « zéro trou » 2026-07-16. Objectif : chaque champ obligatoire sur
> Vinted / Leboncoin / Beebs / eBay est soit rempli automatiquement (IA ou
> défaut déterministe), soit présenté en saisie manuelle obligatoire avec
> bouton Publier désactivé tant qu'un requis est vide. Aucun article ne doit
> partir avec un champ obligatoire vide en silence.

**Statuts** : `auto-fill` (rempli automatiquement) · `saisie-manuelle`
(présenté à l'utilisateur, Publier bloqué si vide) · `vérifié-réel` (testé sur
le vrai formulaire) · `filet-générique-seulement` (aucun mapping fin, seule la
découverte réactive + le filet couvre).

## Étape 0 — Prérequis (2026-07-16)

### Sessions Claude in Chrome (vérifiées en réel le 16/07)
| Plateforme | Compte | État |
|---|---|---|
| Vinted | `nelsonchatnoir` (hoosslocal@gmail.com, id 250623918) | ✅ authentifié — compte de test |
| Leboncoin | compte de test (1 annonce « Robe salopette enfant » en ligne) | ✅ authentifié |
| Beebs | access_token + refresh_token + JWT présents | ✅ authentifié |
| eBay | « Bonjour Nicolas ! » (ebay.fr) | ✅ authentifié |

Comptes prod (nico@fillsell.app, etc.) exclus de tout test, comme d'habitude.

### Photos de test
5 photos génériques 1200×1200 générées localement (dégradé + formes + bruit,
~60 Ko chacune) dans `test-assets/photos/test-photo-{1..5}.jpg`. Fonctionnelles
uniquement — servent à déclencher l'affichage des champs dynamiques des
formulaires, pas à être réalistes. Script générateur : System.Drawing
(reproductible, seed fixe).

### Flux validés bout-en-bout à NE JAMAIS CASSER
1. **Mode Vinted** : chaussures/t-shirt validés en réel (campagne 4×5 dry-runs
   + publications LIVE prouvées) — cascade marque/taille/état/couleurs/matière,
   prix via props.onChange (fibers, monde MAIN), colis « Petit » forcé sur la
   Mode, preuve de publication par sonde réseau + redirection.
2. **Mode eBay** : aspects Marque/Couleur/Taille/Matière + alias Mode
   (monture/extérieure/doublure), onglet peint pendant remplissage,
   setNativeValue en un appel + relectures 8 s, entrée par la home.
3. **Tailles enfant (15/07)** : conversion canonique → libellé exact plateforme
   à l'insert (childSizes.js) + garde anti-nombre-nu dans les 4 content scripts
   (jamais de fuzzy numérique sur un champ taille).
4. **High-Tech Vinted (13/07)** : modèle (après marque), stockage, simlockage
   (défaut « Non » = désimlocké, gaté sur présence DOM).
5. **Anti-bot** : frappe humaine (typeHuman), pauses aléatoires, timers Web
   Worker non clampés, onglet de travail unique réutilisé, fenêtre dédiée
   invisible (jamais de focus volé, pas de chrome.debugger).
6. **Preuves de publication** : jamais de « published » sans preuve (sonde
   réseau, redirection, verdict background eBay) ; needsUser borné
   (rearmBounded) ; jamais ressusciter un job annulé.
7. **Garde eBay au publish** : aspects obligatoires connus vides ou hors liste
   fermée → blocage AVANT débit/insert. Défauts déterministes
   (EBAY_ASPECT_DEFAULTS) + resolve_aspects + fallback UI Phase 3.
8. **lens-analysis** : GELÉE — ne pas déployer (attributs_visibles codé mais
   NON DÉPLOYÉ, Phase 2).

## État initial des filets (constat 16/07, avant chantier)

| Plateforme | Filet existant | Trou identifié |
|---|---|---|
| Vinted | `unfilledRequired` toujours `[]` (constat assumé dans vinted.js) ; erreurs de validation DOM lues APRÈS le clic Publier (live seulement) ; sonde réseau en place | Aucune détection de requis en dry-run ; les requis invisibles côté DOM (400 serveur : `internal_memory_capacity`…) ne sont pas parsés ; pas de canal de saisie manuelle générique |
| Leboncoin | `unfilledRequired` sur univers/produit/quantité ; needsUser borné avec message | Champs dynamiques par catégorie non énumérés ; le blocage n'aboutit pas à une saisie manuelle dans l'app avec libellé exact |
| Beebs | `unfilledRequired` par libellé sans « (facultatif) » (selectDropdownValue) | Couverture 100 % catégories non prouvée ; pas de canal de saisie manuelle |
| eBay | Référentiel `ebay_item_aspects` (234 cat.) + garde publish + preview chips + défauts MPN + resolve_aspects + fallback UI Phase 3 | Phase 3 non validée sur formulaires réels ; libellés/types par famille non vérifiés en réel (P4) |
| App (stepper) | Garde eBay = throw au clic ; encart champs partagés manquants | Bouton Publier PAS désactivé sur requis vide (throw seulement) ; aucun canal générique Vinted/LBC/Beebs |

## Découverte fondatrice (16/07) — l'API attributes de Vinted

`POST /api/v2/item_upload/attributes`, émis par Vinted à CHAQUE sélection de
catégorie sur /items/new, déclare les champs dynamiques avec `configuration.
required`, le titre humain ET les options. C'est la source de vérité des
requis Vinted — capturée par la sonde réseau de l'extension (attrsConfig).
Seule exception connue : `model` (jamais dans la config, requis prouvé par le
400 réel f69e319c — règle : champ #model présent dans le DOM ⇒ requis).
Forme du refus 400 (vérifiée en base) : `errors[{field, value}]`.

Côté LBC : les requis sont marqués d'un astérisque dans le libellé
(`label[for="<clé sémantique>"]`, ex. « Produit* ») — convention affichée en
tête du wizard (« * champs obligatoires »). LBC PRÉ-REMPLIT Type/Produit/
Univers depuis le titre (constaté sur les 6 catégories relevées le 16/07).
Côté Beebs : libellé sans « (facultatif) » = requis ; vide = placeholder
« Sélectionner une valeur » (relevé réel Baskets femme).

## Registre par plateforme/catégorie

Les relevés 16/07 sont persistés dans `platform_category_aspects` (25 lignes,
source `manual`/`server_400`) — l'app les lit pour l'encart StepPublish, la
découverte réactive de l'extension enrichira le reste au fil des jobs.

### Vinted (relevé RÉEL par l'API attributes, 16/07)
| Catégorie (clé catalogue) | Requis au-delà de État (`condition`, requis PARTOUT) | Statut |
|---|---|---|
| … > Téléphones portables | Espace de stockage, Simlockage, Modèle (400) | auto-fill (prouvé 13/07) + catalogue |
| … > Ordinateurs portables | Capacité de stockage, RAM, Chargeur inclus | saisie-manuelle + IA (resolve_aspects) — AUCUNE source app dédiée |
| … > Casques audio et écouteurs | (aucun) | auto-fill (état) |
| … > Consoles | Plateforme (`video_game_platform`, list_search) | saisie-manuelle + IA |
| … > Tablettes | Espace de stockage | auto-fill (pf.stockage) + catalogue |
| … > Montres connectées | Taille (grid mm : « Jusqu'à 30 mm »…« Taille unique ») | saisie-manuelle (taille mode ≠ taille boîtier) |
| … > Appareils photo numériques | (aucun) | auto-fill (état) |
| … > Liseuses | (aucun) | auto-fill (état) |
| Femmes > Beauté > Parfums (P3) | (aucun) | auto-fill (état) |
| Maison > … > Housses de couette (P3) | Taille (Simple/Double/Queen/King) | saisie-manuelle + IA |
| Sport > … > Vélos pour enfant (P3) | (aucun) | auto-fill (état) |
| Mode (vêtements/chaussures) | taille, état (+ marque/couleur/matière non requis serveur) | auto-fill, vérifié-réel |

### Leboncoin (relevé RÉEL wizard, 16/07 — astérisques + options)
| Catégorie | Requis (astérisque) | Statut |
|---|---|---|
| Maison & Jardin > Électroménager | Photos*, Type* (5 options), Produit* (17) — État NON requis | pré-rempli par LBC depuis le titre + saisie-manuelle |
| Électronique > Ordinateurs | Photos*, Type* (Fixe/Portable/UC), État* | pré-rempli LBC + auto-fill état |
| Électronique > Téléphones & Objets connectés | Photos*, Produit* (8), État* | pré-rempli LBC + auto-fill état |
| Électronique > Photo, audio & vidéo | Photos*, Univers* (4, FONCTIONNEL), Produit* (dépend univers), État* | pré-rempli LBC + saisie-manuelle |
| Loisirs > Instruments de musique | Photos*, Univers* (`music_type`, 9) — État NON requis | pré-rempli LBC + saisie-manuelle |
| Maison & Jardin > Bricolage | Photos*, Type* (11), Produit* (dépend type) — État NON requis | pré-rempli LBC + saisie-manuelle |
| Mode>Chaussures | Pointure (`shoe_size`) | auto-fill + garde app, vérifié-réel |
| Famille>Équipement/Vêtements bébé | Univers*, Produit* | auto-fill (mapping), vérifié-réel 15-16/07 |

⚠️ LBC : `image_sound_universe` et `music_type` portent le libellé « Univers »
mais sont FONCTIONNELS (Audio/Vidéo…, Guitares…) — jamais un genre. Le
pré-remplissage par titre les couvre en pratique ; sinon saisie manuelle via
le canal générique (clé for= exacte).

### Beebs
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| Mode (Baskets femme, relevé 16/07) | Marque, Pointure, État (+ Format du colis pré-rempli) | auto-fill + énumération DOM (1.B) |
| Mode enfant/adulte | catégorie, marque, taille/pointure, état | auto-fill, vérifié-réel (dry-runs) |
| Autres (jouets, puériculture…) | âge, matière (selon catégorie) | énumération DOM générique — couvre AUSSI les champs jamais tentés depuis le 16/07 |

### eBay
| Catégorie | Champs obligatoires connus | Statut |
|---|---|---|
| 234 catégories feuilles | référentiel complet `ebay_item_aspects` (API Taxonomy) | auto-fill (connus) + défauts (MPN, 32 cat.) + resolve_aspects + saisie-manuelle Phase 3 — vérif réelle P4 EN ATTENTE |

## Validation réelle (16/07 soir — branche mergée sur main, prod déployée)

Extension rechargée par Nico, app déployée en prod (Vercel dpl READY, merge
97166a3). Tests menés :

- **Vinted — 400 forgé RÉEL (safe by construction)** : formulaire Téléphones
  portables rempli (titre + catégorie + 3 photos + description + prix 85 €),
  champs téléphone laissés vides, clic Publier → **HTTP 400, aucune annonce
  créée**. Corps serveur capturé :
  `{"code":99,"message_code":"validation_error","errors":[{"field":"brand",...},
  {"field":"internal_memory_capacity","value":"Sélectionne une valeur..."},
  {"field":"condition",...},{"field":"sim_lock",...},{"field":"color",...},
  {"field":"price",...}]}`. Passé dans le parseur `structuredExtras` (copie
  exacte de background.js) → **6 champs extraits et traduits** en libellés
  humains (Marque, Espace de stockage, État, Simlockage, Couleur, Prix). Le
  champ historiquement invisible au DOM (`internal_memory_capacity`) est bien
  capturé. Le filet n'est PLUS silencieux. ✅
  - Finding : le 400 marque `brand`/`color` requis alors que la config
    `attributes` ne les marque PAS `required`. Les deux couches sont donc
    COMPLÉMENTAIRES — le gate pré-clic couvre les requis de la config (+ modèle
    via règle DOM), le parseur 400 rattrape ceux que la config omet.
- **Vinted — gate pré-clic (lecture DOM)** : `computeVintedRequiredState`
  détecte correctement un requis vide sur le vrai formulaire (« État » relevé
  vide). Config phone canonique (storage/condition/simlock required) validée. ✅
- **eBay P4 — libellés réels (catégorie 9355 Téléphones)** : formulaire de
  vente réel ouvert (`/lstng`, draft, pas de mur passkey cette fois). Aspects
  relevés vs référentiel `ebay_item_aspects` :
  Marque ✅ (pré-rempli « Redmi » par product-match), Modèle ✅ (pré-rempli),
  **Couleur** ✅ présent+vide, **Capacité de stockage** ✅ présent+vide —
  libellés IDENTIQUES au référentiel et aux correspondances de la garde/preview
  app (Couleur→colors[0], Capacité de stockage→pf.stockage). ✅
- **generate-listing** : version déployée contient DÉJÀ `resolve_aspects`, le
  défaut MPN « Ne s'applique pas » et le contexte enrichi (déployée avec
  898e088/1494aea, NON modifiée par ce chantier) → **aucun redéploiement**,
  verify_jwt reste true. ✅
- **Beebs P5 — énumération hors Mode** : Figurines (Marque, Âge, Matière, État
  requis — le scénario exact du bug dry-run 09/07, désormais couvert),
  Poussettes citadines (Marque, État requis). L'énumération DOM est
  category-agnostique → couvre 100 % des catégories par construction. ✅

### Artefacts de test laissés (sans effet)
- eBay : brouillon `draftId=5309600414213` (Xiaomi Redmi Note 10) — jamais
  publié, à purger à la main avec les autres brouillons de test.
- Vinted : formulaire Téléphones abandonné après le 400 — aucune annonce.

### Test d'acceptation APP (17/07, Nico connecté aux 4 apps) — cross-post console

Article de test « Console Nintendo Switch OLED » créé via Stock IA, cross-post
Vinted + Leboncoin + eBay (Beebs s'auto-exclut : « catégorie non disponible »,
les consoles ne sont pas une catégorie Beebs — filet correct).

**Filet APP prouvé end-to-end sur le vrai stepper** (capture à l'appui) :
- eBay (cat. 139971) : encart « ✓ Marque ✓ Modèle » (product-match) — satisfait.
- Vinted (cat. Consoles) : encart « ✗ Plateforme — à compléter ci-dessous /
  ✓ État », select Plateforme (options du catalogue) → **IA resolve_aspects
  l'auto-remplit « Nintendo Switch »** depuis le titre → passe ✓.
- **Blocage vérifié** : select Plateforme vidé → chip repasse ✗ ROUGE **et le
  CTA « Publier » se désactive** (ctaDisabled=true). eBay reste tout vert →
  **chaque plateforme applique son filet indépendamment**. ✅ DoD APP atteint.

### ⚠️ INCIDENT PROD trouvé + corrigé pendant le test (hotfix fe8726f)
Boucle de rendu infinie dans l'effet de fetch du catalogue générique
(`genericAspectsCatalog`) : il dépendait de l'OBJET `genericCategoryKeys`
(identité instable au fil des rendus) ET posait un état à chaque passage →
**72+ requêtes/s vers Supabase** sur l'étape Publier, pour TOUT article. Fix :
dépendance par signature JSON (stable par valeur) + setState gardé par égalité.
Vérifié post-déploiement : 0 requête en boucle, filet fonctionnel. Les effets
eBay ne bouclaient pas (dépendance à `ebayPreviewCategoryId`, valeur primitive).

### FINDING mapping (pré-existant, à traiter séparément)
Une console décrite « avec dock » est classée 🔌 (« Autres appareils >
Batteries externes ») au lieu de 🎮 (Consoles) : le mot « dock » matche une
règle accessoire AVANT la règle console dans `OBJECT_ICON_RULES` (shared.js).
Conséquence : cross-post dans la MAUVAISE catégorie. Le filet fait son travail
(il lit la catégorie résolue), c'est le classement icône en amont qui dévie.
Reproduit : titre propre « Console Nintendo Switch OLED » → 🎮 correct ;
« ...avec dock... » → 🔌. À corriger dans l'ordre des règles d'icône.

### Cross-post LIVE réel (17/07) — article console, 3 plateformes
Jobs déclenchés via « Publier maintenant » (extension), comptes de test.
- **Vinted ✅ PUBLIÉ** : https://www.vinted.fr/items/9416716174 — le job portait
  `vintedAspects.video_game_platform = "Nintendo Switch"` (le requis du filet,
  résolu par l'IA) → posé sur le formulaire, publication SANS 400. Preuve
  end-to-end : filet app → job → extension → annonce en ligne.
- **Leboncoin ✅ PUBLIÉ** (listing_url en récupération différée, normal LBC).
- **eBay ⚠️ NON confirmé** (re-armé, attempts=1) : « l'onglet est resté sur
  /lstng 20 s après le clic, sans redirection ni réponse serveur portant un
  n° d'annonce ». ⚠️ Ce n'est PAS un problème de champs obligatoires : les
  aspects requis eBay (Marque/Modèle) étaient satisfaits, aucun `unfilled`,
  aucune erreur d'aspect. C'est la fragilité connue de CONFIRMATION DE
  SOUMISSION eBay (verifyEbaySubmission) — et la garde a bien REFUSÉ de marquer
  « publié » sans preuve (pas de published-fantôme). À investiguer séparément.

**Verdict acceptation champs obligatoires** : ✅ aucune plateforme n'a publié
avec un requis vide ; aucune n'a bloqué à tort (eBay non bloqué par le filet,
son non-publish est orthogonal) ; le filet Vinted a porté son requis
jusqu'à l'annonce en ligne. Le seul point ouvert (soumission eBay) est hors
périmètre du chantier requis.

### Suppression cross-plateforme — test réel du VRAI flux (17/07)
Objectif : retirer les 3 annonces console via le chemin applicatif, vérifier la
propagation CÔTÉ PLATEFORME (pas juste en base).

**Mécanisme observé (findings)** :
- L'app n'a **AUCUN retrait autonome** : `delItem` (swipe supprimer) efface la
  ligne d'inventaire SANS toucher aux annonces plateforme (elles resteraient
  orphelines en ligne). Le SEUL retrait cross-plateforme part d'une VENTE.
- Chemin réel : `check-listing-status` → `orchestrateSale` (job → sold, vente,
  inventaire vendu, frères `pending_removal`) → bandeau app « Retirer (N) » →
  `armRemovals` (insère les jobs `action='delete'`) → poll de fond de
  l'extension → `deleteListing` (DELETE_DRY_RUN=false, réel).
- Un cycle ne retire que les **frères** : la plateforme « vendue » garde son
  annonce (en vente réelle elle est déjà partie ; en test simulé elle reste).
- Les jobs `delete` **ne passent PAS par le popup « Publier maintenant »**
  (PUBLISH_NOW ne cible que les publications) — ils s'exécutent uniquement au
  poll de fond (≤ 30 min), volontairement invisible. Pas de déclenchement
  manuel immédiat via l'UI.

**Résultat VÉRIFIÉ côté plateforme** (vente Vinted simulée → retrait eBay+LBC) :
| Plateforme | Job delete | Vérif on-platform |
|---|---|---|
| **eBay** (itm/800354759898) | `deleted`, sans erreur | ✅ RETIRÉ — Hub vendeur « Résultats : 0 » (0 annonce active). **Suppression eBay fonctionne, plus de blocage passkey** (historiquement bloqué). |
| **Leboncoin** (ad/consoles/3234161806) | `deleted`, sans erreur | ✅ RETIRÉ — page « Cette annonce est désactivée / introuvable ». |
| **Vinted** (items/9416716174) | plateforme « vendue » (sold) | ⏳ Restée EN LIGNE (non retirée par le flux vente). Job delete armé à part (cleanup) → à exécuter au poll. |

→ Propagation réelle CONFIRMÉE sur eBay + Leboncoin. La suppression n'est PAS
un simple changement de statut en base : les annonces sont bien retirées.

### Étape B — Re-test article « avec dock » (17/07)
Republication de l'article dock (fix mapping déployé) pour vérifier qu'il part
maintenant en **Consoles**, pas en 🔌 Batteries externes.

**2e bug mapping trouvé ET corrigé pendant le re-test** (commit 5a865ca) : le
1er fix (`INCLUDED_ACCESSORY_CLAUSE`) utilisait `\b` autour des marqueurs
symboles « + » et « & » — or ce sont des NON-WORD, `\b` entouré d'espaces ne
matche jamais. Le titre généré « Nintendo Switch OLED blanc **+ dock**… » n'était
donc pas dé-bruité → repartait en 🔌. Idem « Casque Bose **&** câble ». Fix :
marqueurs MOTS (`\b…\b`) séparés des SYMBOLES (`[+&]`). Re-testé 10/10.

**Confirmé end-to-end (job payloads, bundle corrigé)** : l'article dock résout
la catégorie CONSOLE sur les 3 plateformes —
| Plateforme | Catégorie du job | Aspect requis |
|---|---|---|
| Vinted | `Électronique > Jeux vidéo et consoles > Consoles` | `vintedAspects.video_game_platform = "Nintendo Switch"` (résolu IA) |
| eBay | `139971` (Consoles) | ✓ Marque ✓ Modèle |
| Leboncoin | `Électronique > Consoles` | ✓ Marque ✓ État |

Encart app confirmé visuellement (✓ verts sur les 3). → **Le mapping « dock »
est réglé de bout en bout** : app → job payload → bonne catégorie.
Reste (LIVE) : publication on-platform + 3e preuve eBay + suppression.

### Étape B — publication LIVE on-platform (17/07, confirmée)
L'article dock republié (bundle corrigé) a été publié par l'extension sur les
3 plateformes, catégorie **Console** vérifiée CÔTÉ PLATEFORME :
- eBay itm/800357039555 → fil d'Ariane **« High-tech > Jeux vidéo, consoles >
  Consoles »** (PAS Batteries externes). Publié AVEC URL, sans erreur → la 3e
  preuve de confirmation eBay (ou le chemin normal) a fonctionné.
- Vinted items/9417527366, Leboncoin (URL différée) → catégories Consoles
  (payloads : Vinted `…> Consoles`, LBC `Électronique > Consoles`).
→ Mapping « dock » réglé de bout en bout : app → job → annonce en ligne en
  Consoles.

### Étape C — fallback UI eBay pour aspect « Style » (17/07)
Test réel catégorie Robes (63861). Le fallback générique eBay couvrait déjà
« Longueur de la robe » (dans le référentiel, non mappé). **Trou trouvé** :
« Style » (obligatoire, item-specific) était classé `PREFILLED_BY_EBAY` alors
qu'il est VIDE sur le vrai formulaire → il passait en silence. **Corrigé**
(commit 260da09, déployé) : « Style » retiré de la liste prefilled → passe par
le fallback. **Vérifié en app** (robe réelle) : l'encart eBay affiche désormais
un champ **Style** (résolu IA « bohème » depuis la description) + un champ
**Longueur de la robe** (« Midi »), Département resté pré-rempli. Le CTA se
désactive si un requis reste vide (mécanisme déjà prouvé sur Vinted Plateforme).

### Couverture d'autres catégories à risque (17/07 — test au-delà de la console)
Testé via Stock IA jusqu'à l'étape publication (sans publier) :
| Catégorie | Icône résolue | Résultat |
|---|---|---|
| Console (Switch) | 🎮 | ✅ publiable, filet OK (Consoles, video_game_platform) |
| Robe | 👗 | ✅ publiable, filet OK (fallback Style + Longueur) |
| **Parfum** (Chanel N°5) | **💎 Luxe** | ⚠️ **BLOQUÉ 4/4** « catégorie pas encore prise en charge (bientôt) » |
| **Carte Pokémon** (Dracaufeu) | **🏆 Collection** | ⚠️ **BLOQUÉ 4/4** « catégorie pas encore prise en charge (bientôt) » |

**Comportement du filet = BON** : l'app BLOQUE proprement (message clair +
plateformes désactivées + CTA off), jamais de publication silencieuse dans une
mauvaise catégorie. C'est l'objectif « zéro trou » atteint côté sécurité.

**Mais 2 trous de COUVERTURE (catégories à ajouter)** :
1. **Parfum mal classé 💎 Luxe** : la règle `parfum → 🌸` EXISTE et 🌸 est
   mappé (Vinted/eBay/Beebs), MAIS le parse Stock IA a produit titre « N°5 » +
   desc « 100ml, neuf sous blister » + catégorie « Luxe » → le mot « parfum »
   est PERDU → detectObjectIcon retombe sur 💎 (défaut Luxe), non mappé.
   Fix = parse IA (catégoriser Beauté / garder le signal parfum) — touche
   generate-listing/voice-parse, à valider avant deploy. Un défensif possible :
   reconnaître « eau de parfum/toilette/edp/edt » dans resolveArticleIcon.
2. **Collectibles (Pokémon) 🏆 Collection non mappé** : aucune plateforme
   n'a de mapping pour 🏆. Fix = expansion de mapping (Vinted « Cartes à
   collectionner », eBay cartes Pokémon, etc.) — nouveau lot de mapping fin.

Ces 2 gaps sont des CATÉGORIES À AJOUTER (pas des bugs) : le filet fait déjà
son travail en bloquant. À prioriser selon le volume réel (parfums fréquents,
cartes Pokémon en forte demande).

### 🔴 TROU #1 — SUPPRESSION VINTED CASSÉE en fenêtre invisible (17/07, vérifié)
Testée pour la 1re fois de bout en bout : la **suppression Vinted ÉCHOUE**.
Job delete 4d52f60a (annonce 9416716174) traité par le poll → erreur :
« Suppression vinted non aboutie (Modale de confirmation introuvable après le
clic Supprimer, testids présents : item-delete-button). L'annonce est TOUJOURS
en ligne (vérifié). » Le bouton Supprimer EST trouvé et cliqué
(simulateFullClick), mais la **modale de confirmation ne se monte pas** dans la
fenêtre de travail minimisée/non rendue → l'annonce reste en ligne.
- eBay ✅ et Leboncoin ✅ suppriment bien (pas de modale React dépendante du
  rendu) ; **Vinted ❌** (sa modale de confirmation exige un vrai rendu).
- ⚠️ CORRIGE la conclusion d'Étape A : j'avais validé eBay+LBC, mais la Vinted
  n'avait pas encore été testée (c'était la plateforme « vendue »). Elle échoue.
- Même classe de bug que le commit PRIX Vinted : les events synthétiques ne
  déclenchent pas React dans la fenêtre cachée (CDP input non délivré non plus).
- **Impact produit** : « Vendu ailleurs → retrait auto » NE MARCHE PAS pour
  Vinted (l'annonce reste en ligne après une vente sur une autre plateforme).
  Le memory « Vinted delete confirmé bout-en-bout 11/07 » date d'AVANT la
  fenêtre invisible minimisée (2026-07-13) qui a cassé ça.
- **FIX proposé (non shippé — non testable à distance)** : mirror de
  `commitVintedPrice` v3 — script monde MAIN qui walk le fiber du bouton
  `item-delete-button` et appelle DIRECTEMENT `props.onClick` (sans event),
  attend le montage de la modale, puis `props.onClick` de
  `item-delete-confirmation-button`. Incertitude à lever au test : l'argument
  event attendu par onClick. À implémenter + VÉRIFIER en session avec extension
  rechargeable + annonce Vinted live.

### Suppression — nettoyage (17/07)
Findings suppression complétés :
- Les jobs `delete` ne s'exécutent QUE sur l'alarme de fond (≤ 30 min) — jamais
  via « Publier maintenant » (PUBLISH_NOW = publications uniquement). Pas de
  déclenchement immédiat par l'UI ; recharger l'extension ré-arme un poll à +1 min.
- Une annonce publiée avec **URL différée** (Leboncoin/Beebs) ne peut PAS être
  auto-retirée tant que `recoverMissingListingUrls` n'a pas peuplé son
  listing_url (armRemovals/deleteListing ont besoin de l'URL). Gap à surveiller.
- Suppressions armées en fin de session (à traiter au prochain poll) : console
  propre Vinted 9416716174, dock eBay 800357039555, dock Vinted 9417527366.
  Dock Leboncoin : en attente de récupération d'URL.

### Trou de validation restant
- **Filet APP côté UI (CTA désactivé + encart saisie manuelle)** : la logique
  est déployée et compile, mais NON observée dans l'app connectée (login
  OAuth/mot de passe hors de portée de l'automatisation). À vérifier par Nico
  connecté, ou lors du test d'acceptation cross-post.
- **eBay Phase 3 fallback UI (1.F)** : libellés validés sur le vrai formulaire ;
  le rendu de l'encart de saisie inline pour un aspect SANS source app (ex.
  « Longueur de la robe ») reste à voir dans l'app connectée.

## Filets livrés le 16/07 (Étape 1 — code commité, mergé sur main, déployé)

1. **Extension** (vinted.js, leboncoin.js, beebs.js, background.js) :
   - Vinted : unfilledRequired RÉEL (config attributes × DOM), gate pré-clic
     LIVE (requis vide ⇒ needsUser, jamais de clic), parsing 400 →
     `serverRequired` structuré + `platform_fields.server_required_fields`.
   - Beebs : énumération DOM complète (requis jamais tentés inclus) + gate
     pré-clic.
   - LBC : énumération des critères (clé for=) + blocage wizard routé en
     needsUser structuré avec libellé exact et message LBC.
   - Canaux génériques : pf.vintedAspects / lbcAspects / beebsAspects.
   - Toutes les découvertes upsertées dans platform_category_aspects.
2. **App** (ListingPreviewScreen) : encart requis par plateforme (chips ✓/✗ +
   saisie inline select/texte), résolution IA resolve_aspects des manquants,
   **CTA Publier désactivé tant qu'un requis est vide** (eBay + générique +
   champs partagés + genre Vinted bloqué), garde handlePublish en re-check.

## Trous restants / à valider (état au 16/07 soir)

- **Validation réelle des filets** : le nouveau code extension n'est PAS
  rechargé dans Chrome, l'app n'est PAS déployée — aucun test de bout en bout
  n'a encore tourné. DoD étape 1 (≥ 2 formulaires réels/plateforme + 400
  simulé Vinted) NON atteint tant que ces tests n'ont pas tourné.
- **eBay P4** : libellés/types réels par famille non vérifiés ; Phase 3
  fallback UI non vue sur formulaire réel (1.F). generate-listing non
  redéployé (attend OK — SANS --no-verify-jwt).
- **Beebs P5** : catégories hors Mode non relevées (l'énumération DOM les
  couvrira à l'usage, mais zéro relevé proactif).
- **LBC** : options Produit* de Bricolage relevées pour « Outils
  électroportatifs » seulement (dépendantes du Type).
- **Vinted Sport adulte** : navigation arbre tombée sur la branche enfant —
  équipement sport adulte (ballons, raquettes…) non relevé.
- **Test d'acceptation final** (cross-post simultané 4 plateformes × 2-3
  catégories à risque) : à faire après rechargement extension + déploiement
  app validé.

---

## Chasse catégories/mapping — 17/07 (DRY RUN, sans extension)

Test node de detectObjectIcon + detectType + chemins plateforme sur 5 familles
neuves (Mode, Sport, Maison, Beauté, Bricolage) + batterie de titres pièges.
Résultat familles : mapping correct partout ; les catégories sans feuille
plateforme (vélo adulte, canapé sur Vinted) tombent en null → filet manuel
(comportement voulu, pas un trou).

**5 bugs de mapping « mot-clé ambigu » trouvés et corrigés** (même classe que
dock→🔌 ; la mauvaise règle matchait avant la bonne). Corrigés dans les DEUX
copies de detectType (shared.js + App.jsx local) + OBJECT_ICON_RULES :
1. « Trottinette électrique **Xiaomi** » → 📱 High-Tech (marque tél. avant
   Sport) → court-circuit mobilité avant High-Tech + règle 🛴 avant 📱.
2. « **Batterie** de cuisine » → 🥁 Musique → lookahead `cuisine` ajouté
   (Musique + règle 🥁). Retombe en Maison.
3. « **Huile** moteur 5W30 » → 💄 Beauté → `huile.?moteur` ajouté à Auto-Moto
   (avant Beauté).
4. « **Batterie externe** » (power bank) → 🥁 Musique (préexistant : lookahead
   n'excluait que « voiture ») → `externe` ajouté. Retombe en High-Tech.
5. « **Casque** moto/vélo/ski » → catégorie High-Tech (casque audio) alors que
   l'icône 🪖/⛑️ était correcte → négatif `casque(?!…moto|vélo|scooter|ski|
   chantier)` en High-Tech. Type retombe en Auto-Moto/Sport.

Non-régression vérifiée (iPhone, casque audio/gaming, batterie Yamaha, huile
essentielle, enceinte JBL, ampli Marshall, casque de ski…). audit-coverage :
0 non-mappé, 0 invalide, 52/52. Les 2 copies detectType prouvées identiques.

Imprécisions mineures LAISSÉES (mappent sur une catégorie valide ou le filet,
pas un trou d'intégrité) : boule de pétanque → 🎱 billard, chaussures de
sécurité → 👟, coque iPhone → 📱, table de ping-pong → 🏠→filet.

### Diff edge déployé vs code (17/07, get_edge_function)
- **generate-listing v53 : PAS à jour (deploy en attente, gaté sur go Nico).**
  L'index.ts déployé n'a PAS le bloc « défauts déterministes MPN » (Phase 1,
  commit 1494aea). De plus il bundle un `src/utils/shared.js` PÉRIMÉ (15/07,
  encore avec Luxe, sans les fixes cartes/huile/etc.). Impact LIMITÉ : (a) le
  défaut MPN serveur manque mais le front le pose déjà (EBAY_ASPECT_DEFAULTS) ;
  (b) le shared.js bundlé ne sert QU'À choisir la famille de retouche PHOTO
  (RETOUCH_FAMILIES), jamais la catégorie de l'annonce (calculée côté front au
  publish). Premium 5-clauses BIEN présent au déployé.
- **handler-watch v1 : à jour, Phase B incluse** (auto-pause HANDLER_WATCH_AUTOPAUSE
  + platform_health présents au déployé).
- **lens-analysis v45 : « Luxe » présent dans le schéma (gelée)** — neutralisé
  par le filet frontend (detectObjectIcon re-dérive + typeAuto ré-écrit).

## CHANTIER FINAL — Couverture par volume + fallback universel (17/07)

Relevés DOM RÉELS sur /items/new (session authentifiée, IDs catalogue exacts),
insérés dans `platform_category_aspects` (source='dom'). Le canal frontend ne lit
que `required=true` (vérifié L2782) → les optionnels (couleur/matériau/ISBN)
n'ajoutent aucune friction. `genericKnownSource` mappe brand/size/condition →
marque/taille/etat (auto-remplis par l'IA) → famille fluide si l'IA a les infos,
saisie manuelle AVANT le clic sinon.

### Tableau de couverture (mapping fin / testé réel / fallback 400)

| Famille (volume ↓)        | Vinted                  | Leboncoin      | Beebs          | eBay |
|---------------------------|-------------------------|----------------|----------------|------|
| Vêtements femme           | ✅ relevé+base+400 ✅   | ⏳ à relever   | — (enfant only)| ✅ catalogue officiel |
| Vêtements homme           | ✅ relevé+base+400 ✅   | ⏳             | —              | ✅ |
| Vêtements enfant          | ✅ relevé+base+400 ✅   | ✅ (relevé 16/07 bébé) | ⏳ à relever | ✅ |
| Chaussures                | ✅ relevé+base+400 ✅   | ⏳             | ✅ baskets F (16/07) | ✅ |
| Sacs & accessoires        | ✅ relevé+base+400 ✅   | ⏳             | —              | ✅ |
| Puériculture (poussettes) | ✅ relevé+base+400 ✅   | ⏳             | ✅ (16/07)     | ✅ |
| Jouets & jeux             | ✅ relevé+base+400 ✅   | ⏳             | ✅ figurines (16/07) | ✅ |
| Livres/BD (ISBN !)        | ✅ relevé+base+400 ✅   | ⏳             | —              | ✅ |
| Maison & déco             | ✅ relevé+base+400 ✅   | ⏳             | —              | ✅ |
| Électronique              | ✅ (P1 16/07)           | ✅ (P2 16/07)  | —              | ✅ |
| EXOTIQUES (É3)            | ✅ timbres=État seul + champ inconnu → parseur généralise | idem parseur générique | énum DOM générique | ✅ |

### Vinted — relevés DOM 17/07 (18 catégories, 96 lignes en base)
- **Vêtements** (Robes casual 1059, Jeans F 1845, Jeans garçons 1696, T-shirts H
  1810, Sweats H 1811 — structure homogène vérifiée ×5) : Marque•, Taille•, État•,
  Couleur, Matériau(rec). Appliqué aux 9 clés mapping (F/H/enfant, baskets F/H).
- **Sacs à main (156), Poussettes (1612), Vases (1940)** : Marque•, État•, Couleur —
  PAS de taille (formulaire adaptatif confirmé).
- **Jouets (Jeux de construction 1767)** : + champ Taille présent mais douteux →
  required=false (sous-marquage volontaire, le 400-learner corrigera si besoin).
- **Livres/BD (5425)** : structure UNIQUE — **ISBN (champ TEXTE, testid isbn--input)**
  + État seul. Ni marque ni taille. ISBN marqué optionnel (prudence).
- **Timbres à l'unité (4889, exotique É3)** : État SEUL — formulaire minimal.
- (• = required=true en base)

### Validations croisées
- `vintedFieldSelector` (content script) utilise EXACTEMENT les testids relevés
  (brand-select-dropdown-input, category-size-single-grid-input, category-
  condition-single-list-input, category-material-multi-list-input) → remplissage
  prêt pour toutes ces familles sans modification de code.
- **Parseur 400 : 10/10 familles** (node, réplique exacte de la logique L718-736) —
  labels français pour tous les champs connus (isbn inclus), fallback
  attrsConfig.title pour un champ inconnu, code brut en dernier ressort. Jamais
  d'échec → fallback universel PROUVÉ côté logique.

### Audit lint ciblé premium/voix/paiement (17/07)
- **BUG RÉEL corrigé — SwipeRow (App.jsx)** : hooks appelés après un return
  conditionnel (isMobile) → crash React au resize web à travers 768px. Tous les
  hooks déplacés avant le return. Build + lint OK.
- iap.js:114 `no-useless-catch` : try/catch redondant, inoffensif (laissé).
- translations.js `fraisAnnexes` dupliqué (×2) : valeurs IDENTIQUES
  (« Frais annexes »/« Additional fees ») → écrasement inerte, pas un bug.
- Aucune erreur `no-undef` / `no-const-assign` / feature premium-voix-paiement
  cassée. Les ~2100 « erreurs » eslint restantes = bruit (unused-vars, purity).
