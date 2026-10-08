# Depop — rattachement au moteur de FillSell (08/10/2026) — BRANCHÉ le 09/10 pour le SEUL compte bêta

> **09/10/2026 (nuit) — ce document décrit la préparation du 08/10 ; le branchement est FAIT,
> pour le seul compte autorisé** (bêta de Nico, `profiles.beta_flags.depop` ;
> `coin_config.depop_ouvert` reste à 0) :
> - base : migration `20261009020000` (garde `depop_autorise`, CHECK, 29 fonctions) — un compte
>   non autorisé ne peut créer aucune ligne Depop (exception `depop_non_ouvert`) ;
> - moteur commun : les 6 faiblesses du § 5 corrigées à la racine (`9eab08f`, preuves dans le commit) ;
> - serveur (`0773ae1`), extension 0.6.105 (`f59c1c2`, hôte www.depop.com OPTIONNEL), app (`8f88cdd`) ;
> - l'état part par identifiant (`utils/depopPublication.js`) : `ETAT_PAR_PLATEFORME` porte des
>   libellés français écrits dans les textes, Depop n'y a pas de colonne ;
> - selftests : `depop-acces`, `depop-app`, `depop-partout` (aucune liste de plateformes n'oublie
>   Depop sans raison écrite), `moteur-faiblesses-depop`, `depop-mapping`.
> Cycle de vie réel : `CARTOGRAPHIE.md` § 8. Ouvrir à tous = `depop_ouvert = 1`, décision de Nico.

**[mesuré]** = vérifié par un test ou un relevé ; **« à vérifier »** = non prouvé.

Depop **n'est pas** une plateforme de FillSell. Ce chantier prépare le rattachement
sans rien brancher : aucun fichier de l'app, du serveur ni de l'extension n'importe
les modules Depop, aucune liste de plateformes visible ne nomme Depop, aucune
contrainte de la base n'accepte `'depop'` [mesuré, `npm run selftest:depop-mapping`].

## 1. Le patron suivi (celui de Beebs et d'Opla), pas une deuxième mécanique

