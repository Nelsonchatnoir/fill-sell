# Tri photo par photo des couples « à vérifier » (fiches unitaires à deux annonces vivantes d'une plateforme)

> Lecture seule. Liste à jour des « à vérifier » (celle de `SIMULATION-338.md` en comptait 105, avant la correction du 05/11 soir). Simulation relancée en prod le **06/11/2026 09:44** (heure de Paris) par `scripts/simulation-fiches-deux-annonces.mjs` (version corrigée du 05/11 soir : une annonce n'est vivante que si le dernier relevé du compte l'a vue). Photos téléchargées le 06/11/2026 de 09:45 à 09:51, gros plans de 09:51 à 09:55. **Rien n'a été touché** : aucune annonce, aucune fiche, aucun rattachement, aucune écriture en base.

**78 couples « à vérifier »** ce matin, et non 79 : un seul couple est sorti de la classe depuis la lecture du 05/11 à 21:57 (thierry.ananou, eBay, fiche 1793609890281016, Pléiade Lewis Carroll) — l'annonce 237150264547 n'a plus été vue depuis le 04/11 à 07:46 alors que le dernier relevé eBay du compte date du 06/11 à 09:13 : la simulation la range désormais en « ne vit plus ». Aucun couple n'est entré. Ce 79e couple est trié à part, en annexe.

## Les chiffres

| Verdict | Couples | Comptes |
|---|---:|---:|
| **VRAI** | 62 | 18 |
| **FAUX** | 3 | 3 |
| **INDÉCIDABLE** | 13 | 6 |
| Total | 78 | 22 |

- **VRAI** = le même objet : mêmes photos, ou mêmes prises de vue du même exemplaire → deux annonces vivantes (ou plus) du même article sur la même plateforme : **risque de double vente**.
- **FAUX** = deux objets distincts (ou deux exemplaires distincts visibles) → le rattachement à une seule fiche est faux.
- **INDÉCIDABLE** = photos de catalogue (article neuf possiblement en plusieurs exemplaires) ou deux séances photo du même modèle sans signe distinctif.

Les 78 fiches sont au statut « stock » : aucune n'est vendue.

Aucune photo manquante : les 635 photos des 167 annonces ont été téléchargées et lues ; 605 avaient leur empreinte en base (`photo_empreintes`), les 30 autres (nino57270, n° 47 et 48) ont été mesurées ici avec le même module (`_shared/empreinte-image.ts` + variantes, puis `comparerPhotos`).

### Par plateforme

| Plateforme | Vrais | Faux | Indécidables | Total |
|---|---:|---:|---:|---:|
| Beebs | 31 | 1 | 0 | 32 |
| eBay | 16 | 0 | 8 | 24 |
| Leboncoin | 13 | 2 | 5 | 20 |
| Depop | 2 | 0 | 0 | 2 |

### Par compte

| Compte | Vrais | Faux | Indécidables | Total |
|---|---:|---:|---:|---:|
| sebastien64310 | 18 | 0 | 0 | 18 |
| benjamin.ployer | 7 | 0 | 0 | 7 |
| lupilou999 | 3 | 0 | 4 | 7 |
| dylan.fontaine13 | 6 | 0 | 0 | 6 |
| nino57270 | 5 | 0 | 1 | 6 |
| misscat801 | 5 | 0 | 0 | 5 |
| beautyandthedress | 3 | 0 | 0 | 3 |
| boncoin59300 | 3 | 0 | 0 | 3 |
| jul.reduc | 2 | 1 | 0 | 3 |
| louis | 0 | 0 | 3 | 3 |
| voirememe | 1 | 1 | 1 | 3 |
| thierry.ananou | 0 | 0 | 2 | 2 |
| tiblancdeshaut | 2 | 0 | 0 | 2 |
| xxewwer | 0 | 0 | 2 | 2 |
| djibril.ziate06 | 1 | 0 | 0 | 1 |
| geronimo0550 | 1 | 0 | 0 | 1 |
| josephinecerni | 1 | 0 | 0 | 1 |
| juchsregis | 1 | 0 | 0 | 1 |
| labouquinerie85 | 0 | 1 | 0 | 1 |
| meminiandmove | 1 | 0 | 0 | 1 |
| paugues.contact | 1 | 0 | 0 | 1 |
| quartierdeschineurs | 1 | 0 | 0 | 1 |

### Par motif de la simulation

