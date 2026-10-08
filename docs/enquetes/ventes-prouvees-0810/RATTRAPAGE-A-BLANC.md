# Rattrapage des ventes prouvées « sold » — À BLANC (lecture seule)

Produit le 08/10/2026 23:17:29 (heure de Paris) par
`node scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs` — **rien n'a été écrit** (`set transaction read only`).
Règle : la sélection du cron, lue dans la migration 20261008233100 (preuve « sold » seulement). Chaîne simulée :
retrait des copies prouvées, question « Déjà vendu ? » pour les copies non prouvées, publications en attente arrêtées.
Comptes de test, de Nico et d'Ornella exclus des comptages (listés à part en fin). Heures de Paris.

## Totaux

- Annonces « sold » prouvées encore en stock (sélection) : **95** (dont 0 sur des comptes internes).
- **À enregistrer** (aucun doute) : **90 articles, 24 comptes**.
- Copies qui seraient **retirées** : leboncoin 13, ebay 6, opla 7, beebs 1.
- Questions « Déjà vendu ? » qui seraient posées (copies non prouvées) : opla 5.
- Publications en attente qui seraient arrêtées : leboncoin 1, beebs 1.
- **À vérifier** (rien enregistré) : 5 articles, 5 comptes.
- Signaux « sold » SANS preuve (jamais enregistrés) : 23.

## 1. URGENTS — une copie vue en ligne ailleurs depuis 3 jours (12 à enregistrer + 1 à vérifier)

| Compte | Fiche | Annonce vendue | Preuve « sold » | Copies retirées | Questions / autres |
|---|---|---|---|---|---|
| 3424a25d | 1790755057182007 | vinted 10226166053 | 08/10 21:49 | leboncoin 3279545448 (vue 08/10 21:39) | — · arrêt : leboncoin |
| 53efea05 | 1790073977695000 | vinted 10194594311 | 07/10 20:10 | ebay 407236403967 ; leboncoin 3279744835 (vue 08/10 11:51) | — |
| 68e350f0 | 1790234453975006 | vinted 6454011453 | 07/10 10:22 | — | opla art_5caaa4142ba527082a8b720faddbbb03 (vue 08/10 02:38) |
| 68e350f0 | 1790234469330002 | vinted 4928162945 | 07/10 10:22 | — | opla art_a3fd1f3bf1a4d417ec98619ca78c7ff1 (vue 08/10 04:48) |
| 68e350f0 | 1790234453975005 | vinted 6454055225 | 07/10 10:22 | — | opla art_34da9e69ff6fd0d720f22dafa98f4668 (vue 08/10 02:38) |
| 68e350f0 | 1790234469330003 | vinted 4928144112 | 07/10 10:22 | — | opla art_d47a42426569840436ed8749824cb22e (vue 08/10 04:48) |
| 68e350f0 | 1790234431981000 | vinted 4548646130 | 07/10 10:22 | leboncoin 3261964869 (vue 07/10 21:21) ; opla art_7e4b8806e1416b5e7e76c54a29ace40c (vue 08/10 05:55) ; beebs 15735893 (vue 07/10 21:14) | — |
| bd380fbf | 1790675300157002 | vinted 10168225847 | 05/10 13:43 | opla art_51a7424aaed3ea0f2b03c1a427cccd38 (vue 08/10 16:46) | — |
| bd380fbf | 1790675302910002 | vinted 10118119413 | 05/10 13:43 | opla art_9ebda04d5cc945d648aa6db982d99ad6 (vue 08/10 16:51) | — |
| bd380fbf | 1790675326713001 | vinted 9942725895 | 05/10 13:43 | opla art_f6317ada980a3a9b0b0c839836ccd70e (vue 08/10 16:06) | — |
| bd380fbf | 1790675351607006 | vinted 9650568538 | 05/10 13:43 | opla art_ea5b2980e135cbdf71d12440d486e579 (vue 08/10 15:54) | — |
| bd380fbf | 1790675386675003 | vinted 8093255222 | 05/10 13:43 | opla art_f08bdab5ffa766b528b163d4fd9758f9 (vue 08/10 16:44) | — |
| 66ffd657 | 1790523715035002 | vinted 10152700586 | 04/10 09:34 | **à vérifier : remise_en_ligne_possible(1)** | copies vues : leboncoin 3254540549 (08/10 12:50) ; beebs 33817108 (08/10 12:53) ; ebay 820034102196 (08/10 12:50) |

