# Relevé formulaire dépôt Leboncoin — 5 juillet 2026

Source : navigation réelle de `leboncoin.fr/deposer-une-annonce` (session authentifiée),
catégorie testée : Mode > Montres & Bijoux, titre test "Montre Casio A158 digitale vintage".

## Architecture : WIZARD multi-étapes (≠ Vinted monopage)

1. **Titre** (`input[name="subject"]`, 200 car. max)
   → déclenche des **suggestions de catégorie** (radios avec `value` = ID numérique
   de catégorie, ex. 42 = Mode > Montres & Bijoux) + un sélecteur manuel 2 panneaux.
2. **"Dites-nous en plus"** : photos (20 max, `input[type=file]`, `label[for="photo-input"]`)
   + critères DYNAMIQUES par catégorie (voir plus bas). Certains critères sont
   **pré-remplis automatiquement depuis le titre** (Univers=Homme, Type=Montre quartz,
   Marque=Casio pour notre titre test).
3. Interstitiel "On cherche le juste prix" → **prix pré-suggéré** avec fourchette
   recommandée (30 €, fourchette 14–85 € pour la Casio) + annonces similaires.
4. **Aperçu final éditable** : Galerie, Présentation (`#subject`, `textarea#body`),
   Informations clés (critères), Prix (`#price_cents`, + toggle "Je fais un don"),
   Remise du bien (`#location` adresse obligatoire, autocomplete).
   ⚠️ Le "Continuer" de CETTE page porte la mention « je confirme l'exactitude… » :
   c'est l'engagement de publication. Les modes de remise détaillés (format colis)
   n'apparaissent qu'après adresse précise / étape suivante — NON relevés (arrêt
   volontaire avant tout risque de publication).

## Sélecteurs & interactions

- IDs React dynamiques (`:form-field-_r_X_`) → INUTILISABLES. Stratégie fiable :
  `label[for="<nom-semantique>"]` → remonter au wrapper → `input[role="combobox"]`.
- Les critères sont des **combobox** (`role="combobox"`, `aria-haspopup="dialog"`,
  `aria-controls="<id>-menu"`) : clic → menu `<id>-menu` avec options en `li`.
  Un simple `dispatchEvent(click)` synthétique SUFFIT à les ouvrir (≠ Vinted qui
  exigeait la séquence pointerdown/mousedown complète sur certains champs).
- Champs texte stables : `subject` (titre), `body` (description, textarea),
  `price_cents` (prix), `location` (adresse), `photo-input` (file).
- Labels `for` relevés sur Montres & Bijoux : `accessories_univers`,
  `watches_jewels_type`, `watches_jewels_brand`, `watches_jewels_material`,
  `condition` — noms PAR CATÉGORIE (préfixe watches_jewels_*), sauf `condition`
  (générique) et vraisemblablement `accessories_univers` (partagé rayon Mode).

## Arbre catégories (sélecteur du formulaire, 2 niveaux, 13 racines)

- Emploi : Offres d'emploi
- Véhicules : Voitures | Motos | Caravaning | Utilitaires | Nautisme | Équipement auto | Équipement moto | Équipement caravaning | Équipement nautisme
- Immobilier : Ventes immobilières | Locations | Colocations | Bureaux & Commerces
- Locations de vacances : Locations saisonnières
- Électronique : Ordinateurs | Accessoires informatique | Tablettes & Liseuses | Photo, audio & vidéo | Téléphones & Objets connectés | Accessoires téléphone & Objets connectés | Consoles | Jeux vidéo
- Maison & Jardin : Ameublement | Papeterie & Fournitures scolaires | Électroménager | Arts de la table | Décoration | Linge de maison | Bricolage | Jardin & Plantes
- Famille : Équipement bébé | Mobilier enfant | Vêtements bébé
- Mode : Vêtements | Chaussures | Accessoires & Bagagerie | Montres & Bijoux
- Loisirs : Antiquités | Collection | CD - Musique | DVD - Films | Instruments de musique | Livres | Modélisme | Vins & Gastronomie | Jeux & Jouets | Loisirs créatifs | Sport & Plein air | Vélos | Équipements vélos
- Animaux : Animaux | Accessoires animaux | Animaux perdus
- Matériel professionnel : Tracteurs | Matériel agricole | BTP - Chantier gros-oeuvre | Poids lourds | Manutention - Levage | Équipements industriels | Équipements pour restaurants & hôtels | Équipements & Fournitures de bureau | Équipements pour commerces & marchés | Matériel médical
- Services : Artistes & Musiciens | Baby-Sitting | Billetterie | Covoiturage | Cours particuliers | Entraide entre voisins | Évènements | Services à la personne | Services aux animaux | Services de déménagement | Services de réparations électroniques | Services de jardinerie & bricolage | Services évènementiels | Autres services
- Divers : Autres

Un seul arbre observé (pas de divergence navbar/formulaire constatée à ce stade,
mais le canal "suggestions par titre" (IDs numériques) est une 2e voie de sélection
— même taxonomie, radio value = category id).

## Listes fermées relevées (catégorie Montres & Bijoux)

- **État** (`condition`, 5 options) :
  `État neuf | Très bon état | Bon état | État satisfaisant | Pour pièces`
  ⚠️ Le prompt FillSell actuel dit "Neuf" (≠ "État neuf") et "État correct"
  (n'existe pas — c'est "État satisfaisant").
- **Univers** (`accessories_univers`) : `Femme | Homme | Enfant | Mixte`
  ✅ Leboncoin A un rayon Mixte — mapping 1:1 avec platform_fields.genre.
- **Matière** (`watches_jewels_material`, 19 options, PAR CATÉGORIE ≠ Vinted global) :
  Acier | Argent | Bois | Céramique | Cuir | Diamant | Doré | Métal | Or blanc |
  Or jaune | Or jaune & blanc | Or rose | Perles | Pierre | Plaqué or | Tissu |
  Titan | Plastique | Autre  ("Autre" = filet générique, absent chez Vinted)
- **Type** (`watches_jewels_type`, 23 options) : Bague … Montre quartz … Autre

## Points ouverts (à relever au premier dry-run réel)

- Modes de remise / format colis exacts (nécessitent l'adresse réelle du compte).
- Les critères des AUTRES catégories (vêtements : taille ? couleur ?) — champs
  dynamiques par catégorie, à découvrir par les messages d'erreur "options réelles"
  du handler (même méthode que Vinted).
- L'API des suggestions de catégorie par titre (non capturée — réseau à tracer).