| Motif (simulation) | Vrais | Faux | Indécidables | Total |
|---|---:|---:|---:|---:|
| dépôt ou republication FillSell à côté d'une annonce encore en ligne | 27 | 1 | 5 | 33 |
| titres différents mais photos identiques | 11 | 1 | 5 | 17 |
| titres reformulés, photos identiques ou proches | 11 | 0 | 1 | 12 |
| même titre, prix différents | 6 | 0 | 0 | 6 |
| même objet probable, preuve de remplacement absente | 4 | 0 | 0 | 4 |
| même titre et prix, descriptions différentes ou absentes | 3 | 0 | 0 | 3 |
| photos différentes | 0 | 1 | 2 | 3 |

Parmi les 62 vrais, **27** viennent d'un dépôt ou d'une republication de FillSell à côté d'une annonce encore en ligne (djibril.ziate06, geronimo0550, josephinecerni, meminiandmove, misscat801, nino57270, paugues.contact, sebastien64310, tiblancdeshaut).

## Méthode

1. Classe « à vérifier » de la simulation relancée (`--json`, `--md`, `--sauver-extraction` hors du dépôt).
2. Photos : `annonces_plateforme.capture -> photos` (6 au plus, comme la simulation), à défaut `photo_url` ; vignettes Leboncoin passées en `ad-large`. Téléchargées dans un dossier neuf du scratchpad (aucune image dans le dépôt).
3. Distances : `comparerPhotos` du moteur (`_shared/rapprochement/photos.js`, meilleure lecture dHash/pHash et variantes, appariement 1-1) sur les empreintes de la base, et recalculées sur les images téléchargées (sur les 98 paires d'annonces mesurables des deux façons : 89 identiques, 9 à 2 au plus d'écart — vignettes eBay de 140 px et une photo Leboncoin). ≤ 4 = identiques, > 12 = différentes.
4. **Chaque couple regardé** (planche des photos A au-dessus des photos B). Entre 4 et 12, ou quand les distances ne suffisent pas (catalogue, deux séances), gros plan : versions 500 ou 1600 px des photos eBay (le même fichier sur le CDN public d'eBay), photos Leboncoin en grand, recadrages. Le verdict vient du regard, jamais du titre ni du prix.

## Limites

- **eBay** : la capture ne garde souvent qu'**une** photo, en vignette de 140 px (benjamin.ployer, boncoin59300, juchsregis, lupilou999, quartierdeschineurs, thierry.ananou) ; pour les distances entre 4 et 12 (n° 4 à 10, 71) j'ai relu la même image en 500 px. Les autres photos de ces annonces n'ont pas été vues.
- **Vrai ≠ un seul exemplaire en stock** : des photos identiques prouvent la même prise de vue ; pour un article **neuf** ou de fantaisie (colonne « Remarque »), la personne peut avoir réutilisé la même photo pour un 2e exemplaire. Les vrais sur un objet d'occasion unique (vêtements de sebastien64310, misscat801, cartes de dylan.fontaine13, pièces auto de nino57270…) sont les plus sûrs.
- **Relevés anciens** : la simulation dit « vivante » si le DERNIER relevé du compte l'a vue ; pour certains comptes ce relevé est vieux (meminiandmove 25/09, djibril.ziate06 04/10, geronimo0550 14/10, misscat801 20/10, jul.reduc 26/10, labouquinerie85 28/10) : à revérifier sur la plateforme avant tout geste.
- **Depop** (n° 58 et 73) : les deux numéros d'annonce n'ont pas le même préfixe de boutique (se2astien64 / sebastienz4, joha4etalexia / johanetalexis) alors que les photos sont identiques : à confirmer sur Depop qu'il s'agit bien de deux annonces en ligne de la même boutique.
- 6 photos au plus par annonce (même borne que la simulation) ; les photos suivantes ne sont pas lues.

## Les couples, un par ligne

Distances : la plus basse et la plus haute des paires de photos appariées 1-1 (toutes annonces du couple confondues) ; « loc. » = mesurée ici faute d'empreinte en base. « Lu » = heure (Paris) de téléchargement des photos du couple. A, B… = annonces dans l'ordre de la colonne « Annonces ».

| N° | Compte | Plateforme | Fiche | Annonces | Motif (simulation) | Verdict | Distances | Ce que montrent les photos | Remarque | Lu |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | beautyandthedress | Leboncoin | 1793435717288006 | 2393121025 ; 2306266094 | même titre et prix, descriptions différentes ou absentes | **VRAI** | 0 – 0 · 5+5 ph. | 5/5 photos identiques : boucles portées sur mannequin et posées à plat sur tissu gris | bijou fantaisie neuf | 06/11 09:45 |
| 2 | beautyandthedress | Leboncoin | 1793436393065 | 2196444676 ; 2106783690 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 1+1 ph. | la photo unique est la même (bague sur présentoir blanc) | bijou fantaisie neuf | 06/11 09:45 |
| 3 | beautyandthedress | Leboncoin | 1793436393094 | 2196440389 ; 2107146195 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (bague sur présentoir, bague portée) | bijou fantaisie neuf | 06/11 09:45 |
| 4 | benjamin.ployer | eBay | 1793779949536 | 287584370345 ; 287540150666 | titres reformulés, photos identiques ou proches | **VRAI** | 5 – 5 · 1+1 ph. | vignettes eBay 140 px ; revue en 500 px : même prise de vue (t-shirt FDNY gris sur parquet), recadrage près |  | 06/11 09:45 |
| 5 | benjamin.ployer | eBay | 1793780966171012 | 287504538358 ; 287584255535 | titres reformulés, photos identiques ou proches | **VRAI** | 5 – 5 · 1+1 ph. | revue en 500 px : même prise de vue du maillot sur parquet, recadrée et plus saturée |  | 06/11 09:45 |
| 6 | benjamin.ployer | eBay | 1793780976635009 | 287584625143 ; 287652631367 | même objet probable, preuve de remplacement absente | **VRAI** | 10 – 10 · 1+1 ph. | revue en 500 px : même photo (canard Dark Vador posé sur sa boîte) | neuf en boîte | 06/11 09:45 |
| 7 | benjamin.ployer | eBay | 1793780976635023 | 287583815402 ; 287540148962 | même titre, prix différents | **VRAI** | 7 – 7 · 1+1 ph. | revue en 500 px : même prise de vue (t-shirt drapeau sur parquet) |  | 06/11 09:45 |
| 8 | benjamin.ployer | eBay | 1793780984485018 | 287641633341 ; 287663196561 | même objet probable, preuve de remplacement absente | **VRAI** | 0 – 0 · 1+1 ph. | même photo (veste en jean à plat sur parquet) |  | 06/11 09:45 |
| 9 | benjamin.ployer | eBay | 1793780994633020 | 287513346600 ; 287584346000 | titres reformulés, photos identiques ou proches | **VRAI** | 3 – 3 · 1+1 ph. | revue en 500 px : même photo (t-shirt Iceberg sur parquet) |  | 06/11 09:45 |
| 10 | benjamin.ployer | eBay | 1793780995574002 | 287584354628 ; 287540152728 | même titre, prix différents | **VRAI** | 5 – 5 · 1+1 ph. | revue en 500 px : même photo (t-shirt AC/DC sur parquet) |  | 06/11 09:45 |
| 11 | boncoin59300 | Beebs | 1792855465240018 | 29027429 ; 28959314 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 6+1 ph. | la seule photo de B est la photo 1 de A (camion Solido rouge) |  | 06/11 09:45 |
| 12 | boncoin59300 | Beebs | 1792855520447009 | 11636388 ; 11636399 | même objet probable, preuve de remplacement absente | **VRAI** | 0 – 0 · 1+1 ph. | même photo (t-shirt adidas étiqueté sur parquet) | neuf avec étiquette | 06/11 09:45 |
| 13 | boncoin59300 | eBay | 1792858490437 | 128026815082 ; 128027987580 | même titre, prix différents | **VRAI** | 0 – 0 · 1+1 ph. | même photo (gros plan de la moulure) |  | 06/11 09:45 |
| 14 | djibril.ziate06 | Beebs | 1789318757781007 | 33965598 ; 34005625 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 5+5 ph. | 5/5 identiques (sweat Nike bleu, étiquette L) | dernier relevé Beebs du compte le 04/10 | 06/11 09:45 |
| 15 | dylan.fontaine13 | Beebs | 1793525222856013 | 34284590 ; 34284975 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (carte Camerupt, recto et verso) |  | 06/11 09:45 |
| 16 | dylan.fontaine13 | Leboncoin | 1793525222856013 | 3286667636 ; 3285567619 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (même carte Camerupt) |  | 06/11 09:45 |
| 17 | dylan.fontaine13 | Beebs | 1793525222856015 | 34284576 ; 34297633 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (carte Dracaufeu ex) |  | 06/11 09:45 |
| 18 | dylan.fontaine13 | Beebs | 1793525222857016 | 34284568 ; 34285121 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (carte Pikachu) |  | 06/11 09:45 |
| 19 | dylan.fontaine13 | Beebs | 1793525222857018 | 34284556 ; 34297626 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (carte Psykokwak) |  | 06/11 09:45 |
| 20 | dylan.fontaine13 | Leboncoin | 1793525222857018 | 3285616924 ; 3295344632 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 2+2 ph. | 2/2 identiques (même carte Psykokwak) |  | 06/11 09:45 |
| 21 | geronimo0550 | Leboncoin | 1788603430237004 | 3266347704 ; 3266354336 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 6 – 15 · 5+5 ph. | revue en grand : même prise de vue recadrée et éclaircie — cordon et étiquette « 32 » posés à l'identique, même agrafe | neuf avec étiquette ; dernier relevé Leboncoin du compte le 14/10 | 06/11 09:45 |
| 22 | josephinecerni | Beebs | 1787440301966007 | 33939379 ; 33923195 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 3+3 ph. | 3/3 identiques (2 bonnets et tour de cou sur une table) |  | 06/11 09:45 |
| 23 | juchsregis | eBay | 1792329164447 | 136773343565 ; 135558967244 | même titre, prix différents | **VRAI** | 0 – 0 · 1+1 ph. | même photo (bloc coin de 10 timbres) | un marchand de timbres peut avoir plusieurs blocs identiques | 06/11 09:45 |
| 24 | jul.reduc | Leboncoin | 1793022147886010 | 3051567542 ; 3263403667 | titres reformulés, photos identiques ou proches | **VRAI** | 4,8 – 24 · 3+3 ph. | prises de vue différentes mais même séance : même porte, même cintre, même broderie noire au même endroit de la poitrine ; étiquette Mountain Surf 43/44 | dernier relevé Leboncoin du compte le 26/10 | 06/11 09:45 |
| 25 | jul.reduc | Leboncoin | 1793022148540003 | 3263119285 ; 3263120050 | photos différentes | **FAUX** | 24 – 25 · 2+2 ph. | deux numéros différents de Gulli le Mag : couvertures « Spécial — Entraîne-toi, joue, gagne » contre « Spécial jeux — Éclate-toi tout l'été », photos 2 différentes | dernier relevé Leboncoin du compte le 26/10 | 06/11 09:45 |
| 26 | jul.reduc | Leboncoin | 1793022148540018 | 3051564994 ; 3157196366 | titres reformulés, photos identiques ou proches | **VRAI** | 1,6 – 6,4 · 4+4 ph. | 4/4 mêmes photos (boîtier, CD, dos de Xtreme Boarders), dans un autre ordre | dernier relevé Leboncoin du compte le 26/10 | 06/11 09:45 |
| 27 | labouquinerie85 | Leboncoin | 1790234447801006 | 3263338771 ; 3263339062 | titres différents mais photos identiques | **FAUX** | 7 – 11 · 3+3 ph. | deux médailles différentes : « Porte-avions Clemenceau » contre « Ouragan » ; revers rouillés différemment | dernier relevé Leboncoin du compte le 28/10 | 06/11 09:45 |
| 28 | louis | Leboncoin | 1792340705460631 | 3093208950 ; 3295724704 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **INDÉCIDABLE** | 16 – 24 · 4+4 ph. | deux séances (A : couverture catalogue et photos au flash ; B : photos sans flash, prises de plus loin), même table grise ; livre neuf de série, aucun signe distinctif | B = republication FillSell du 26/10, A toujours vue | 06/11 09:45 |
| 29 | louis | Leboncoin | 1792340705460632 | 3093205143 ; 3295706276 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **INDÉCIDABLE** | 14,4 – 25,6 · 4+4 ph. | même cas que le tome 3 : deux séances, aucun signe distinctif | B = republication FillSell du 26/10, A toujours vue | 06/11 09:45 |
| 30 | louis | Leboncoin | 1792340705460633 | 3093205987 ; 3295691347 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **INDÉCIDABLE** | 16 – 24 · 4+4 ph. | même cas que le tome 3 : deux séances, aucun signe distinctif | B = republication FillSell du 26/10, A toujours vue | 06/11 09:45 |
| 31 | lupilou999 | Leboncoin | 1792979737692012 | 2993502351 ; 2906902511 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 24 · 6+6 ph. | 5/6 identiques ; la 6e de B est une autre vue de la même boîte | neuf en boîte | 06/11 09:45 |
| 32 | lupilou999 | Leboncoin | 1792979738718008 | 3026881517 ; 3116130462 | titres différents mais photos identiques | **VRAI** | 8 – 23 · 6+6 ph. | revue en grand : mêmes photos recadrées (même point sur la boîte, même étoile au stylo, même pince) | neuf en boîte | 06/11 09:46 |
| 33 | lupilou999 | eBay | 1792981718837 | 285945291503 ; 285945300862 | titres différents mais photos identiques | **INDÉCIDABLE** | 0 – 0 · 1+1 ph. | une seule photo par annonce, visuel publicitaire (femme dans une voiture) : rien ne montre l'exemplaire | article neuf | 06/11 09:46 |
| 34 | lupilou999 | Leboncoin | 1792981719278 | 2994448203 ; 2862134003 | titres différents mais photos identiques | **VRAI** | 0 – 31 · 6+6 ph. | 3 photos identiques et mêmes vues (lanterne blanche, mètre ruban) | neuve | 06/11 09:46 |
| 35 | lupilou999 | eBay | 1792981719451 | 285956332284 ; 285957516819 | titres différents mais photos identiques | **INDÉCIDABLE** | 0 – 0 · 1+1 ph. | une seule photo par annonce, rendu produit de catalogue | article neuf | 06/11 09:46 |
| 36 | lupilou999 | eBay | 1792981719567 | 285038673963 ; 286095056349 | titres différents mais photos identiques | **INDÉCIDABLE** | 0 – 0 · 1+1 ph. | une seule photo par annonce, visuel publicitaire (bandeau « Livraison rapide », cadre rouge) | article neuf | 06/11 09:46 |
| 37 | lupilou999 | eBay | 1792981719953 | 285444405412 ; 285927925170 | titres différents mais photos identiques | **INDÉCIDABLE** | 0 – 0 · 1+1 ph. | une seule photo par annonce, rendu produit de catalogue avec bandeau | article neuf | 06/11 09:46 |
| 38 | meminiandmove | Leboncoin | 1789663276967003 | 3271633022 ; 3273118819 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 3+3 ph. | 3/3 identiques (jogging Uhlsport, montage « Me Mini and Move » avec détail des défauts) | dernier relevé Leboncoin du compte le 25/09 ; les deux dépôts sont « cancelled » | 06/11 09:46 |
| 39 | misscat801 | Beebs | 1787988010354001 | 34089460 ; 34139502 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (robe longue en soie sur mannequin) | dernier relevé Beebs du compte le 20/10 | 06/11 09:46 |
| 40 | misscat801 | Beebs | 1787988012494005 | 34007457 ; 34137607 | même objet probable, preuve de remplacement absente | **VRAI** | 0 – 0 · 4+4 ph. | 4/4 identiques (rouge à lèvres tenu à la main) | neuf ; dernier relevé Beebs du compte le 20/10 | 06/11 09:46 |
| 41 | misscat801 | Beebs | 1789058619707005 | 34007419 ; 34139465 | même titre, prix différents | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (trench noir sur mannequin) | dernier relevé Beebs du compte le 20/10 | 06/11 09:46 |
| 42 | misscat801 | Beebs | 1789543948967001 | 34006241 ; 34139642 | même titre et prix, descriptions différentes ou absentes | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (marinière sur mannequin) | dernier relevé Beebs du compte le 20/10 | 06/11 09:46 |
| 43 | misscat801 | Beebs | 1789631767843003 | 34007388 ; 34092671 | même titre et prix, descriptions différentes ou absentes | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull tie-dye, mesures dessinées) | dernier relevé Beebs du compte le 20/10 | 06/11 09:46 |
| 44 | nino57270 | eBay | 1792325822435 | 820139092221 ; 820281259064 ; 820281268904 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 3+3+3 ph. | 3 annonces (FR, IT, EN), 3/3 identiques : clignotant et étiquette Mopar 98 372 604 80 | pièce neuve | 06/11 09:46 |
| 45 | nino57270 | eBay | 1792325822535 | 820117511665 ; 820281249917 ; 820281259162 ; 820281269230 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 4+4+4+4 ph. | 4 annonces (FR, EN, ES, IT), 4/4 identiques : calandre sur papier, étiquette « 19.05.25 » | pièce neuve | 06/11 09:46 |
| 46 | nino57270 | eBay | 1792325822734 | 820266799154 ; 820293053095 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 5+5 ph. | 5/5 identiques (rétroviseur VW, filigrane Leboncoin) |  | 06/11 09:46 |
| 47 | nino57270 | eBay | 1792325822759 | 820199979900 ; 820287270026 ; 820287273237 ; 820287278635 | titres différents mais photos identiques | **VRAI** | 0 – 0 (loc.) · 5+5+5+5 ph. | 4 annonces (FR, DE, ES, IT), 5/5 identiques : feu Audi Q4, même étiquette Valeo | empreintes absentes en base : mesurées ici | 06/11 09:46 |
| 48 | nino57270 | eBay | 1792325822791 | 358891180175 ; 820281249837 ; 820281269209 ; 820281303188 | titres différents mais photos identiques | **INDÉCIDABLE** | 0 – 0 (loc.) · 5+5+5+5 ph. | 4 annonces (FR, ES, IT, DE), 5/5 identiques, mais ce sont des rendus 3D et des photos du fabricant : rien ne montre l'exemplaire | article neuf, vendu en nombre possible ; empreintes en partie mesurées ici | 06/11 09:46 |
| 49 | nino57270 | eBay | 1793448433071 | 820283667716 ; 820285486592 ; 820285488550 ; 820285490088 ; 820285507441 ; 820293059700 | titres différents mais photos identiques | **VRAI** | 0 – 0 · 5+5+5+5+5+5 ph. | 6 annonces (FR, IT, EN ×2, DE, ES), 5/5 identiques : rétroviseur Cupra, étiquette « Ref SA0002385 » | deux annonces anglaises au même titre | 06/11 09:46 |
| 50 | paugues.contact | Leboncoin | 1792686704185 | 3293061757 ; 3293252854 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 22 · 5+5 ph. | 3 photos identiques (cadre, gravure) et 2 gros plans proches (« E.A. », signature) | eau-forte à 300 € | 06/11 09:46 |
| 51 | quartierdeschineurs | eBay | 1793188899278 | 326909517725 ; 327006243111 | même titre, prix différents | **VRAI** | 0 – 0 · 1+1 ph. | même photo (machine à écrire ouverte) |  | 06/11 09:46 |
| 52 | sebastien64310 | Beebs | 1792419778337004 | 34257872 ; 34232750 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull Sutex gris) |  | 06/11 09:46 |
| 53 | sebastien64310 | Beebs | 1792419778337022 | 34201198 ; 34219888 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull Pendleton noir) |  | 06/11 09:46 |
| 54 | sebastien64310 | Beebs | 1792419778837000 | 34207295 ; 34232738 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (robe motifs marins) |  | 06/11 09:46 |
| 55 | sebastien64310 | Beebs | 1792419778838008 | 34207263 ; 34232729 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull beige) |  | 06/11 09:47 |
| 56 | sebastien64310 | Beebs | 1792419778838018 | 34201162 ; 34219780 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull Debra-Lin bleu) |  | 06/11 09:47 |
| 57 | sebastien64310 | Beebs | 1792419784528007 | 34207177 ; 34232713 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 4+4 ph. | 4/4 identiques (sweat tie-dye « Take care of yourself ») |  | 06/11 09:47 |
| 58 | sebastien64310 | Depop | 1792419784528009 | se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145 ; sebastienz4-superbe-sweat-shirt-vintage-en-provenance-815c | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 4+4 ph. | 4/4 identiques (sweat OneTeam, étiquette Gildan) | les deux numéros Depop n'ont pas le même préfixe (se2astien64 / sebastienz4) | 06/11 09:47 |
| 59 | sebastien64310 | Beebs | 1792419784528010 | 34207112 ; 34232699 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (boots Dr. Martens serpent, semelles) |  | 06/11 09:47 |
| 60 | sebastien64310 | Beebs | 1792419785081001 | 34201500 ; 34220450 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 5+5 ph. | 5/5 identiques (pull rayé H&M) |  | 06/11 09:47 |
| 61 | sebastien64310 | Beebs | 1792419785081003 | 34201152 ; 34219808 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (gilet Hilda) |  | 06/11 09:47 |
| 62 | sebastien64310 | Beebs | 1792419785081018 | 34201455 ; 34220440 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (veste soie rouge et dorée) |  | 06/11 09:47 |
| 63 | sebastien64310 | Beebs | 1792419785081019 | 34201445 ; 34220426 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (pull rayé laine) |  | 06/11 09:47 |
| 64 | sebastien64310 | Beebs | 1792419785622008 | 34201113 ; 34219795 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (gilet Lyle & Scott) |  | 06/11 09:47 |
| 65 | sebastien64310 | Beebs | 1792419785622009 | 34201313 ; 34220422 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (robe brodée) |  | 06/11 09:47 |
| 66 | sebastien64310 | Beebs | 1792419785622014 | 34201747 ; 34220469 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (manteau Herno) | manteau à 230 € | 06/11 09:47 |
| 67 | sebastien64310 | Beebs | 1792419785622016 | 34201725 ; 34220464 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (bermuda Ralph Lauren) |  | 06/11 09:47 |
| 68 | sebastien64310 | Beebs | 1792419785622019 | 34201704 ; 34220457 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (t-shirt Zara) |  | 06/11 09:47 |
| 69 | sebastien64310 | Beebs | 1792419786257013 | 34207081 ; 34232691 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (coupe-vent adidas) |  | 06/11 09:47 |
| 70 | thierry.ananou | Leboncoin | 1793609897316019 | 3280512445 ; 3276339663 | photos différentes | **INDÉCIDABLE** | 19,2 – 19,2 · 1+1 ph. | revue en grand : deux séances (reflet de film plastique sur l'une, nappe laquée sur l'autre), même édition Grasset ; aucun signe distinctif lisible |  | 06/11 09:47 |
| 71 | thierry.ananou | eBay | 1793609904527002 | 237124135034 ; 235554184369 | titres reformulés, photos identiques ou proches | **INDÉCIDABLE** | 11 – 11 · 1+1 ph. | revue en 500 px : deux prises de vue (pochette nue / pochette sous plastique), même pressage Telefunken ; rien de distinctif |  | 06/11 09:47 |
| 72 | tiblancdeshaut | Beebs | 1792681249690 | 34216423 ; 34216511 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (Dr Martens 1460 Bex sur moquette) |  | 06/11 09:47 |
| 73 | tiblancdeshaut | Depop | 1792681249690 | joha4etalexia-bottines-dr-martens-1460-bex-fefa ; johanetalexis-bottines-dr-martens-1460-bex-bdb9 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **VRAI** | 0 – 0 · 6+6 ph. | 6/6 identiques (mêmes Dr Martens) | les deux numéros Depop n'ont pas le même préfixe (joha4etalexia / johanetalexis) | 06/11 09:47 |
| 74 | voirememe | Beebs | 1786376708642 | 33796902 ; 34175359 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **FAUX** | 0 – 26 · 3+4 ph. | une seule photo commune (Frodon dans son emballage) ; B montre Gollum dans son propre emballage et son étiquette (photos 3-4), absents de A : deux peluches, Frodon et Gollum | B = republication FillSell du 15/10 titrée « Gollum », fiche « Frodon » | 06/11 09:47 |
| 75 | voirememe | eBay | 1786391424075 | 318722535247 ; 318915983088 | titres reformulés, photos identiques ou proches | **VRAI** | 0 – 0 · 3+3 ph. | la photo de la boîte est la même (0) ; les 2 autres sont des visuels de catalogue | neuf | 06/11 09:47 |
| 76 | voirememe | eBay | 1786467363570 | 318722482770 ; 318915983592 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **INDÉCIDABLE** | 0 – 0 · 3+3 ph. | 3 visuels de catalogue Hasbro identiques, aucune photo de l'exemplaire | article neuf | 06/11 09:47 |
| 77 | xxewwer | eBay | 1789717155362005 | 377195987960 ; 377268359155 | photos différentes | **INDÉCIDABLE** | 16 – 23 · 5+4 ph. | deux séances (table en bois et plante / tapis blanc), même édition PAL FR/NL ; aucun défaut commun repéré au gros plan du dos (la tache claire est imprimée) | les deux annonces eBay relevées pour la 1re fois à un jour d'écart (18 et 19/09) | 06/11 09:47 |
| 78 | xxewwer | Leboncoin | 1789717155362005 | 3201361859 ; 3299578544 | dépôt ou republication FillSell à côté d'une annonce encore en ligne | **INDÉCIDABLE** | 15 – 25 · 5+4 ph. | mêmes deux séances que sur eBay (n° 77) ; aucun signe distinctif | B = republication FillSell du 31/10, A toujours vue | 06/11 09:47 |

