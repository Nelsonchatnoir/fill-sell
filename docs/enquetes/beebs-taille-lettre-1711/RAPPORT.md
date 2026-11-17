# 17/11 matin — Beebs, T-shirt homme en M : « 38 » imposé, lot arrêté (complément du lot, heure de Paris)

Verrou : `selftest:beebs-tshirt-homme-taille-m` (rouge avant : `'38' !== 'M'` ; vert après : 12 contrôles).
Aucun mail à l'utilisateur. Aucune donnée client modifiée.
Suite complète, 1re passe (09:28) : 839 selftests, **2 rouges** — `lot-defauts-2610` et `taille-bague-du-texte`, deux
contrôles de texte qui lisent la FIN de la liste `CHAMP_REQUIS_VERS_COPIE` (la nouvelle source y avait été ajoutée en
dernier) ; source déplacée après `grille_taille_unique_seule`, même ensemble, les deux repassent au vert. 2e passe (09:57) : 839, 0 rouge.
Après le commit 2e21265, `donnees-clients` a vu rouge : le selftest neuf (non suivi pendant la passe, donc non
relu) portait le nom du compte dans un libellé ; retiré (commit de docs suivant), `donnees-clients` vert et les
64 selftests qui balaient le dépôt : 0 rouge. Aucun code de l'app touché par ce retrait (OTA inchangée).

## Le cas
- thecloset72000 (8ac5bbda, payant), lot `123e6fcb-c8ba-409a-af82-9cb2673f5051` ouvert le 17/11 à 08:04 (build
  `ec07906`, OTA 2.9.208, Android) : 2 articles, dont le Levi's Batwing (inventaire 1794896251164001).
- `usage_logs` : `champ_requis_bloquant` Beebs « Taille », rayon « Mode > Homme > Vêtements (homme) > T-shirts (homme) »,
  affiché à 08:04:21 (levé à 08:07:47 par la personne) ; `lot_quitte_sans_envoyer` à 08:09:01 (2 à compléter, 0 prêt,
  bouton gris « Réponds aux questions pour envoyer »). Le Levi's n'est en ligne que sur Vinted.

## La grille Beebs de ce rayon (relevé `platform_category_aspects`, source dom)
« Taille » obligatoire, en **lettres seulement** : XS, S, M, L, XL, XXL, XXXL, 4XL … 8XL, Universel (13 valeurs). Aucun
« 38 ».

## Pourquoi M devient 38 — cause prouvée
- La fiche porte la taille Vinted **« M / 38 / 10 »** (lettre / FR / UK : UNE taille ; `attributs.taille`, source
  `vinted_liste`). La rédaction a rendu « M / 38 / 10 » pour Leboncoin, Beebs et eBay.
- À l'ouverture, `mergeFieldsWithLens` fait passer la taille de chaque copie par le sélecteur de l'app
  (`optionTaillePlateforme` → `findMatchingOption`, liste `size` : XS…XXL, 34…52, pointures, âges). Il essayait d'abord la
  taille ENTIÈRE par mots, et ce rapprochement écarte les options d'une seule lettre (« S », « M », « L » — garde de
  2026-07-20) : il trouvait « 38 » et ne lisait jamais les morceaux. XS, XL, XXL gardaient leur lettre ; S, M, L
  devenaient 36, 38, 40.
- Toutes les copies portaient donc « 38 » (`fiches_annonce.fiche.sharedFields.taille` = « 38 », preuve en base). Sur la
  grille Beebs homme en lettres, « 38 » est hors liste et un nombre ne devient jamais une lettre (règle des tailles) :
  question « Taille · Beebs » bloquante, et le lot n'envoie rien tant qu'un article a une question.
- Reproduit hors ligne sur la vraie liste `size` : `optionTaillePlateforme("M / 38 / 10")` = « 38 » (rouge du verrou).

