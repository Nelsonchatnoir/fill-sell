# Point 5 — banc ancien / nouveau des aspects eBay (18/10 nuit, 00:45-00:55 Paris)

Lecture seule : fonction `ia-banc-deduction` (secret de cron, aucune écriture, aucune publication, aucun cache dans la
comparaison). Corpus : les 91 dernières demandes réelles d'aspects eBay des 30 jours (usage_logs `ebay_aspects_ia`, une par
article), 34 catégories, 196 champs ; contexte relu sur le job eBay de l'article ; listes et modes depuis `ebay_item_aspects` ;
référence = la valeur publiée sur le job (après les réponses de la personne). L'ancien chemin est lancé DEUX fois (il n'a pas
de température fixée : la différence entre ses deux passages est le bruit), le nouveau une fois.

| Mesure | Ancien (1er passage) | Ancien (2e passage) | Nouveau (un appel) |
|---|---|---|---|
| Champs remplis (196) | 180 (91,8 %) | 180 (91,8 %) | 168 (85,7 %) |
| Égaux à la valeur publiée | 127 / 178 (71,3 %) | 125 / 178 (70,2 %) | 112 / 166 (67,5 %) |
| SELECTION_ONLY (46) remplis / justes | 46 / 46 | — | 45 / 45 |
| FREE_TEXT (150) remplis / justes | 134 / 81 | — | 123 / 67 |
| Appels par article | 1,35 | — | 1,00 |
| Coût par article (Haiku 4.5, 1 $ / 5 $ par M jetons) | 0,00141 $ | — | 0,00122 $ (−13 %) |
| Durée par article | 1 356 ms | — | 889 ms |

Accord ancien / ancien (bruit) : 96,1 %. Accord ancien / nouveau : 81,7 %. **La qualité baisse → le regroupement N'EST PAS
activé** (`coin_config.ia_aspects_groupes = 0`).

Pourquoi (33 divergences hors bruit, toutes ci-dessous) : demandés ensemble, le modèle évite de réutiliser un mot du titre
pour deux aspects (« Pull » en Type ET en Style : Style vide ou « Col V ») — exactement le défaut du cas Manon du 10/10 qui
avait fait passer la seconde passe à « un aspect par appel » ; il perd aussi l'écriture de la liste (« PS3 » au lieu de
« PlayStation 3 ») et une fois un SELECTION_ONLY (Département « Homme » vide). L'ancien chemin reste en service.

## Le cache (même question = réponse déjà payée), prouvé sur le même corpus
Mode « cache » du banc, 60 cas : l'ancien chemin deux fois, cache forcé — **110 champs posés, 110 identiques** au second
passage, **0 appel** au second passage (81 au premier). Les lignes rangées par le banc ont été effacées (table vide relue).