## Les vrais, à regarder en premier (risque de double vente)

- **Beebs** (31) : n° 11 boncoin59300 29027429 + 28959314 ; n° 12 boncoin59300 11636388 + 11636399 ; n° 14 djibril.ziate06 33965598 + 34005625 ; n° 15 dylan.fontaine13 34284590 + 34284975 ; n° 17 dylan.fontaine13 34284576 + 34297633 ; n° 18 dylan.fontaine13 34284568 + 34285121 ; n° 19 dylan.fontaine13 34284556 + 34297626 ; n° 22 josephinecerni 33939379 + 33923195 ; n° 39 misscat801 34089460 + 34139502 ; n° 40 misscat801 34007457 + 34137607 ; n° 41 misscat801 34007419 + 34139465 ; n° 42 misscat801 34006241 + 34139642 ; n° 43 misscat801 34007388 + 34092671 ; n° 52 sebastien64310 34257872 + 34232750 ; n° 53 sebastien64310 34201198 + 34219888 ; n° 54 sebastien64310 34207295 + 34232738 ; n° 55 sebastien64310 34207263 + 34232729 ; n° 56 sebastien64310 34201162 + 34219780 ; n° 57 sebastien64310 34207177 + 34232713 ; n° 59 sebastien64310 34207112 + 34232699 ; n° 60 sebastien64310 34201500 + 34220450 ; n° 61 sebastien64310 34201152 + 34219808 ; n° 62 sebastien64310 34201455 + 34220440 ; n° 63 sebastien64310 34201445 + 34220426 ; n° 64 sebastien64310 34201113 + 34219795 ; n° 65 sebastien64310 34201313 + 34220422 ; n° 66 sebastien64310 34201747 + 34220469 ; n° 67 sebastien64310 34201725 + 34220464 ; n° 68 sebastien64310 34201704 + 34220457 ; n° 69 sebastien64310 34207081 + 34232691 ; n° 72 tiblancdeshaut 34216423 + 34216511
- **eBay** (16) : n° 4 benjamin.ployer 287584370345 + 287540150666 ; n° 5 benjamin.ployer 287504538358 + 287584255535 ; n° 6 benjamin.ployer 287584625143 + 287652631367 ; n° 7 benjamin.ployer 287583815402 + 287540148962 ; n° 8 benjamin.ployer 287641633341 + 287663196561 ; n° 9 benjamin.ployer 287513346600 + 287584346000 ; n° 10 benjamin.ployer 287584354628 + 287540152728 ; n° 13 boncoin59300 128026815082 + 128027987580 ; n° 23 juchsregis 136773343565 + 135558967244 ; n° 44 nino57270 820139092221 + 820281259064 + 820281268904 ; n° 45 nino57270 820117511665 + 820281249917 + 820281259162 + 820281269230 ; n° 46 nino57270 820266799154 + 820293053095 ; n° 47 nino57270 820199979900 + 820287270026 + 820287273237 + 820287278635 ; n° 49 nino57270 820283667716 + 820285486592 + 820285488550 + 820285490088 + 820285507441 + 820293059700 ; n° 51 quartierdeschineurs 326909517725 + 327006243111 ; n° 75 voirememe 318722535247 + 318915983088
- **Leboncoin** (13) : n° 1 beautyandthedress 2393121025 + 2306266094 ; n° 2 beautyandthedress 2196444676 + 2106783690 ; n° 3 beautyandthedress 2196440389 + 2107146195 ; n° 16 dylan.fontaine13 3286667636 + 3285567619 ; n° 20 dylan.fontaine13 3285616924 + 3295344632 ; n° 21 geronimo0550 3266347704 + 3266354336 ; n° 24 jul.reduc 3051567542 + 3263403667 ; n° 26 jul.reduc 3051564994 + 3157196366 ; n° 31 lupilou999 2993502351 + 2906902511 ; n° 32 lupilou999 3026881517 + 3116130462 ; n° 34 lupilou999 2994448203 + 2862134003 ; n° 38 meminiandmove 3271633022 + 3273118819 ; n° 50 paugues.contact 3293061757 + 3293252854
- **Depop** (2) : n° 58 sebastien64310 se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145 + sebastienz4-superbe-sweat-shirt-vintage-en-provenance-815c ; n° 73 tiblancdeshaut joha4etalexia-bottines-dr-martens-1460-bex-fefa + johanetalexis-bottines-dr-martens-1460-bex-bdb9

