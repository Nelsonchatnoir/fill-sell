# Casio G-Shock ne se republie plus : rayon Vinted déplacé — 28/09 soir

## Faits (lus en base et sur Vinted, session de Nico)

- Article « Casio Montre G-Shock noire », inventaire 1785444834689, annonce
  Vinted 10062296164 (boutique 250623918). Job 7af0ec78 en `needs_user`
  `capture_incomplete` : « categorie (catalog_id → chemin de libellés) ».
  Arrêt AVANT suppression, annonce toujours en ligne.
- Captures valides 2046, 3112, 5196, 6633 (28/08 → 19/09) : `natif.catalog_id`
  97, chemin Hommes > Accessoires > Montres. Captures 9187 (22:34) et 9188
  (23:04) : `catalog_id` **5570** et deux attributs nouveaux, `department=575`
  et `size=1435` (« Taille unique », groupe 62 « Montres »).
- Même échec sur 0.6.75 et 0.6.78 : ce n'est pas une régression de nos builds.

## Cause (constatée en direct)

1. **5570 n'existe dans aucun arbre** `/api/v2/item_upload/catalogs` : ni
   celui du compte de Nico (548 390 o, 2 905 rayons), ni l'arbre anonyme
   (549 259 o, 2 910 rayons). `/catalog/5570` rend « Articles » sur vinted.fr et
   vinted.co.uk. Les ids 5493–5589 sont presque tous absents : rayons créés par
   Vinted mais pas encore exposés.
2. **Le formulaire d'édition de Vinted lui-même affiche la catégorie VIDE**
   pour la Casio (`catalogId: 5570` dans ses données, `#category` vide).
3. **La page publique de la même annonce dit 97** : `"item":{"id":10062296164,
   …,"catalog_id":97` et plugin fil d'Ariane `"item_id":…,"catalog_id":97`,
   liens `/catalog/5-hommes`, `/catalog/82-accessoires`, `/catalog/97-montres`.
4. Vinted remanie ses catégories **compte par compte** : l'arbre de Nico n'a
   plus « Jupes » (11) ni ses sous-rayons 198, 199, 200, 2927, 2928, remplacés
   par une feuille « Jupes » 5523 ; seule différence avec l'arbre anonyme.
   Depuis le 26/09 : 25 comptes ont l'arbre nouveau, 8 l'ancien, aucun n'a
   changé de variante. Le 19/09, l'arbre de Nico faisait déjà 548 382 o.
5. `size_groups` à 122 Ko : présent chez la plupart des comptes depuis le
   27/09, **aucune** capture incomplète de taille depuis le 20/09.

Notre résolution `catalog_id → chemin` descend l'arbre du formulaire : un id
absent de l'arbre ne se résout pas. La garde a fait son travail : rien de
supprimé.

## Correctif : extension 0.6.79 (ffbcb27, zip 52b214b)

Quand l'id du formulaire d'édition est **absent de l'arbre du compte**,
`capturerAnnonceVinted` lit la page publique de l'annonce et n'accepte son
rayon que si :
- le `catalog_id` est attaché à l'identifiant exact de l'annonce, et tous les
  porteurs de la page disent le même ;
- c'est une **feuille** de l'arbre du formulaire de ce compte ;
- le fil d'Ariane de la page, s'il se lit, est exactement le chemin d'ids de
  l'arbre jusqu'à lui.

Sinon : catégorie manquante, arrêt avant suppression, comme avant. Aucune
table de correspondance. Page redirigée vers `/session-refresh` (jeton web
périmé) : motif nommé, rien conclu. `libelles.catalog_id_depot` porte l'id
posé à la recréation (`vinted_ids`, `inventaire.vinted_catalog_id`, attributs
du détail) ; le `natif` reste intact. Une capture ordinaire ne fait aucune
requête de plus.

- Zip : `build\CWS-0.6.79-A-TELEVERSER\fillsell-extension-0.6.79-cws.zip`,
  BUILD_ID `2026-09-28T21:44:46Z+52b214b`, SHA-256
  `cb587e3aaf8eb3d6478fa19776666c1779c4d59ad0aab54a67c65bdf74b9c8d4`.
  Dossier à charger pour un test : `extension-0.6.79-a-charger` à côté.
