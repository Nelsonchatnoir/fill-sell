# Audit aspects obligatoires eBay — Phase 0 (2026-07-16)

Source : table prod `ebay_item_aspects` (API Taxonomy eBay, status='ok'),
familles résolues depuis `src/utils/ebayCategories.js`. État de couverture =
le code RÉEL du 2026-07-16 : ebay.js remplit Marque/Taille/Pointure EU/
Couleur/Matière/Modèle/Capacité de stockage depuis platform_fields ;
Département/Type/Style sont posés par eBay lui-même (observé en session
réelle — Département en « pills » pré-actives, lecteur corrigé b45bf65).

## Global

| | instances d'aspects obligatoires |
|---|---|
| Catégories auditées | 234 |
| Aspects obligatoires (instances) | 848 |
| ✓ couverts par l'app | 444 (52.4 %) |
| ◐ pré-remplis par eBay | 301 (35.5 %) |
| ✗ TROUS (aucune source) | 103 (12.1 %) |

## Trous par aspect (global, tri par nb de catégories touchées)

| Aspect | catégories |
|---|---|
| Numéro de pièce fabricant | 32 |
| Matière de la couche extérieure | 8 |
| Hauteur | 6 |
| Matière doublure externe | 6 |
| Couleur de la monture | 5 |
| Largeur | 5 |
| Nom de parfum | 4 |
| Volume | 4 |
| Taille d'écran | 3 |
| Longueur | 3 |
| Longueur de la robe | 3 |
| Installation | 3 |
| Connectivité | 2 |
| Source d'alimentation | 2 |
| Résolution maximale | 1 |
| Technologie d'affichage | 1 |
| Capacité de charge | 1 |
| Couleur extérieure | 1 |
| Matière extérieure | 1 |
| Connectivité Internet | 1 |
| Taille de matelas compatible | 1 |
| Processeur | 1 |
| Matériau du bracelet | 1 |
| Système d'exploitation compatible | 1 |
| Taille du boîtier | 1 |
| Jeu | 1 |
| Batterie/pile incluse | 1 |
| Tension | 1 |
| Teinte | 1 |
| Dimensions | 1 |
| Type de cuisinière compatible | 1 |

## Détail par famille

### Mode (vêtements/chaussures/accessoires)

112 catégorie(s) — 582 instances obligatoires : ✓ 303 couvertes, ◐ 255 pré-remplies eBay, ✗ 24 trous.

| Trou | catégories (ids) |
|---|---|
| Matière de la couche extérieure | 8 (11498, 11504, 11505, 11632, 147285, 53557, 55793, 62107) |
| Matière doublure externe | 6 (155201, 260023, 51580, 51933, 57988, 63862) |
| Couleur de la monture | 5 (122340, 131411, 176967, 45246, 79720) |
| Longueur de la robe | 3 (260021, 51581, 63861) |
| Couleur extérieure | 1 (169291) |
| Matière extérieure | 1 (169291) |

### Sports, vacances

20 catégorie(s) — 36 instances obligatoires : ✓ 20 couvertes, ◐ 0 pré-remplies eBay, ✗ 16 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 16 (115280, 134214, 134391, 134414, 137865, 15280, 158928, 16264…) |

### Maison

15 catégorie(s) — 47 instances obligatoires : ✓ 21 couvertes, ◐ 12 pré-remplies eBay, ✗ 14 trous.

| Trou | catégories (ids) |
|---|---|
| Hauteur | 4 (20580, 38208, 54235, 79654) |
| Largeur | 4 (20580, 38208, 54235, 79654) |
| Longueur | 3 (20580, 54235, 79654) |
| Taille de matelas compatible | 1 (175758) |
| Dimensions | 1 (37644) |
| Type de cuisinière compatible | 1 (98846) |

### Beauté, bien-être, parfums

9 catégorie(s) — 27 instances obligatoires : ✓ 9 couvertes, ◐ 9 pré-remplies eBay, ✗ 9 trous.

| Trou | catégories (ids) |
|---|---|
| Nom de parfum | 4 (112661, 11848, 159719, 29585) |
| Volume | 4 (112661, 11848, 159719, 29585) |
| Teinte | 1 (31804) |

### Instruments de musique

7 catégorie(s) — 14 instances obligatoires : ✓ 7 couvertes, ◐ 0 pré-remplies eBay, ✗ 7 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 7 (10183, 29946, 33034, 38088, 38097, 38107, 47078) |

### Électroménager

12 catégorie(s) — 32 instances obligatoires : ✓ 21 couvertes, ◐ 4 pré-remplies eBay, ✗ 7 trous.