## Les faux (rattachement à une seule fiche faux)

- n° 25 · jul.reduc · Leboncoin · fiche 1793022148540003 : 3263119285 « Magazine gulli le mag spécial beyblade poster et stickers inclus » / 3263120050 « Magazine gulli le mag avec poster spécial beyblade » — deux numéros différents de Gulli le Mag : couvertures « Spécial — Entraîne-toi, joue, gagne » contre « Spécial jeux — Éclate-toi tout l'été », photos 2 différentes.
- n° 27 · labouquinerie85 · Leboncoin · fiche 1790234447801006 : 3263338771 « Porte clé vintage Augis » / 3263339062 « Porte clé vintage marine nationale » — deux médailles différentes : « Porte-avions Clemenceau » contre « Ouragan » ; revers rouillés différemment.
- n° 74 · voirememe · Beebs · fiche 1786376708642 : 33796902 « Squishmallow Le Seigneur des Anneaux Frodon » / 34175359 « Squishmallow Le Seigneur des Anneaux Gollum » — une seule photo commune (Frodon dans son emballage) ; B montre Gollum dans son propre emballage et son étiquette (photos 3-4), absents de A : deux peluches, Frodon et Gollum.

## Annexe — le 79e couple, sorti de la classe depuis le 05/11

- thierry.ananou · eBay · fiche 1793609890281016 « Lewis Carroll Œuvres – Bibliothèque de la Pléiade – Coffret » : 237150264547 « Lewis Carroll Œuvres (Bibliothèque de la Pléiade) » 40 € / 237094905924 « Lewis Carroll Œuvres – Bibliothèque de la Pléiade – Coffret – Relié » 45 €. Distance 8 (base) / 11 (ici), une photo de chaque côté, revue en 500 px : **INDÉCIDABLE** — deux prises de vue différentes du même coffret Pléiade sur fond blanc (angle et ombre différents), rien de distinctif. La simulation le range désormais en « ne vit plus » (237150264547 plus vue depuis le 04/11 07:46 ; son dépôt FillSell signalait « Impossible de vérifier cette annonce sur eBay »).

