# Champs obligatoires eBay demandés alors que l'IA pouvait les remplir — cas Manon (10/10/2026)

> Compte touché : Manon Simon (`19785fd7…`), palier gratuit, extension 0.6.106, app Android.
> Données de la personne lues en lecture seule ; rien n'a été modifié chez elle (eBay
> reste en pause, c'est son choix ; aucun mail).

## 1. Ce qui s'est passé (journaux et base)

| Heure (Paris) | Fait |
|---|---|
| 16:45:30 | lot de 6 articles importés de Vinted vers Leboncoin, Beebs, eBay ; mur du quota : 4 retenus |
| 16:45:40–52 | 4 rédactions (`generate_listing`, `texte_vendeur_origine: vinted_sync`, titre verrouillé, aucune description) |
| 16:45:44–55 | `champ_requis_bloquant` « affiche », eBay catégorie **63862 « Manteaux, vestes »** : `Type` ×1, `Style` ×3 |
| 16:46:40 | un seul job eBay créé : le **Gilet GAP**, qui n'avait AUCUNE question |
| 16:46:50 | « abandonne » sur les 4 questions (écran quitté) |
| 16:49:22 | eBay mis en pause par la personne (`abandon_plateforme`) → job du gilet annulé |

Les trois articles bloqués sont les **polaires** (pull polaire 1/4 zip, veste polaire full zip,
polaire 1/4 zip). Le gilet n'a pas buté sur une question : il est parti (et son job portait
la catégorie **177856 « Sports, vacances › Cyclisme, vélos › Equipement du cycliste ›
Gilets »** — cf. § 5, défaut distinct).

## 2. La cause

Catégorie 63862 (listes réelles, `ebay_item_aspects`) :
`Type` FREE_TEXT [Blazer, Cap, Coatigan, Gilet, Manteau, Poncho, Veste] ;
`Style` FREE_TEXT [3 en 1, Anorak, Bermuda, Bombers, Caban, College, Coupe vent, Doudoune,
Imperméable, Kimono, Manteau basique, Matelassé, Moto, Pardessus, Parka, Trench, Veste militaire].
**Aucune entrée de `Style` ne décrit une polaire** ; `Pull` n'est pas dans `Type`.

1. **La seconde passe n'existait que sur la voie API.** L'extraction IA des exigés eBay est
   UNE règle partagée (`_shared/ebay-aspects-ia.ts`) entre la voie formulaire (stepper et lot →
   `generate-listing` `resolve_aspects`) et la voie API (`ebay-api-worker` → `remplirAspects`).
   Mais seule la voie API relance, depuis le 06/09, une **seconde passe** sur les aspects
   FREE_TEXT restés vides (« le terme exact du contexte »). Sur la voie formulaire — celle de
   Manon —, la première passe, fidèle à « ne jamais inventer », rendait `null` pour `Style`
   (aucune entrée de la liste ne convient) : la question partait. Même article, même
   catégorie : rempli par l'API, demandé par l'extension.
   *Preuves* : appels `generate-listing` de Manon à 16:45:42 / 44 / 45 (réponses de 97, 69,
   84 octets — trop courtes pour porter `Style`) ; rejeu à l'identique sur le compte de test
   (§ 4) : `Style` ×3 et `Type` ×2 sur 63862, puis plus aucune question avec la seconde passe.