| Moteur existant | Ce qu'il attend d'une plateforme | Préparé pour Depop | Branché ? |
|---|---|---|---|
| Relevé → générateur → fichiers figés avec empreintes (`gen-opla-catalogue.mjs`, `gen-arbres-feuilles.mjs`) | un relevé brut, un générateur, un `--verifier` | `brut/` + `scripts/gen-depop-referentiel.mjs` → `arbre.json`, `attributs.json`, `tailles.json` | — (données) |
| Icône + genre → catégorie (`beebsCategories.js`, `vintedCategories.js`) | `MODE` / `HORS_MODE` / `SANS_FEUILLE_DEFAUT`, `get…Category…`, `…CategoryStatus`, `…GenreRequired` | `src/utils/depopCategories.js`, mêmes noms, mêmes statuts | **non** |
| État : 5 paliers (`_shared/etat-plateformes.js`) | une colonne par plateforme dans `ETAT_PAR_PLATEFORME` | `DEPOP_ETAT_PAR_PALIER` (forme exacte de la colonne) | **non** |
| Tailles enfant (`childSizes.js`) | une colonne par plateforme dans `CHILD_MONTH_SIZES` / `CHILD_YEAR_SIZES` | `DEPOP_TAILLE_ENFANT` (mêmes clés canoniques) | **non** |
| Tailles adultes (`_shared/tailles.js`, `tailleDansGrille`) | la grille EXACTE de la feuille | `tailles.json` (grille par feuille et par région) | **non** — cf. § 5, faiblesse n° 1 |
| Couleurs (palette `VINTED_COLORS`, pré-normalisation de l'app) | une table libellé → valeur plateforme | `DEPOP_COULEUR_PAR_LIBELLE` | **non** |
| Absence de marque (`_shared/marque-absente.js`) | `estSansMarque` + la valeur « sans marque » de la plateforme | `DEPOP_SANS_MARQUE = "unbranded"` via `estSansMarque` | **non** |
| Famille (`familleCategorie.js`, `RACINES`) | les familles des racines | chaque type porte sa famille (`DEPOP_TYPE_VERS_INTERNE`) | **non** |
| Interrupteur (`coin_config`, comme `opla_sortie_le`) | un drapeau journalisé | `depop_ouvert = 0` (migration 20261008230000, **non appliquée**) | **non** |

Chaque table Depop a **la forme exacte** de la colonne qu'elle deviendra : le jour de
l'activation, on la **verse** dans la table partagée — il n'y aura jamais deux tables
vivantes.

## 2. Le mapping [mesuré par `selftest:depop-mapping`]

### Catégories, sens retour : chaque feuille Depop → taxonomie interne
Les **160** types relevés ont chacun une ligne (`DEPOP_TYPE_VERS_INTERNE`) ; aucune
ligne orpheline. Sur les **347 feuilles** de l'arbre :

| | Types | Feuilles |
|---|---:|---:|
| rattachés à une **icône** (`ALL_OBJECT_ICONS`) + type + famille | 121 | **260** |
| rattachés au **type** + famille, icône laissée à la détection du titre (raison écrite) | 30 | **62** |
| **non rattachés** : inactifs chez Depop, absents du formulaire | 9 | **25** |

Les 322 feuilles proposées par le formulaire ont **toutes** une destination.

Rattachés au type seulement (aucune icône ne dit l'objet sans le déformer) :

| Type Depop | Type | Famille | Pourquoi |
|---|---|---|---|
| `tops/corsets` | Mode | mode | corset : ni t-shirt ni lingerie dans la légende des icônes |
| `tops/bodysuits` | Mode | mode | body : aucune icône ne le dit |
| `tops/other-tops` | Mode | mode | « Autre » : objet non nommé |
| `bottoms/other-bottoms` | Mode | mode | « Autre » : objet non nommé |
| `jumpsuit-and-playsuit/jumpsuit` | Mode | mode | combinaison : aucune icône (👖 ne couvre que la salopette) |
| `jumpsuit-and-playsuit/playsuit-romper` | Mode | mode | combishort : aucune icône |
| `jumpsuit-and-playsuit/other-jumpsuit-and-playsuit` | Mode | mode | « Autre » : objet non nommé |
| `suits/waistcoats-vests` | Mode | mode | gilet de costume : ni costume entier ni veste |
| `suits/other-suits` | Mode | mode | « Autre » : objet non nommé |
| `footwear/first-shoes-baby-shoes` | Mode | mode | chaussures de bébé : aucune icône dédiée |
| `footwear/other-footwear` | Mode | mode | « Autre » : objet non nommé |
| `accessories/hair-accessories` | Mode | mode | accessoire pour cheveux : aucune icône |
| `accessories/other-accessories` | Mode | mode | « Autre » : objet non nommé |
| `nightwear/robes` | Mode | mode | robe de chambre : aucune icône (👗 serait une robe) |
| `nightwear/other-nightwear` | Mode | mode | « Autre » : objet non nommé |
| `swim-beach-wear/cover-ups` | Mode | mode | paréo, cache-maillot : aucune icône |
| `sleepsuits-and-bodysuits/sleepsuits-babygrows` | Mode | mode | grenouillère, body bébé : aucune icône |
| `bundles/bundles` | Mode | mode | lot de vêtements : plusieurs objets |
| `beauty/tools-and-brushes` | Beauté | beaute | appareils OU pinceaux : deux objets |
| `face-masks/face-masks` | Mode | mode | masque en tissu : aucune icône |
| `tech-accessories/laptop-cases-bag` | High-Tech | electronique | housse d'ordinateur : aucune icône (💻 serait l'ordinateur) |
| `tech-accessories/phone-cases` | High-Tech | electronique | coque de téléphone : aucune icône (📱 serait le téléphone) |
| `art/stickers` | Collection | loisirs | autocollants : aucune icône |
| `party-supplies/cake-decor` | Maison | maison | décoration de gâteau : aucune icône |
| `party-supplies/cards-invitations-gift-wrap` | Maison | maison | cartes et papier cadeau : aucune icône |
| `party-supplies/decorations` | Maison | maison | décoration de fête : 🎄 ne dit que Noël |
| `party-supplies/favours` | Maison | maison | articles de fête : aucune icône |
| `party-supplies/party-hats` | Maison | maison | chapeaux de fête : aucune icône |
| `toys/learning-toys` | Jouets | loisirs | jouet d'éveil : aucune icône |
| `toys/puzzles-games` | Jouets | loisirs | puzzle OU jeu : deux icônes (🧩, 🎲) |

Non rattachés (inactifs chez Depop, `status: inactive`, absents du formulaire) :
`footwear/oxfords-brogues`, `accessories/necklace`, `accessories/body-jewellery`,
`accessories/brooches-pins`, `accessories/caps-snapbacks`, `accessories/rings`,
`accessories/earrings-and-ear-cuffs`, `accessories/bracelet-anklets`,
`home/home-appliances` (+ le groupe `jewellery`, inactif et sans département).

### Catégories, sens aller : chaque icône interne → feuille Depop
Les **164** icônes ont toutes une décision (aucune `unmapped`) :
- **99 `supported`** — chacune vise une feuille **proposée** ET **officiellement**
  rattachée à son département (donc avec sa grille de tailles quand il y en a une) ;
- **61 `unavailable`** — Depop n'a pas de rayon : téléphonie, informatique, image et
  son (seuls les étuis existent), électroménager (`home-appliances` inactif), cuisson,
  bricolage, jardin, véhicules, puériculture, animaux, boxe, pêche, équitation,
  billard, papeterie, cravate et porte-clés (un fourre-tout « Autre » ne se choisit
  jamais par défaut) ;
- **4 `no_default`** — 🏠 🎵 💎 📦 : la racine existe, l'objet n'est pas nommé.

Genre : Femme → `womenswear`, Homme → `menswear`, Fille / Garçon / Enfant →
`kidswear` + `female` / `male` / `unisex` ; **Bébé** → `kidswear`, genre **à
demander** ; **Mixte** → rien (Depop n'a aucun département adulte unisexe).
Les défauts assumés (une icône qui couvre plusieurs feuilles sœurs) sont écrits en
commentaire, un par un, comme dans `beebsCategories.js`.

### État
| Palier FillSell | Depop | Retour (relevé d'une annonce Depop) |
|---|---|---|
| Neuf avec étiquette | `brand_new` | neuf avec étiquette |
| Neuf sans étiquette | `used_like_new` (« neuf ou d'occasion sans étiquette ») | **très bon** (le plus bas des deux sens) |
| Très bon état | `used_excellent` | très bon |
| Bon état | `used_good` | bon |
| Satisfaisant | `used_fair` | satisfaisant |

Aucun aller-retour n'embellit l'état [mesuré]. Beauté (6 types) : tout autre palier
que « neuf avec étiquette » → **question**, jamais « Nouveau » à sa place.

### Couleurs, matières, tailles, marque
- **Couleurs** : les 29 libellés de la palette Vinted → 19 couleurs Depop, toutes
  atteintes ; Corail, Turquoise, Transparence → rien (à cheval ou sans équivalent ;
  la couleur est facultative chez Depop) ; 2 au plus.
- **Matières** : les 33 matières actives, rapprochées du libellé français **ou**
  anglais de Depop, plus quelques mots français (daim, simili cuir, paillettes…) ;
  l'inconnu est écarté et nommé ; 4 au plus.
- **Tailles enfant** (grille 101, EUR) : 23 des 26 tailles canoniques ; Prématuré,
  36 mois et 18 ans → question (pas d'équivalent exact). Pointures enfant (grille
  104) : EU 16 → 40 ; 15, 41 et demi-pointures → question.
- **Tailles adultes** : grille exacte de chaque feuille dans `tailles.json` ;
  la traduction passera par `tailleDansGrille` — **voir la faiblesse n° 1**.
- **Marque** : absence (`estSansMarque`) → `unbranded` ; une vraie marque se cherche
  dans la liste Depop au dépôt, introuvable → question.

## 3. Le drapeau, et l'invisibilité [mesuré]
- Migration `supabase/migrations/20261008230000_depop_drapeau_inerte.sql` : pose
  `coin_config.depop_ouvert = 0` + une ligne de journal ; une ligne déjà présente
  n'est **jamais** réécrite. **NON APPLIQUÉE.** Testée en local sur PGlite 0.3.16
  (`scripts/depop-migration-banc.mjs`, 7 contrôles verts : posée, journalisée,
  rejouable, ne peut ni armer ni désarmer, aucune autre clé ne bouge).
- Aucune contrainte CHECK n'est ouverte à `'depop'` : aucune ligne Depop ne peut
  exister en base, même par erreur.
- `selftest:depop-mapping` refuse : un import des modules Depop, une mention de Depop
  dans un fichier de l'app, du serveur ou de l'extension hors des 14 fichiers qui la
  citaient déjà avant le 08/10 (textes, prompts, blog, motif de départ), un hôte Depop
  dans le manifeste, et toute instruction de la migration autre que le drapeau à 0.
- Le build de l'app ne contient pas une ligne de plus sur Depop (mêmes occurrences
  avant et après, cf. rapport du 08/10).

## 4. Ce qui manquera pour une vraie intégration (rien n'est implémenté)

**a. Brancher le mapping dans le moteur partagé** (inerte tant que d) n'est pas fait) :
1. `ETAT_PAR_PLATEFORME` ← `DEPOP_ETAT_PAR_PALIER` (+ conversion libellé → id au job,
   comme `OPLA_ETAT_PAR_LIBELLE`) ; `CHILD_*_SIZES` ← colonne `depop` ;
   `childAxesForGenre` : décider si Depop ouvre les mois aux Fille/Garçon
   (la grille 101 les contient) ;
2. `familleCategorie.js` : `RACINES.depop` + la règle « racine = genre » (Homme, Femme,
   Enfants) étendue à Depop, comme pour Opla ;
3. index des feuilles pour `categorieParMot.feuillesDe('depop')` — **par
   identifiant**, pas par les libellés français de Depop (faiblesse n° 3) ;
4. `resolutionPublication.js` : branche `depop` (`depopCategory`, état, couleurs,
   matières, taille, `unbranded`) ; `PLATEFORMES_RAYON_A_DEMANDER` + `sansRayon`
   (faiblesse n° 4) ; `champsPartages.js` ; `marque-absente.js`
   `PLATEFORMES_TRADUITES` (+ traduction « Sans marque » → `unbranded`) ;
5. rédaction : Depop n'a **pas de titre** — une description de 1 000 caractères,
   5 hashtags, sans hashtag interdit (`generate-listing` n'écrit que 4 copies ; Opla
   dérive de Vinted).

**b. La base** (une migration par point, feu vert de Nico) : ouvrir les CHECK
`cross_post_jobs_platform_check`, `platform_category_aspects_platform_check`,
`vinted_sync_runs_platform_chk`, le CHECK de `annonces_plateforme`,
`republish_creneaux_platform_chk` ; les listes blanches des fonctions
(`republish_planifiee_plateformes`, `p_platform NOT IN (…)` des RPC de ventes et de
synchro, `plateformes_verite`, `premiers_releves`) ; les crons et le rapprochement
(`_shared/rapprochement/moteur.js`).

**c. L'extension** : `manifest.json` en `optional_host_permissions` (comme Opla : sinon
mise à jour à privilèges accrus, extension désactivée chez tout le monde) +
`scripts/hotes-livrables-cws.mjs` ; `PLATFORM_HANDLERS.depop` (`implemented:false`
d'abord), `CATEGORY_FIELD`, `PLATFORM_HOSTS`, `LISTING_URL_PATTERNS`,
`MY_LISTINGS_URL`, `RELEVE_PLATEFORMES`, `VENTES_PLATEFORMES`, le miroir
`NU_CHANNEL_BY_PLATFORM` ; un content script Depop qui appelle l'API **depuis la page**
(hors navigateur : 403) :
- **publication** : présignature + envoi des photos (`/presentation/api/v1/pictures/`,
  JPEG 1280×1280, 8 au plus), puis création (`/presentation/api/v1/listing/products/`
  ou `/api/v1/products/` — **corps et réponse à relever** sur une annonce de test à
  999 €, accord de Nico) ; pré-vol chez nous (feuille proposée, grille de la feuille,
  état autorisé, prix ≥ 1, description ≤ 1 000, ≤ 5 hashtags) ;
- **republication** : modification (`…/products/by-slug/:slug/edit-listing/`) ou
  suppression + recréation — **à relever** ; « repop » existe côté Depop ;
- **suppression** : endpoint **à relever** (aucun DELETE lu dans la table des endpoints) ;
- **relevé** : `/presentation/api/v1/shops/:sellerId/products/` et `…/by-status/:status/` ;
- **détection de vente** : `/presentation/api/v1/receipts/`, `…/users/me/sales-report/`
  (et la preuve « vendue » d'une annonce, à relever).

**d. L'app** (le seul geste qui rend Depop visible, en dernier) : `PLATEFORMES_STOCK`
/ `PLATEFORMES_STOCK_A_VENIR` (`stockFiltres.js`, puis `opla-cablage-selftest` à
mettre à jour), `plateformesOuvertes` (`App.jsx`), `profiles.plateformes_visibles`,
logos (`PlatformLogo`, `App.jsx`, `StockTab.jsx` — le logo officiel seulement quand
l'intégration est active, règle des maquettes), onboarding (`EtapePlateformes.jsx`),
popup de l'extension, `_shared/plateformes.ts` (mails), quotas, statistiques.
Puis `depop_ouvert = 1` — décision de Nico.

## 5. Faiblesses du moteur existant qui toucheraient Depop (signalées, NON contournées)

1. **`tailleDansGrille` ne connaît pas « EUR »** [mesuré sur les grilles Depop] :
   « EU 38 », « 38 », « 38,5 », « EU 42 », « 42 » → **refus** sur les grilles de
   chaussures adultes 48 et 79 (« EUR 38 »…) ; **toutes** les pointures adultes
   seraient impubliables. Cause : `lireNombre` (`_shared/tailles.js`) ne lit que les
   préfixes `fr|eu|t|taille`. Correctif à la racine (ajouter `eur`) = changement du
   moteur partagé, à décider et à éprouver sur les cinq plateformes avant. Les
   tailles enfant en mois (« 6 mois » ↛ « 3-6 months ») sont, elles, couvertes par
   le mécanisme existant des colonnes de `childSizes.js`.
2. **« Comme neuf » lu deux fois, deux paliers** [mesuré] : `tierEtat("Comme neuf")`
   = neuf sans étiquette, `etatAffirmeParLeTexte("comme neuf")` = très bon
   (`_shared/etat-plateformes.js`). C'est le libellé français d'un état Depop ; le
   mapping Depop passe par l'identifiant et n'en dépend pas, mais tout relevé qui
   lirait le libellé hériterait de l'incohérence.
3. **La résolution par le mot fait confiance aux libellés de la plateforme**
   (`categorieParMot.js`) : avec les libellés français de Depop, « robe habillée »
   tomberait **exactement et seule** sur Déguisement (`fancy-dress`) ; « T-shirts »
   et « Vestes » sont en double. L'index Depop doit être construit sur des libellés
   fiables, jamais sur `name_i18n.fr` tel quel.
4. **`sansRayon` rend « a un rayon » pour toute plateforme inconnue**
   (`resolutionPublication.js`, repli sur la chaîne `"opla"`) : un job Depop sans
   catégorie ne serait pas vu comme tel. À corriger avant le branchement.
5. **Aucun registre unique des plateformes** : la liste est écrite en dur dans
   plusieurs dizaines d'endroits (§ 4) ; c'est la dette déjà nommée dans
   `docs/OPLA_INVENTAIRE_PLATEFORMES.md` (décision ouverte de Nico).
6. **Famille inconnue = garde-fou permissif** (`familleDeChemin`) : sans `RACINES.depop`,
   toute feuille Depop passerait le contrôle de famille (même classe de faute que les
   550 feuilles Opla sans famille jusqu'au 19/09).

## 6. Ce qui attend le feu vert de Nico
- **Migration `20261008230000_depop_drapeau_inerte.sql`** : drapeau à 0, rien d'autre.
  Commande en tête du fichier ; elle ne change rien au comportement de la prod.
- Les décisions du § 4 et des faiblesses 1 et 4 (moteur partagé).
