# eBay — un vêtement de mode rangé en sport, cyclisme ou équipement (10/10/2026)

> Suite du cas Manon (`docs/enquetes/manon-ebay-aspects-1010/RAPPORT.md` § 5) : son « Gilet
> GAP » est parti en « Sports, vacances › Cyclisme, vélos › Equipement du cycliste › Gilets »
> (177856). Règle de Nico (10/10) : un vêtement de mode ne part jamais dans une catégorie de
> sport, de cyclisme ou d'équipement, sauf si le titre ou la description le disent.

## 1. La cause

La catégorie eBay part d'abord du MOT de l'objet (`resoudreParMot`, `src/utils/categorieParMot.js`) :
une feuille de l'arbre relevé dont le libellé EST le mot, et une seule après le filtre du
genre, devient une CERTITUDE — sans IA, sans recours. Le seul garde-fou de famille
(`familleCategorie.js`) ne s'arme que sur une famille CERTAINE de l'objet (catalogue Vinted,
catégorie d'origine, icône d'autorité) ; un import Vinted sans catalogue n'en a pas. Or l'arbre
eBay FR range sous « Sports, vacances », « Auto, moto », « Bricolage », « Animalerie » et
« Collections » des feuilles qui portent les mots de la mode :

| mot (genre) | feuille EXACTE avant | après |
|---|---|---|
| gilet (tous) | Cyclisme › Equipement du cycliste › **Gilets** | écartée → icône |
| veste (tous) | Cyclisme › Equipement du cycliste › **Vestes** | écartée → icône |
| sac (femme) | Golf › Clubs et matériels › **Sacs** | écartée → icône |
| lunettes (tous) | Auto, moto › Casques, vêtements › Casques, accessoires › **Lunettes** | écartée |
| survêtement (femme, homme) | Fitness › … › **Survêtements** | écartée (sauf texte de sport) |
| collier (tous) | Animalerie › Chiens › **Colliers** | écartée |
| ensemble (femme, homme) | Disc Golf › **Ensembles** | écartée |
| basket(s) | Collections › Pins › Sports › **Basket** | écartée |

Et parmi les candidates soumises à l'IA (étape 3), la plupart des vêtements ont des feuilles
de sport : polo, short, pantalon, maillot, chaussures, gants, casquette, sweat, polaire, pull,
chaussettes, bottes, combinaison, ceinture… — d'où « Polo NAF NAF » choisi en Golf.

## 2. Annonces eBay DÉJÀ publiées par FillSell dans une mauvaise catégorie de ce type

Lecture seule, 578 jobs eBay dont FillSell a choisi la catégorie (les 2 690 autres sont des
annonces eBay relevées, rangées par leurs vendeurs) ; 16 sont dans un rayon « vêtement » d'une
branche spécialisée :

- **8 mal rangées** (mode sans un mot de sport) :
  · **en ligne** : « Sac MNG camel » (800745317785, Golf › Sacs), « Jordan Spizike Low bébé »
    (800760155217, Collections › Pins › Basket), « Adidas Tensaur Sport 2.0 CF I »
    (800760163791, Collections › Pins › Basket) ;
  · arrêtées depuis : « Polo NAF NAF » (307193237635, Golf), « Collier chic Lumière Rose »
    (158284431978, Animalerie › Colliers) ;
  · jamais parties : « Gilet GAP » (Manon), « Baskets Autry enfant » (Fitness), « Coffret collier
    yoga » (Animalerie, en attente de réponse).
- **8 bien rangées, inchangées** : maillot et veste de cyclisme, maillot NBA, chaussures Nike
  Total 90 (football), casque moto (choix de la personne), ceinture de musculation, maillot de foot
  Real Madrid et ensemble de foot Portugal (en Fitness : un rayon de sport, le texte nomme le sport).
- Rien n'est modifié : la règle ne vaut que pour les NOUVELLES publications.

## 3. La correction — `src/utils/brancheSpecialiseeEbay.js`, eBay SEULEMENT