2. **Trois trous du moteur de l'écran** (stepper ET lot, `ListingPreviewScreen`) :
   - quand la catégorie change (celle de l'icône, puis celle de la résolution), la liste
     des exigés d'AVANT reste servie le temps de la relecture : défauts, option nommée par le
     titre, extraction IA et marque « IA terminée » travaillaient sur elle, sous la clé de la
     nouvelle catégorie (une catégorie marquée « IA faite » sans que ses champs aient été
     demandés ; des valeurs d'une autre catégorie collées — « Type : Pull » de « Pulls,
     cardigans » sur le job du gilet) ;
   - « une seule tentative par catégorie » : un exigé devenu manquant après le premier
     appel n'était jamais demandé à l'IA ;
   - un appel qui n'aboutit pas (réseau du téléphone, 5xx) valait « l'IA n'a rien trouvé » :
     question immédiate. Pour la troisième polaire (rédaction finie à 16:45:52), un
     *preflight* `generate-listing` est arrivé à 16:45:52.705 sans POST derrière, et la
     question est apparue à 16:45:55 (les journaux d'edge perdent parfois une ligne : indice,
     pas preuve).

Ce n'était ni « les importés Vinted » ni « le lot » en tant que tels : le moteur est le même à
l'unité ; le lot et les imports (titre seul, pas de description) le rendent juste plus visible.

## 3. Mesure — 30 jours de `champ_requis_bloquant` (comptes de test exclus)

| Plateforme | affichés | complétés | abandonnés | personnes | personnes ayant abandonné | abandon |
|---|---|---|---|---|---|---|
| **Toutes** | 1 313 | 1 050 | 106 | 101 | 17 | 8 % |
| Beebs | 402 | 266 | 38 | 63 | 6 | 9 % |
| Opla | 339 | 311 | 2 | 15 | 2 | 1 % |
| Leboncoin | 333 | 279 | 32 | 46 | 7 | 10 % |
| Vinted | 124 | 110 | 8 | 44 | 6 | 6 % |
| **eBay** | 115 | 84 | 26 | 20 | 4 | **23 %** |

Les plus demandés : Opla `Taille` (jeans, 207 — Opla sortie le 10/10) ; Leboncoin Décoration
`Produit` (84, 15 personnes) ; Leboncoin Mode `Univers` (78, 13) ; Leboncoin Électroménager
`Produit` (47, **47 % d'abandon**) ; Beebs `Taille` / `Marque` / `Format du colis`.
eBay : `Matière` partagée (13), `Marque` (8), 15687 `Taille` (6), 63861 `Longueur de la robe`
(5, 40 %), **63862 `Style` (5, 100 % d'abandon, 2 personnes)**, **63862 `Matière doublure
externe` (5, 100 %)**, 79654 Hauteur/Longueur/Largeur (mesures : légitimes), 53159 `Type`…
**Même mur que Manon : 2 personnes** sur 63862 (Manon, et `ed4d2d4e` le 10/10 à 13:40).
Limite : avant ce correctif, les lignes eBay ne nommaient pas l'article (corrigé : elles portent
`inventaire_id`) ; une ligne « affiche » compte une ouverture d'écran, pas un article.

## 4. Correction (racine, pas ce seul cas)

- **Serveur** (`generate-listing` **v114**, `completerAspectsIA`) : la demande de l'encart eBay
  (stepper et lot — elle porte le mode de chaque aspect) reçoit la seconde passe de la voie API.
  Première passe inchangée ; seconde passe sur les seuls FREE_TEXT restés vides, jamais
  SELECTION_ONLY, jamais la Marque ; une entrée de la liste eBay recopiée telle quelle, sinon le
  mot LU dans le titre / la description / les attributs (chaque mot), sinon refus tracé et la
  question part. Le canal générique (Vinted, Leboncoin, Beebs) est strictement inchangé.
  Mesure : `usage_logs` « ebay_aspects_ia » (catégorie, article, demandés, posés, valeurs,
  seconde passe, refus). Effet immédiat sur TOUTES les versions de l'app (l'encart envoie le mode
  depuis le 06/09).
- **Moteur** (`src/publication/moteur/aspectsEbayAuto.js`, câblé dans `ListingPreviewScreen`) :
  rien n'est posé, demandé ni « terminé » sur la liste d'une autre catégorie ; chaque aspect est
  demandé une fois PAR catégorie ; un appel qui échoue est retenté une fois (eBay ET le canal
  générique) ; une valeur posée par le moteur pour une autre catégorie, absente de la liste
  d'ici, est reprise (jamais une saisie de la personne) ; les lignes `champ_requis_bloquant`
  nomment l'article.
- **Garde-fous** : SELECTION_ONLY → valeur de la liste ou rien ; FREE_TEXT → la liste d'abord,
  sinon un mot lu dans le texte (eBay accepte une valeur hors de ses suggestions sur ces
  champs-là, l'extension la valide par Entrée — doctrine du 30/07 ; la voie API le fait depuis
  le 06/09) ; jamais une valeur absente du texte. Le format de colis n'est jamais deviné
  (inchangé). Aucune modification de l'extension.

## 5. Ce qui reste demandé, et pourquoi

- Tailles, pointures, âges, marques hors référentiel, état, format de colis : jamais déduits
  (règles existantes : une taille se traduit, un colis se mesure).
- Mesures (Hauteur, Largeur, Longueur…) : seulement si les chiffres sont dans le texte.
- Un aspect FREE_TEXT dont ni la liste ni le texte ne disent rien (ex. « Longueur de la robe »
  sur une robe dont le titre ne dit pas la longueur) : la question part, liste en main.
- **Défaut distinct, non corrigé ici** : `resoudreParMot("gilet")` rend EXACTEMENT la feuille
  177856 « Cyclisme › Gilets » (reproduit) ; « veste » rend 36124 « Cyclisme › Vestes ». Le
  gilet de Manon serait parti en équipement de cycliste. Mesuré sur 60 jours : 1 job en 177856
  (le sien), 1 en 36124 (une vraie veste de cyclisme). À trancher : un changement de catégorie
  touche des annonces déjà bien rangées.
- Leboncoin `Produit` (Décoration, Électroménager) : la liste relevée dépend de l'« Univers »
  choisi ; hors de ce correctif.

## 6. Rejeu réel (compte de Nico, articles de TEST à 999 €)

Quatre fiches `vinted_sync` sans description ni type (1791660000000001…004 : veste polaire
full zip, pull polaire 1/4 zip, polaire 1/4 zip, gilet), lot vers Vinted, Leboncoin, eBay, Beebs,
Depop, arrêté à « Avant l'envoi » (rien d'envoyé) :

- **avant** (prod du 10/10 18:13) : 63862, `Style` ×3 et `Type` ×2 demandés — le cas Manon ;
- **serveur v114, app d'avant** (18:17) : **aucune question eBay** ; posé : veste polaire
  `Type` Veste (titre) + `Style` « Veste polaire » ; pull polaire `Type` « Pull polaire » +
  `Style` « 1/4 zip » ; polaire `Type` Gilet (liste) + `Style` « Polaire 1/4 zip » ;
- après la mise en ligne de l'app : cf. compte rendu de la session.
