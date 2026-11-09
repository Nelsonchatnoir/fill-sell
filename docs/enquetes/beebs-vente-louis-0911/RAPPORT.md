# Vente Beebs non détectée — louis-seller@ttfamily.fr, commande Beebs 1723956 (09/11/2026)

Lecture seule sur ses données (aucun job, aucun article, aucun réglage touché, aucun mail).

## Cause prouvée : la page des ventes Beebs n'est plus lue nulle part depuis l'extension 0.6.132 (24/10)
- La règle (18/10) : une commande lue sur la page « Ventes » de Beebs est une vente prouvée (`commandes_beebs_noter`) ;
  la lecture part quand une annonce Beebs est vue « plus en ligne » (veille, au plus une fois par 30 min et par compte).
- Le lecteur `lecteurCommandesBeebs` (`chrome-extension/messagerie.js`) est envoyé dans l'onglet Beebs par
  `chrome.scripting.executeScript({ func })`, qui ne transmet QUE le texte de la fonction. Le 23/10 (f081a28 →
  extension 0.6.132), trois fonctions du flux RSC (`lignesFluxRsc`, `resolveurFluxRsc`, `commandesDuFluxRsc`) ont été
  posées À CÔTÉ du lecteur : dans la page, « commandesDuFluxRsc is not defined » (reproduit : le lecteur reconstruit
  depuis son seul texte lève cette erreur), résultat vide → `{ ok: false, motif: "sans_resultat" }` → un simple
  `console.warn`, aucun appel au serveur.
- Preuve en base : plus AUCUN bilan `usage_logs ventes_beebs_commandes` depuis le 25/10 17:09, tous comptes ; les 6
  derniers viennent tous du build `2026-10-23T11:19:48Z+4098342` (antérieur à f081a28). Le selftest du lecteur
  l'appelait dans Node, avec ses voisines : il restait vert.
- Deuxième verrou, voulu : l'interrupteur `coin_config.ventes_beebs_commandes` = 0 (mode fantôme, décision de Nico du
  24/10 : il ne s'allume qu'après une liste de bilans fantômes relue). Même lecteur réparé, une commande Beebs lue
  n'écrit rien tant qu'il vaut 0.
- La piste « relevé de 13:08 à 60 annonces » n'est pas la cause : « 60 affichées, la page n'en affichait pas plus,
  puis 0 » est la forme normale du relevé Beebs, que l'index public complète (même heure : josephinecerni 284/284,
  thecloset72000 114/114). Aucun relevé Beebs de louis-seller le 09/11 (dernier : 08/11 09:41).

## L'article (les articles) de la commande
- 5 annonces Beebs de louis-seller, « en ligne » chez nous, absentes de toutes les lectures du 09/11, et dont la fiche
  publique Beebs dit `SoldOut` (ld+json, lu le 09/11 soir) : 34200615 Pyjama Kiabi 10 ans, 34200624 Jean skinny Tape à
  l'œil 8 ans, 34292479 Jean Tape à l'œil 9 ans, 34292493 Pantalon velours Zara 9 ans, 34292511 Jean Kiabi 9 ans.
- Aucun retrait FillSell sur elles (`retiree_le` vide, aucun job de retrait) : ce n'est pas notre « Vendu via une autre
  plateforme ». La veille les a vues « plus en ligne » (09/11 14:46 → 16:23 UTC, `sale_signal = unavailable`) : 5
  questions « Plus en ligne — vendue ? » attendent Louis dans l'app.
- Toujours en ligne ailleurs (risque de double vente) : Vinted et Depop pour les 5, Leboncoin pour 3.
- Limite : le CONTENU de la commande 1723956 (quels numéros de produit) ne se lit que dans le navigateur de Louis
  (page des ventes Beebs) ; « SoldOut » seul ne prouve pas une vente sur Beebs (règle du 24/10). Rien n'est enregistré
  à sa place sur ce seul signe.

## Correctif de la règle (tous les comptes) — extension, à livrer
- `lecteurCommandesBeebs` porte ses trois fonctions EN LUI (autonome, comme l'exige l'en-tête de messagerie.js).
- Un échec de lecture de la page des ventes se trace au serveur : `usage_logs ventes_beebs_lecture_echec` (motif,
  détail, build), au plus une fois par lecture (30 min par compte).
- Selftests : `lecteurs-autonomes` (31 contrôles : les 21 fonctions que background.js envoie dans une page, ESLint
  no-undef sur leur seul texte ; rouge sur l'ancien code) et `beebs-commandes-flux-rsc` cas 12 (le lecteur reconstruit
  depuis son texte lit les mêmes commandes ; rouge sur l'ancien code).

## Ce qui fait passer la vente par le circuit normal
1. Tout de suite : Louis répond « Vendu » sur les cartes « Plus en ligne — vendue ? » des articles de la commande →
   vente Beebs enregistrée (règle du 18/10 après-midi), retraits Vinted / Depop / Leboncoin par le circuit.
2. Ensuite, pour tous : extension réparée livrée + interrupteur `ventes_beebs_commandes` à 1 (décision de Nico) → la
   commande est lue, rattachée par numéro de produit exact, vente prouvée, retraits ailleurs, sans geste.
