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