## 2. Par compte (à enregistrer)

| Compte | Articles | Retraits par plateforme | Questions | Publications arrêtées | Dont urgents |
|---|---|---|---|---|---|
| 53efea05 | 17 | leboncoin 8, ebay 6 | — | — | 1 |
| d8b07167 | 12 | — | — | — | 0 |
| c15f4b0e | 9 | — | — | — | 0 |
| bd380fbf | 7 | opla 5 | — | — | 5 |
| 68e350f0 | 5 | leboncoin 1, opla 1, beebs 1 | opla 4 | — | 5 |
| 8fd381a7 | 4 | — | — | — | 0 |
| 35892b98 | 3 | — | — | — | 0 |
| 63b80b36 | 3 | — | — | — | 0 |
| 66ffd657 | 3 | — | — | — | 0 |
| 6f41de45 | 3 | leboncoin 2 | — | — | 0 |
| 7c5f4407 | 3 | — | — | — | 0 |
| c539df45 | 3 | — | — | — | 0 |
| e847ef68 | 3 | leboncoin 1 | — | beebs 1 | 0 |
| ebccb132 | 3 | — | — | — | 0 |
| 8a2eba68 | 2 | — | — | — | 0 |
| ab3ecfab | 2 | — | — | — | 0 |
| 2189c4d8 | 1 | — | — | — | 0 |
| 273e3013 | 1 | — | — | — | 0 |
| 3424a25d | 1 | leboncoin 1 | — | leboncoin 1 | 1 |
| 63ad8597 | 1 | opla 1 | — | — | 0 |
| 8ed7a854 | 1 | — | opla 1 | — | 0 |
| cf0af028 | 1 | — | — | — | 0 |
| d74ce4ab | 1 | — | — | — | 0 |
| ec8a6da4 | 1 | — | — | — | 0 |

## 3. Détail des articles à enregistrer

