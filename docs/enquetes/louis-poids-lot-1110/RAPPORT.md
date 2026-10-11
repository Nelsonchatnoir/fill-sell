# Poids Leboncoin du lot — régression du 10/10 (Louis, 11/10)

## La cause

- **Commit fautif : `9bdcfce`** (10/10 13:50, OTA **2.9.75**, web au même push) — « fix(lot) : plus de page
  blanche… » ; dans le même commit, « Poids (Nico, 10/10 : le lot doit se comporter exactement comme
  l'unité) » : `bilanArticle` ne pose plus le motif « poids » et le bloc Livraison devient
  « Poids du colis (facultatif) ». Plus rien n'exige le poids d'un article Leboncoin en lot.
- Pourquoi le lot du **10/10 à 19:44** avait encore 500 g : les 12 « Rangement » portaient déjà
  `inventaire.poids_g = 500`, écrit le **10/10 à 13:17** dans le bloc du lot par l'ANCIENNE règle (poids
  exigé ; 11 écritures `inventaire?id=…&user_id=…` de Chrome Windows, 13:17:39 → 13:18:04, dans les journaux
  de l'API). À 19:44, le lot (2.9.77) a relu le poids sur les fiches : la fonction n'avait déjà plus
  d'exigence, elle avait seulement une fiche remplie.
- Le 11/10, livres et vêtements arrivaient de Vinted SANS poids : le lot ne l'a pas demandé, le serveur l'a
  servi tel quel, l'extension a laissé l'estimation de Leboncoin.
- 2.9.77 → 2.9.78 → 2.9.79 n'y sont pour rien (eBay, « Ventes à confirmer »).
- Constat parc (14 jours) : **510** publications Leboncoin déposées sans poids, **18** comptes. À l'unité non
  plus le poids n'était pas exigé (carte Livraison « zéro friction ») ; chez Louis il passait parce que ses
  fiches le portaient.

## Ce qui est corrigé (11/10)

- **Lot** (`publication/lot/regles.js`, `LivraisonDuLot.jsx`, `LotPublication.jsx`) : retour à la règle du
  04/10 pour Leboncoin — sans poids, l'article est « à compléter », jamais prêt ; bloc Livraison
  « Poids du colis (obligatoire pour Leboncoin) », une valeur pour le lot (« Appliquer aux N sans poids »),
  réglable article par article, gardée sur la fiche ; transporteurs et format inchangés. Beebs seul : inchangé.
- **Unité** (`ListingPreviewScreen.jsx`, `EcranConfirmer.jsx`, `components/PoidsLeboncoin.jsx`) : sur
  « Confirmer », si ni la copie ni la fiche n'ont de poids, le champ s'affiche, Publier est grisé avec son
  motif, « Continuer sans Leboncoin » est offert (même forme que le port Depop). Fiche avec poids : rien ne change.
- **Serveur** (`_shared/poids-leboncoin.js`, get-pending-jobs **v234**, `verify_jwt` true lu avant/après) :
  une PUBLICATION Leboncoin sans poids (job + fiche) n'est jamais servie → `needs_user` avec le champ
  « Poids du colis » ; « 650 g » / « 1,2 kg » lus en grammes ; lecture ratée = laissée en file. Republication,
  retraits, autres plateformes : inchangés. Au déploiement : 0 publication Leboncoin en attente.
- **« À régler »** (`StockTab.jsx`) : la question part en grammes et vaut, d'un geste, pour les autres annonces
  Leboncoin du MÊME lot qui l'attendent ; la fiche reçoit le poids (jamais par-dessus un poids connu).

## Ce que Louis verra

Au prochain lot Leboncoin : « Poids du colis (obligatoire pour Leboncoin) » en tête, « N articles Leboncoin
sans poids », un champ et « Appliquer aux N sans poids » ; rien ne part sur Leboncoin avant. À l'unité : le
champ sur « Confirmer » seulement si la fiche n'a pas de poids.

## Les 30 annonces déjà parties (lecture seule, page publique Leboncoin, 11/10 ~12:40)

- Les 18 jobs de 11:05 ne sont PAS en attente : **publiés** entre 11:07 et 11:27.
- **12 livres** (10:07) : tous en ligne, Leboncoin affiche **100 g, format S**, livraison dès 1,69 €
  (point relais) / 4,48 € (domicile) ; 9 avec Mondial Relay + Colissimo, 3 (3286152341, 3286153091,
  3286156193) avec aussi Shop2Shop et Courrier suivi. « La ritournelle » (3286153826) : 410, retirée après
  sa vente Vinted. Exemple vêtement : pyjama 3286194266 → 250 g, S. Témoin du 10/10 19:44 : 3285968503 → 500 g, M.
- **Proposition, sans rien supprimer** : un livre de poche pèse en général 150 à 350 g, au-dessus des
  100 g déclarés. Corriger à la main chez Leboncoin : « Mes annonces » → « Modifier » → Livraison → poids
  (ex. 500 g), sur les 12 livres et les vêtements concernés ; l'annonce garde son numéro et son ancienneté.
  FillSell ne sait pas encore modifier une annonce Leboncoin en ligne : aucune action lancée.

## Preuves

- `selftest:lot-poids-leboncoin` (40 contrôles ; ROUGE sur la règle du 10/10, vérifié) ; `livraison-poids`
  et `publication-lot` recalés sur la règle rétablie.
- Selftests : avant 256/257 verts, après 257/258 (seul rouge, déjà rouge avant : `veille-commandes`).
- Aperçus : `capture-lot-publication` (24 captures, dont 10e « lot Leboncoin sans poids »),
  `capture-poids-leboncoin` (36 contrôles, geste « une fois pour le lot » prouvé en mémoire),
  `capture-stepper-moteur`, `capture-ventes-a-confirmer`, `capture-port-depop`, `capture-question-marque` : verts.
- OTA **2.9.81** servie (build `2026-10-11T10:43:03Z+7cb748e`).