## Ce qui change (pour tout le monde)
1. **La lettre reste une lettre** (`ListingPreviewScreen.jsx`, `optionTaillePlateforme`) : une taille composite (hors tour
   de taille) se lit d'abord telle quelle, puis morceau par morceau dans l'ordre du libellé — la lettre d'abord ; le
   rapprochement par mots seulement après. « M / 38 / 10 » → « M », « S / 36 / 8 » → « S », « L / 40 / 12 » → « L ».
   Inchangé : une seule écriture (« M », « 38 », « Taille unique » → « Unique »), « 12 ans / 152 cm » → « 12 ans », un tour
   de taille (« 33/34 », « W32 / L34 ») garde le chemin d'avant.
2. **Une copie qui n'a gardé que « 38 »** (brouillon ou fiche d'avant le correctif) : `tailleDeLaFicheDansLaGrille`
   (`moteur/listes.js`) — quand la valeur de la copie est hors grille ET qu'elle est l'un des morceaux de la taille
   composite DITE sur la fiche (capture, Vinted, relevé, saisie — jamais une estimation), la taille de la fiche est jugée
   dans la grille par le même jugement (« M » chez Beebs homme, « M / 38 » chez Beebs femme). Posée sur la copie de CETTE
   plateforme (champ dédié `taille`, `CHAMP_REQUIS_VERS_COPIE`), tracée `option_du_texte` source
   `taille_de_la_fiche_dans_la_grille`, jamais bloquante, modifiable (ligne « Taille » de la section Beebs du lot,
   sélecteur avec toute la grille). Jamais par-dessus une valeur que la grille porte.
3. **Sinon, la question** : « 38 » seul (fiche sans lettre) sur une grille en lettres → rien de suggéré, la question avec
   les 13 valeurs (puces + « Toute la liste »). Jamais une taille imposée, jamais une conversion nombre → lettre.

## Les autres rayons vêtements adulte de Beebs (homme et femme) — vérifiés sur le relevé du 17/11
| Grille | Rayons | XS…XXL / « M / 38 / 10 » |
|---|---|---|
| Lettres homme (XS…8XL, Universel) | 14 (T-shirts, pulls, sweats, manteaux, chemises, sport hauts) | « M » |
| Bas homme (32…64 + XS…8XL) | 13 (jeans, pantalons, shorts, joggings, survêtements) | « M » (jamais le 38 homme) |
| Costumes homme (lettres, 22…30, 42…78, 90…118) | 2 | « M » |
| Chemises homme, homonyme col (lettres + 35…52 cm) | 1 | « M » (règle des homonymes du 24/10) |
| Femme (« XXXS / 30 » … « 9XL / 58 », Taille unique, Autre) | 56 | « M / 38 » |
| Maternité (Taille unique, XXS…XXXL) | 3 | « M » |
| Maillots 1 pièce et 2 pièces (femme) : « Taille » = bonnets 75A…95L seulement | 2 | aucune lettre possible → la question, avec toute la grille (jamais une lettre convertie en bonnet) |
| Autres vêtements de sport (femme) : aucune liste relevée | 1 | présence = ok (aucune liste ne fait foi) |

## Constats sans changement
- Le Levi's est un T-shirt FEMME sur Vinted (rayon 221, taille au format femme « M / 38 / 10 »), titré « Homme » à
  l'origine (titre corrigé en « Femme » par la personne à 08:17) : la rédaction a pris « Homme » pour Beebs et eBay. Avec
  le correctif, la taille passe quand même (« M ») ; le rayon homme vient du titre d'origine.
- Depop : la rédaction (serveur) a écrit « 38 » d'elle-même pour cette copie — hors Beebs, non touché.

## Lecture après livraison
- `usage_logs` `champ_requis_bloquant` Beebs « Taille » sur les rayons homme en lettres : plus aucune copie en « 36 »,
  « 38 », « 40 » venue d'une fiche Vinted « S/M/L / nn / nn ».
- `option_du_texte` source `taille_de_la_fiche_dans_la_grille` dans les jobs Beebs (anciens brouillons rattrapés).