## Les 33 divergences
| Champ | Article | Ancien 1 | Ancien 2 | Nouveau | Publié |
|---|---|---|---|---|---|
| Type (libre) | Estampe Artistique Signée & Datée - Scène Mystér | Art mural | Art mural | Cadre photo | Art mural |
| Plateforme (libre) | 🎮 SoulCalibur IV – PS3 – Platinum – sans notice | PlayStation 3 | PlayStation 3 | PS3 | Sony PlayStation 3 |
| Style (libre) | Womans new size 38 trainers | Knit mesh | Knit mesh | — | Tricot mesh |
| Style (libre) | Woman size 39 trainers new | Lace-up | Lace-up | — | Mesh |
| Type (libre) | Lot de 2 T-shirts de sport Nike & Under Armour - | T-shirt | T-shirt | T-shirt de sport | T-shirt |
| Style (libre) | Sweat à capuche Carhartt WIP gris - Taille M | Streetwear | À capuche | Pull | Streetwear |
| Type (libre) | Bottines Liu Jo en cuir noir – Pointure 38 | Bottes | Bottes | — (refus) | Bottillon |
| Style (libre) | Bottines Liu Jo en cuir noir – Pointure 38 | Bottillon | Bottillon | Classique | Chelsea |
| Type (libre) | Mini Brands Disney Store ZURU – magasin miniatur | Figurine | Figurine | magasin miniature | Magasin miniature |
| Plateforme (libre) | 🎮 Castleween – PlayStation 2 PS2 | PlayStation 2 PS2 | PlayStation 2 PS2 | PlayStation 2 | Sony PlayStation 2 |
| Plateforme (libre) | 🎮 Mortal Kombat: Deadly Alliance – PS2 – sans n | PlayStation 2 | PlayStation 2 | PS2 | Sony PlayStation 2 |
| Nom du jeu vidéo (libre) | 🎮 Medal of Honor : Soleil Levant – PS2 – Sans n | Medal of Honor: Soleil levant | Medal of Honor: Soleil levant | Medal of Honor : Soleil Levant | Medal of Honor: Soleil Levant |
| Style (libre) | Surf# ensemble combinaison + chausson # Décathlo | Combinaison de surf | Combinaison de surf | — | Combinaison |
| Style (libre) | Pull#taille XL# | Pull | Pull | — | Pull |
| Style (libre) | Pull à Capuche#Sweat#Bonobo#taille L | À capuche | À capuche | — | Pull |
| Département (fermée) | Pull à Capuche#Sweat#Bonobo#taille L | Homme | Homme | — | Homme |
| Type (libre) | Pull à Capuche#Sweat#Bonobo#taille L | Pull | Pull | — | Pull a capuche |
| Style (libre) | Pull#jules#taille L | Pull | Pull | — | Pull |
| Style (libre) | Pull#Celio#taille M | Pull | Pull | — | Pull |
| Type (libre) | Salopette#jean# taille 44#Jules | Pantalons | Pantalons | Salopette | Pantalons |
| Style (libre) | Pull / sweat à capuche / Tommy Hilfinger / Tommy | À capuche | Pull | Fermeture éclair sur toute la longueur | Pull |
| Style (libre) | Pull - col rond - Zara- pull léger  gris taille  | Pull | Pull | Col rond | Pull |
| Style (libre) | Pull. / coton / XL / lafayette / col V / bleu cl | Pull | Pull | Col V | Pull |
| Style (libre) | Pull col V | Pull | Pull | Col V | Pull |
| Type (libre) | Pentax K1000 - Boîtier reflex argentique monture | Boîtier reflex argentique | Boîtier reflex argentique | Digital SLR | Boîtier reflex argentique |
| Style (libre) | Short Nike Dri-FIT Training Femme Noir M | Dri-FIT | Dri-FIT Training | Short bermuda | Training |
| Nom du jeu vidéo (libre) | 🎮 Dragon Ball Z Budokai Tenkaichi 2 – PS2 Plati | Dragon Ball Z: Budokai Tenkaichi 2 | Dragon Ball Z: Budokai Tenkaichi 2 | Dragon Ball Z Budokai Tenkaichi 2 | Dragon Ball Z: Budokai Tenkaichi 2 |
| Type (libre) | 🍄 pièce magie de Noël | Pièce de magie de Noël | Pièce de magie de Noël | pièce magie de Noël | Autre |
| Type (libre) | Statue Letti | Statue en bois | Statue en bois | Statue | Sculpture en bois |
| Hauteur (libre) | Affiche Baron Noir Oyo illustration urbaine 70x1 | 100 cm | 100 cm | — (refus) | 70 cm |
| Longueur (libre) | Affiche Baron Noir Oyo illustration urbaine 70x1 | 70x100 cm | 70x100 cm | — | 105 cm |
| Style (libre) | Veste en jean Levi's sherpa doublée fourrée L. 2 | Sherpa doublée | Sherpa doublée | Trucker | Sherpa doublée |
| Style (libre) | Jeans Levi's 901 Femme Vintage braguette à bouto | Straight | Straight | Jean droit | Straight |