| Trou | catégories (ids) |
|---|---|
| Installation | 3 (71256, 71262, 71318) |
| Numéro de pièce fabricant | 2 (20612, 20613) |
| Hauteur | 1 (71262) |
| Largeur | 1 (71262) |

### Image, son

3 catégorie(s) — 14 instances obligatoires : ✓ 7 couvertes, ◐ 2 pré-remplies eBay, ✗ 5 trous.

| Trou | catégories (ids) |
|---|---|
| Connectivité | 2 (112529, 14990) |
| Résolution maximale | 1 (11071) |
| Taille d'écran | 1 (11071) |
| Technologie d'affichage | 1 (11071) |

### Bricolage

8 catégorie(s) — 17 instances obligatoires : ✓ 8 couvertes, ◐ 4 pré-remplies eBay, ✗ 5 trous.

| Trou | catégories (ids) |
|---|---|
| Capacité de charge | 1 (112567) |
| Hauteur | 1 (112567) |
| Numéro de pièce fabricant | 1 (180976) |
| Batterie/pile incluse | 1 (184655) |
| Tension | 1 (184655) |

### Informatique, réseaux

6 catégorie(s) — 16 instances obligatoires : ✓ 7 couvertes, ◐ 5 pré-remplies eBay, ✗ 4 trous.

| Trou | catégories (ids) |
|---|---|
| Taille d'écran | 2 (171485, 177) |
| Connectivité Internet | 1 (171485) |
| Processeur | 1 (177) |

### Téléphonie, mobilité

3 catégorie(s) — 11 instances obligatoires : ✓ 7 couvertes, ◐ 1 pré-remplies eBay, ✗ 3 trous.

| Trou | catégories (ids) |
|---|---|
| Matériau du bracelet | 1 (178893) |
| Système d'exploitation compatible | 1 (178893) |
| Taille du boîtier | 1 (178893) |

### Jardin, terrasse

5 catégorie(s) — 13 instances obligatoires : ✓ 6 couvertes, ◐ 5 pré-remplies eBay, ✗ 2 trous.

| Trou | catégories (ids) |
|---|---|
| Source d'alimentation | 2 (260921, 71268) |

### Bébé, puériculture

5 catégorie(s) — 7 instances obligatoires : ✓ 5 couvertes, ◐ 0 pré-remplies eBay, ✗ 2 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 2 (20435, 66695) |

### Auto, moto - pièces, accessoires

2 catégorie(s) — 3 instances obligatoires : ✓ 2 couvertes, ◐ 0 pré-remplies eBay, ✗ 1 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 1 (124313) |

### Jouets et jeux

10 catégorie(s) — 11 instances obligatoires : ✓ 10 couvertes, ◐ 0 pré-remplies eBay, ✗ 1 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 1 (84912) |

### Collections

1 catégorie(s) — 1 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 1 trous.

| Trou | catégories (ids) |
|---|---|
| Jeu | 1 (183454) |

### Loisirs créatifs

1 catégorie(s) — 2 instances obligatoires : ✓ 1 couvertes, ◐ 0 pré-remplies eBay, ✗ 1 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 1 (3118) |

### Bijoux, montres

3 catégorie(s) — 6 instances obligatoires : ✓ 3 couvertes, ◐ 2 pré-remplies eBay, ✗ 1 trous.

| Trou | catégories (ids) |
|---|---|
| Numéro de pièce fabricant | 1 (7278) |

### Monnaies

1 catégorie(s) — 0 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### Jeux vidéo, consoles

1 catégorie(s) — 2 instances obligatoires : ✓ 2 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### Livres, BD, revues

3 catégorie(s) — 0 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### Musique, CD, vinyles

2 catégorie(s) — 0 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### Animalerie

1 catégorie(s) — 1 instances obligatoires : ✓ 1 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### Photo, caméscopes

2 catégorie(s) — 6 instances obligatoires : ✓ 4 couvertes, ◐ 2 pré-remplies eBay, ✗ 0 trous.

### Timbres

1 catégorie(s) — 0 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

### DVD, cinéma

1 catégorie(s) — 0 instances obligatoires : ✓ 0 couvertes, ◐ 0 pré-remplies eBay, ✗ 0 trous.

## Lecture

- Les « pré-remplis eBay » ne bloquent pas en pratique (vérifié en réel) mais
  restent hors de notre contrôle : si eBay ne les pose pas sur une catégorie,
  ils deviennent des trous — le constat LIVE de ebay.js les attrape.
- Un TROU = publication BLOQUÉE à coup sûr par le constat LIVE (refus eBay
  garanti sinon) dès que la catégorie est utilisée.