| Compte | Fiche | Annonce vendue | Preuve « sold » | Copies retirées | Questions / autres |
|---|---|---|---|---|---|
| 2189c4d8 | 1791293890234017 | vinted 10276297853 | 08/10 09:26 | — | — |
| 273e3013 | 1790323742773007 | vinted 10118033476 | 03/10 22:35 | — | — |
| 3424a25d | 1790755057182007 | vinted 10226166053 | 08/10 21:49 | leboncoin 3279545448 (vue 08/10 21:39) | — · arrêt : leboncoin |
| 35892b98 | 1790181938729004 | vinted 9566093619 | 30/09 09:39 | — | — |
| 35892b98 | 1790181939132001 | vinted 9565520347 | 30/09 09:39 | — | — |
| 35892b98 | 1790753961881001 | vinted 10180799213 | 05/10 06:55 | — | — |
| 53efea05 | 1790438575800001 | vinted 10143304349 | 28/09 05:54 | — | — |
| 53efea05 | 1790438575800002 | vinted 10143247643 | 28/09 05:54 | — | — |
| 53efea05 | 1790692549893005 | vinted 10179560507 | 30/09 18:20 | — | — |
| 53efea05 | 1790785192271002 | vinted 10194267225 | 01/10 17:17 | leboncoin 3279747908 | — |
| 53efea05 | 1790867811991000 | vinted 10199596326 | 02/10 16:30 | — | — |
| 53efea05 | 1790951427713000 | vinted 10215579437 | 04/10 07:06 | — | — |
| 53efea05 | 1790951427713002 | vinted 10215536223 | 04/10 07:06 | — | — |
| 53efea05 | 1790951427713005 | vinted 10215244090 | 04/10 07:06 | leboncoin 3280801709 | — |
| 53efea05 | 1790951427713003 | vinted 10215327388 | 04/10 07:06 | leboncoin 3280796317 ; ebay 407264952604 | — |
| 53efea05 | 1790951427713007 | vinted 10215045705 | 04/10 07:06 | — | — |
| 53efea05 | 1790951428170001 | vinted 10214983161 | 04/10 07:06 | ebay 407261675156 ; leboncoin 3280791620 | — |
| 53efea05 | 1790675463875006 | vinted 10176632145 | 04/10 07:06 | ebay 407254667045 ; leboncoin 3279487886 | — |
| 53efea05 | 1789908556276003 | vinted 9879109409 | 04/10 07:06 | ebay 407190893573 | — |
| 53efea05 | 1791090358705000 | vinted 10234823265 | 05/10 06:21 | leboncoin 3281701471 ; ebay 407264984252 | — |
| 53efea05 | 1791090358706001 | vinted 10234819470 | 05/10 06:21 | — | — |
| 53efea05 | 1790073977695000 | vinted 10194594311 | 07/10 20:10 | ebay 407236403967 ; leboncoin 3279744835 (vue 08/10 11:51) | — |
| 53efea05 | 1790781836119003 | vinted 10192008913 | 07/10 20:10 | leboncoin 3279722490 | — |
| 63ad8597 | 1790018086801001 | vinted 10282859920 | 08/10 22:45 | opla art_8f10b6cc9bbeda07624c355e99c7d181 | — |
| 63b80b36 | 1788603429065007 | vinted 9914564395 | 29/09 10:21 | — | — |
| 63b80b36 | 1788603417191000 | vinted 9724284468 | 29/09 10:21 | — | — |
| 63b80b36 | 1790670087044003 | vinted 10158687864 | 02/10 20:42 | — | — |
| 66ffd657 | 1790442741640004 | vinted 10136487377 | 04/10 09:34 | — | — |
| 66ffd657 | 1791185668394001 | vinted 10245801981 | 07/10 12:54 | — | — |
| 66ffd657 | 1791099265502004 | vinted 10225491096 | 08/10 10:25 | — | — |
| 68e350f0 | 1790234453975006 | vinted 6454011453 | 07/10 10:22 | — | opla art_5caaa4142ba527082a8b720faddbbb03 (vue 08/10 02:38) |
| 68e350f0 | 1790234469330002 | vinted 4928162945 | 07/10 10:22 | — | opla art_a3fd1f3bf1a4d417ec98619ca78c7ff1 (vue 08/10 04:48) |
| 68e350f0 | 1790234453975005 | vinted 6454055225 | 07/10 10:22 | — | opla art_34da9e69ff6fd0d720f22dafa98f4668 (vue 08/10 02:38) |
| 68e350f0 | 1790234469330003 | vinted 4928144112 | 07/10 10:22 | — | opla art_d47a42426569840436ed8749824cb22e (vue 08/10 04:48) |
| 68e350f0 | 1790234431981000 | vinted 4548646130 | 07/10 10:22 | leboncoin 3261964869 (vue 07/10 21:21) ; opla art_7e4b8806e1416b5e7e76c54a29ace40c (vue 08/10 05:55) ; beebs 15735893 (vue 07/10 21:14) | — |
| 6f41de45 | 1789410326086004 | vinted 10004708190 | 29/09 23:08 | leboncoin 3107028468 | — |
| 6f41de45 | 1789410327144003 | vinted 7477369300 | 02/10 19:31 | leboncoin 3094720044 | — |
| 6f41de45 | 1789410337969001 | vinted 10165061885 | 04/10 21:09 | — | — |
| 7c5f4407 | 1786781094760002 | vinted 9683220518 | 29/09 22:22 | — | — |
| 7c5f4407 | 1786781095818005 | vinted 9993551961 | 30/09 21:21 | — | — |
| 7c5f4407 | 1786781094760007 | vinted 10197479636 | 02/10 10:50 | — | — |
| 8a2eba68 | 1791219052360007 | vinted 10274563907 | 07/10 23:25 | — | — |
| 8a2eba68 | 1791219039481002 | vinted 10233229768 | 08/10 19:51 | — | — |
| 8ed7a854 | 1790211474695001 | vinted 10063106889 | 28/09 20:41 | — | opla art_7d25e8acaf0ec08c4c4af5afb3e74fb8 |
| 8fd381a7 | 1787347245380007 | vinted 10005739305 | 06/10 21:20 | — | — |
| 8fd381a7 | 1788707490865000 | vinted 9907413678 | 06/10 21:20 | — | — |
| 8fd381a7 | 1787347244026003 | vinted 9615322103 | 06/10 21:20 | — | — |
| 8fd381a7 | 1788201836152003 | vinted 9845840082 | 08/10 22:35 | — | — |
| ab3ecfab | 1788266934409007 | vinted 9849229338 | 05/10 20:50 | — | — |
| ab3ecfab | 1790768728394000 | vinted 10185262376 | 05/10 20:50 | — | — |
| bd380fbf | 1790675300157002 | vinted 10168225847 | 05/10 13:43 | opla art_51a7424aaed3ea0f2b03c1a427cccd38 (vue 08/10 16:46) | — |
| bd380fbf | 1790675302910002 | vinted 10118119413 | 05/10 13:43 | opla art_9ebda04d5cc945d648aa6db982d99ad6 (vue 08/10 16:51) | — |
| bd380fbf | 1790675326713001 | vinted 9942725895 | 05/10 13:43 | opla art_f6317ada980a3a9b0b0c839836ccd70e (vue 08/10 16:06) | — |
| bd380fbf | 1790675351607006 | vinted 9650568538 | 05/10 13:43 | opla art_ea5b2980e135cbdf71d12440d486e579 (vue 08/10 15:54) | — |
| bd380fbf | 1790675386675003 | vinted 8093255222 | 05/10 13:43 | opla art_f08bdab5ffa766b528b163d4fd9758f9 (vue 08/10 16:44) | — |
| bd380fbf | 1790675397490005 | vinted 7931537223 | 05/10 13:43 | — | — |
| bd380fbf | 1790763700972007 | vinted 10001471886 | 07/10 10:15 | — | — |
| c15f4b0e | 1790512859458001 | vinted 10151958657 | 08/10 19:44 | — | — |
| c15f4b0e | 1790512859983005 | vinted 10151689648 | 08/10 19:44 | — | — |
| c15f4b0e | 1790282260817005 | vinted 10117383906 | 08/10 19:44 | — | — |
| c15f4b0e | 1790282266502000 | vinted 10109212465 | 08/10 19:44 | — | — |
| c15f4b0e | 1790282261633003 | vinted 10109409653 | 08/10 19:44 | — | — |
| c15f4b0e | 1790512863632007 | vinted 10129512412 | 08/10 19:44 | — | — |
| c15f4b0e | 1790512863631004 | vinted 10129958607 | 08/10 19:44 | — | — |
| c15f4b0e | 1790512862593006 | vinted 10136538751 | 08/10 19:44 | — | — |
| c15f4b0e | 1790173922212000 | vinted 10097986201 | 08/10 19:45 | — | — |
| c539df45 | 1791047217402006 | vinted 10193451017 | 04/10 19:25 | — | — |
| c539df45 | 1791047218599002 | vinted 10166817792 | 04/10 19:25 | — | — |
| c539df45 | 1790578754852006 | vinted 9938915923 | 04/10 19:25 | — | — |
| cf0af028 | 1789922036201001 | vinted 10105824531 | 30/09 14:36 | — | — |
| d74ce4ab | 1791068006306002 | vinted 10233329076 | 07/10 01:25 | — | — |
| d8b07167 | 1788726146684004 | vinted 9904888189 | 06/10 16:59 | — | — |
| d8b07167 | 1788679096230000 | vinted 9915415719 | 06/10 16:59 | — | — |
| d8b07167 | 1788726146684006 | vinted 9904754120 | 06/10 16:59 | — | — |
| d8b07167 | 1788679060497006 | vinted 9699649503 | 06/10 16:59 | — | — |
| d8b07167 | 1788679064027005 | vinted 9605750018 | 06/10 16:59 | — | — |
| d8b07167 | 1788679061831007 | vinted 9625035756 | 06/10 16:59 | — | — |
| d8b07167 | 1788679061831006 | vinted 9625075162 | 06/10 16:59 | — | — |
| d8b07167 | 1788679064027003 | vinted 9605781391 | 06/10 16:59 | — | — |
| d8b07167 | 1788679064027006 | vinted 9605729581 | 06/10 16:59 | — | — |
| d8b07167 | 1788679090208007 | vinted 9394976010 | 06/10 16:59 | — | — |
| d8b07167 | 1788679104832006 | vinted 9149297336 | 06/10 16:59 | — | — |
| d8b07167 | 1788682173642005 | vinted 9087573498 | 06/10 17:00 | — | — |
| e847ef68 | 1790590046900005 | vinted 10170009357 | 30/09 13:30 | — | — |
| e847ef68 | 1790590029805004 | vinted 10173464353 | 30/09 13:30 | — | — |
| e847ef68 | 1790590029805002 | vinted 10170831958 | 30/09 13:30 | leboncoin 3278445739 | — · arrêt : beebs |
| ebccb132 | 1790439565441004 | vinted 10143582892 | 28/09 12:38 | — | — |
| ebccb132 | 1790439565926006 | vinted 10133483742 | 28/09 12:38 | — | — |
| ebccb132 | 1790591904504004 | vinted 10145260751 | 29/09 18:25 | — | — |
| ec8a6da4 | 1791310780989 | vinted 10272253606 | 07/10 20:26 | — | — |