- Écart avec le zip 0.6.78 (au BUILD_ID près) : `background.js`,
  `content-scripts/vinted.js`, `manifest.json`. Les 28 autres fichiers sont
  identiques. La 0.6.78 (zip, dossier Nico, version) n'a pas été touchée.

## Preuves

- **Direct sur Vinted** (fonctions extraites du source, collées dans la page
  de la Casio) : `resoudreCheminCatalogue(5570)` → null (panne reproduite) ;
  `catalogueDeLaPagePublique` → 97, Hommes > Accessoires > Montres, fil
  d'Ariane 5 > 82 > 97. Article inexistant → HTTP 404, null.
- **Formulaire de dépôt réel** (/items/new, rien soumis, aucun brouillon) :
  Hommes > Accessoires > Montres existe, champs Marque, Taille, État,
  Couleur, Matériau, Prix, colis 1/2/3/8 — pas de champ « department ».
- `npm run selftest:vinted-rayon-deplace` (vrai code extrait, source ET
  paquet minifié) : panne reproduite sur 2701d9a ; résolution 97 ; aucune
  requête de plus si l'id est dans l'arbre (libellés et requêtes identiques
  à 2701d9a) ; 8 refus (rayon absent, non feuille, deux rayons, fil
  divergent, autre article, page vide, 403, session-refresh).
- **Rejeu parc** : les 2 404 captures depuis le 20/09 (natif réel, arbre de
  leur variante) passent dans l'ancien et le nouveau code : 2 402
  identiques ; seules 9187 et 9188 changent (→ Montres 97). La page n'est lue
  que pour elles.
- Selftests voisins : mêmes résultats qu'en 2701d9a (republication-securite
  et vinted-taille-eu échouaient déjà, sorties identiques).

## Parc depuis le 20/09

| | Captures « incomplet » | Jobs `capture_incomplete` |
|---|---|---|
| catalog 5570 (Casio, Nico) | 2 (9187, 9188) | 1 (7af0ec78) |
| catalog 1582, photo non re-hébergée (25/09) | 1 | 0 |

Rayons déplacés constatés : **Jupes** (11, 198, 199, 200, 2927, 2928 → 5523,
comptes de la variante nouvelle, sans échec : Vinted a déjà renuméroté leurs
annonces, 35 captures 5523 valides) et **Montres** (97 → 5570, la Casio seule
à ce jour ; les montres des autres comptes étaient encore 22/97 le 27/09).
Exposés au même basculement : 44 montres en stock sur Vinted (8 comptes),
58 jupes sur les anciens rayons (18 comptes). Avec 0.6.75–0.6.78, un
basculement = republication arrêtée avant suppression ; avec 0.6.79, résolue.
Un article porte `vinted_catalog_id` 5546 (étui à lunettes, 27/08), absent
des deux arbres : sans capture, non touché.

Publication neuve : aucun job Vinted en échec de catégorie ou de taille depuis
le 26/09. Le fichier `_shared/vinted-catalogue-fr.js` (arbre anonyme du 25/09)
reste juste pour l'arbre anonyme ; chez un compte de la variante nouvelle,
la pose par ids d'une jupe (11 absent) retombe sur les libellés, comme prévu.

## Non fait, volontairement

- **Preuve réelle de republication de la Casio en attente** : Nico a répondu
  « pas maintenant ». Geste : chrome://extensions → désactiver la 0.6.78,
  charger `extension-0.6.79-a-charger`, recharger un onglet fillsell.app,
  puis relancer la Casio (`relancer_republish`). Attendu : capture avec
  `categorie_page_publique` résolu, `republish_step = recreated`, nouvelle
  annonce sur la fiche, aucun doublon au relevé suivant.
- Rien au Chrome Web Store, aucun enregistrement, minimum 0.6.75 inchangé.
- Aucun déploiement serveur, aucune migration, aucun job d'utilisateur
  relancé, aucun mail. Ventes automatiques et cron `doublons-balayage-2min`
  toujours suspendus.
- L'app lit encore `natif.catalog_id` au clic Publier (import d'un article
  Vinted) : un article basculé en 5570 y resterait non mappé. À traiter côté
  app (`libelles.catalog_id_depot` est dans la réponse), avec une OTA.