Une feuille de « Sports, vacances » (hors « Vacances »), « Auto, moto », « Bricolage »,
« Animalerie » ou « Collections » dont la FEUILLE (ou son parent : « Maillots › Clubs
anglais ») nomme un vêtement ou un accessoire de mode n'est retenue que si le titre, la
description ou l'objet identifié disent la spécialité (mots du chemin au-dessus du rayon :
« cyclisme », « vélo », « golf », « chien »… et leurs synonymes, français et anglais : VTT, foot,
NBA, motorcycle, travail…). Sous « Sports, vacances », un texte qui nomme un SPORT suffit (article de sport, pas de
mode). Sinon :
- étape 2 : la certitude est retirée, eBay prend le chemin de son icône (« Gilet » → « Pulls,
  cardigans ») ;
- étape 3 : le CHOIX de l'IA dans un tel rayon n'est pas retenu — la question posée à l'IA est
  COMMUNE à toutes les plateformes et reste à l'octet celle d'avant ;
- chemin final : contrôlé une dernière fois (icône, vérification, descente) ; sans repli sûr,
  le rayon se demande (voie formulaire) ou le serveur choisit parmi les suggestions d'eBay (voie API).
Le chemin de repli d'eBay n'entre pas dans la vérification commune. Le choix de la personne
n'est jamais touché. Trace sur le job : `platform_fields.categorie_branche_specialisee`.
Hors périmètre : les suggestions d'eBay elles-mêmes (voie API, rayon incertain — « mallette de
toilette » en Vacances › Trousses, juste) ; « tableau » → Bricolage › Peintures (autre homonymie).

Selftest : `selftest:branche-specialisee-ebay` (arbre relevé + les 16 dépôts réels + câblage).

## 4. 11/10 — les 3 annonces encore en ligne (Tessy), rangées sans republier

Décision de Nico : ranger les trois annonces EN LIGNE de Tessy (voie API) dans la bonne catégorie,
sans supprimer ni republier (même numéro, vues et favoris gardés). Outil :
`ebay-api-worker` **v84**, action `reviser_annonce` mode `rayon_regle` (x-cron-secret, à la main ;
inverse : mode `restaurer`) ; pilote et rejeu de la règle :
`scripts/reparations/20261011_ebay_categories_tessy.mjs` ; sauvegarde AVANT écriture (offre
getOffer + article getInventoryItem + annonce publique + job) :
`_backup_1110_ebay_categories_tessy` (`…_sauvegarde.sql`).

- **Lecture (11/10 ~10:00)** : les trois en vente, 1 disponible, 0 vendu, offre PUBLISHED / ACTIVE.
- **Catégorie cible = la règle d'aujourd'hui** (resoudrePublication + brancheSpecialiseeEbay, eBay
  seul, voie API, appels IA réels en rejeu ; puis resoudreCategorie du serveur) : Sac → 169291
  « Femme : sacs, sacs à main » ; Jordan bébé → 147285 « Bébé : chaussures » ; Adidas CF I →
  155202 « Enfant unisexe : chaussures ».
- **Champs exigés du nouveau rayon** : liste fermée → entrée de la liste ; texte libre → mot LU
  dans le titre ou la description de l'annonce, sinon l'annonce est LAISSÉE.
- **800760163791 Adidas Tensaur — CORRIGÉE** : 121414 Pins › Basket → 155202 ; ajoutés Couleur
  « Blanc », Département « Enfant unisexe », Marque « adidas », Style « Baskets », Pointure EU « 23 »
  (Type « Sportif » gardé) ; état NEW inchangé (eBay l'affiche « Neuf avec emballage » dans ce
  rayon). Relu : même numéro, en ligne, 37,10 €, 1 disponible, offre (prix, quantité, politiques,
  description, emplacement) et article (titre, description, 11 photos, disponibilité) identiques.
- **800745317785 Sac MNG — LAISSÉE** : 169291 exige « Matière extérieure » et « Style » en texte
  libre ; ni « cuir » (la fiche dit d'ailleurs « Cuir synthétique », le job « Cuir ») ni « Sac porté
  épaule » ne se lisent dans le titre ou la description.
- **800760155217 Jordan bébé — LAISSÉE** : 147285 exige « Style » ; « Baskets » ne se lit ni dans le
  titre ni dans la description (« paire de Jordan pour bébé »).
- Aucun job créé, aucun mail, aucune autre annonce ; le job de l'Adidas porte le nouveau rayon et
  la trace `revision_rayon_regle`.