## 4. À vérifier — rien ne sera enregistré par le rattrapage

Motifs : `annonce_non_prouvee` / `plusieurs_annonces_vivantes` / `vente_deja_liee` (la base refuserait) ; `quantite_N` (plusieurs exemplaires) ;
`remise_en_ligne_possible(n)` : n autre(s) fiche(s) en stock du compte, même titre, dont l'annonce Vinted a été revue EN LIGNE après la preuve
(article peut-être remis en ligne, cas Bebertdeals) ; `fiche_suit_une_autre_annonce_en_ligne` ; `dressing_la_revoit_en_ligne` ; `releve_en_cours`.

| Compte | Fiche | Annonce | Preuve | Motif(s) | Copies vues < 3 j |
|---|---|---|---|---|---|
| 4cd4d9ae | 1790174236694 | ebay 196847393055 | 08/10 09:16 | vente_deja_liee | — |
| 66ffd657 | 1790523715035002 | vinted 10152700586 | 04/10 09:34 | remise_en_ligne_possible(1) | leboncoin, beebs, ebay |
| a208137a | 1786722933037000 | vinted 10207145331 | 02/10 20:05 | vente_deja_liee | — |
| b6005a59 | 1790174168241 | ebay 407226713076 | 08/10 12:06 | vente_deja_liee | — |
| bf85d176 | 1790072872865003 | vinted 10092072907 | 03/10 01:22 | vente_deja_liee | — |

## 5. Signaux « sold » SANS preuve (23) — jamais une vente

Le job porte `sale_signal = sold` mais le dernier relevé du dressing de cette annonce ne dit pas « sold » (ou rien n'a été lu) :
une vente n'est jamais enregistrée sur ce seul signal (cas Louis, 06/10).

| Compte | Fiche | Annonce | Q | Dernier relevé |
|---|---|---|---|---|
| 078b0646 | 1790113995820 | leboncoin 2784147214 | 1 | aucun |
| 3c1229b3 | 1790959313078005 | vinted 10202533926 | 1 | active le 02/10 18:41 |
| 3c1229b3 | 1790959313435006 | vinted 10202425882 | 1 | active le 02/10 18:41 |
| 68e350f0 | 1790234431981003 | vinted 10058087085 | 1 | active le 07/10 10:21 |
| 6c2ad0d7 | 1791133132992000 | vinted 10243643534 | 1 | active le 04/10 18:58 |
| 6c2ad0d7 | 1791133132993004 | vinted 10243387184 | 1 | active le 04/10 18:58 |
| 6c2ad0d7 | 1791133132993006 | vinted 10243247703 | 1 | active le 04/10 18:58 |
| 7373c96c | 1789120418973001 | leboncoin 3279539070 | 1 | aucun |
| 7804bb4a | 1791213855249003 | vinted 10253037609 | 1 | active le 05/10 17:24 |
| 785352fe | 1791449621511008 | vinted 10288905014 | 1 | active le 08/10 18:26 |
| 955bdb7b | 1789906712387003 | vinted 10079146657 | 1 | active le 24/09 18:45 |
| b2de74c9 | 1790600632707000 | vinted 10168202698 | 1 | active le 28/09 15:03 |
| ba656e5f | 1789731940113002 | vinted 10149544147 | 1 | aucun |
| bd380fbf | 1790763700179001 | vinted 10023560255 | 1 | active le 07/10 10:15 |
| bd380fbf | 1790850751678000 | vinted 10197621597 | 1 | active le 07/10 10:15 |
| cdf7007c | 1789564936457000 | vinted 10021944678 | 1 | reserved le 29/09 10:48 |
| cdf7007c | 1789564944888005 | vinted 10023140969 | 1 | active le 29/09 10:48 |
| cdf7007c | 1790671726372000 | vinted 10126055989 | 1 | active le 29/09 10:48 |
| dbca7f39 | 1790712027170003 | vinted 10185186663 | 1 | active le 05/10 16:47 |
| f66531a7 | 1786391424082 | leboncoin 3272607156 | 1 | aucun |
| faf5021a | 1789898202878 | vinted 10289157745 | 9996 | active le 08/10 20:12 |
| faf5021a | 1789991174458 | vinted 10289168362 | 9996 | active le 08/10 20:12 |
| faf5021a | 1790501877272 | vinted 10276047846 | 9995 | active le 08/10 20:12 |

## 6. Comptes internes (non comptés) : 0 annonce(s)

—
