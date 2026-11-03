# Retraits à tort et publications Vinted immobiles — 03/11/2026 (soir)

Comptes : JEAN-LUC LASSARAT (9256e3ae), Dylan Fontaine (379aa8a7), louis-seller (447d920c), gjehly (229c7b07).
Heure de Paris partout. Rien n'a été écrit sur un compte de plateforme ; aucun mail.

## 1. Retraits « sur rattachement » — les 9 cas lus un par un

**Cause prouvée.** Les 8 retraits du 03/11 (16:19-16:28) ne sont pas partis seuls : la personne a répondu
« Oui, c'est le même — retirer l'annonce » dans l'écran « Déjà vendu ? » (fiche importée « à vérifier » dont l'autre
fiche était VENDUE). Traces : `inventaire_fusions.par = 'utilisateur (doublon proposé)'` à 16:19:31, 39, 42, 48,
16:20:05 (JEAN-LUC) et 16:28:32, 45, 46 (Dylan). La fusion a re-pointé l'annonce en ligne sur la fiche vendue ; le
déclencheur posé à 13:52 (`cross_post_jobs_repointee_sur_article_vendu`) a armé le retrait (chemin
`publie_apres_vente_serveur`). Sans lui, le « oui » l'aurait armé de toute façon (règle du 30/09, `doublon_vendu_confirme`).
Le défaut : l'écran proposait de RETIRER une annonce sur une simple ressemblance (titre, photo), et le serveur le faisait.

| # | Compte | Annonce retirée | Fiche « vendue » | Vraie vente ? | Preuve |
|---|---|---|---|---|---|
| 1 | louis-seller | Beebs 34206489 Polly Pocket Ananas (retrait 28/10 22:03) | même fiche | **OUI** | dépôt FillSell du 20/10 ; achat Leboncoin lu le 24/10 (transaction « aucune » → « Achat en cours »), annonce Beebs vue achetable le 28/10 |
| 2 | JEAN-LUC | LBC 3224766875 perceuse TITAN | Vinted, vendue le 16/09 | **NON** pour cette annonce | annonce LBC en ligne depuis le 29/06, restée en ligne 7 semaines après la vente Vinted ; vendeur de neuf en plusieurs exemplaires |
| 3 | JEAN-LUC | LBC 3233436490 boîte à pharmacie | Vinted, 25/10 | **NON** | LBC en ligne depuis le 15/07 |
| 4 | JEAN-LUC | LBC 3224902464 chiffons Blumtal | Vinted, 17/07 | **NON** | LBC en ligne depuis le 29/06, 3,5 mois après la vente |
| 5 | JEAN-LUC | LBC 3243205231 boîte à pâtes | Vinted, 23/09 | **NON** | LBC en ligne depuis le 02/08 |
| 6 | JEAN-LUC | LBC 3294205838 éponge anti-buée | Vinted, commande 23836118080 du 02/11 (saisie à la main le 03/11 11:41) | **NON** (à confirmer) | LBC en ligne depuis le 24/10 ; seule vente récente : si JEAN-LUC n'avait qu'une éponge, la remettre en ligne ouvre une double vente |
| 7 | Dylan | Beebs 34284899 Dracaufeu V 153/172 | Vinted, vendue le 03/11 (relevé : active le 02/11 21:44, vendue le 03/11) | **OUI** | même photo exacte (même fond, même cadrage), Beebs en ligne depuis le 02/11 : retrait juste |
| 8 | Dylan | Beebs 34285076 Arcanin 15/100 | Vinted, commande 23082505125 du 11/10 | **NON** | annonce Beebs créée le 02/11 (numéro 3428…, les 3427… datent du 31/10), trois semaines APRÈS la vente : autre exemplaire |
| 9 | Dylan | Beebs 34284932 Roublenard 092/084 | Vinted « Medhyèna GG33/GG70 », 05/08 | **NON** | deux cartes différentes (photos vues), Beebs du 02/11 |

**Corrigé (la règle, pour tous les comptes).**
- App (web + OTA) : une annonce en ligne qui ressemble à un article vendu devient « Annonce à vérifier » →
  « La mettre dans mon stock » (article à part), jamais retirée ni réunie ; la carte dit pourquoi et comment la retirer
  soi-même. Seule la copie interrogée à la vente du jour (`copie_non_prouvee`) garde « Oui, la retirer ».
  `src/annonces/EcranDoublons.jsx`, selftest `ressemble-vendu-jamais-retire`.
- Serveur — migration `20261103230000_rattachement_jamais_de_retrait` (⛔ ÉCRITE, ESSAYÉE SUR BASE JETABLE 28/28,
  NON APPLIQUÉE : feu vert de Nico requis) :
  1. retire les déclencheurs de 13:52 (annonce insérée / re-pointée) ;
  2. « publiée après la vente » : le dépôt de FillSell seulement, jamais une annonce importée ;
  3. `armer_retrait_job_pour` (tous les chemins) : une annonce importée n'est retirée que pour une vente APRÈS sa mise
     en ligne (plus ancienne trace : date de la plateforme, première lecture, dressing, dépôt) — Arcanin et Roublenard
     n'auraient jamais été retirées ; Dracaufeu V oui. Exception gardée : le dépôt de FillSell pour la fiche (l'annonce
     n'existait pas avant), sinon une vente vue en retard laisserait l'objet vendu en ligne ;
  4. `inventaire_doublon_decider` : « oui » sur une fiche vendue dont l'autre a une annonce en ligne = article à part
     (les anciennes versions de l'app ne retirent donc plus rien non plus) ;
  5. Leboncoin, voir § 2.
  Banc : `PREUVE_PG=embarque node scripts/essais/20261103230000_banc.mjs` (rejoue d'abord l'incident avec les corps
  de prod, puis la migration, puis l'inverse rendu à l'octet). Selftest `rattachement-jamais-de-retrait`.
- ⚠️ Ceci renverse la règle du 30/09 (« Déjà vendu ? oui » = preuve de vente → retrait) pour les ressemblances.

## 2. Les 5 « ventes » Leboncoin de JEAN-LUC (03/11 18:15-18:17)

**Cause prouvée.** Ni une transaction lue, ni une disparition, ni un retrait : de VRAIES ventes, mais ANCIENNES, comptées
une seconde fois. Le premier relevé Leboncoin du compte (03/11 10:56) lisait déjà `transaction_status = sold` sur ces 5
annonces encore en ligne (Leboncoin garde « Article vendu » sur une annonce active : plusieurs exemplaires). La veille de
l'extension a lu le badge « Article vendu » de la page publique (13:01-13:12) → bandeau « Vendue sur Leboncoin » ;
JEAN-LUC a confirmé depuis son Android (check-listing-status, 18:15:20 → 18:17:34). Les vraies ventes sont dans
l'historique depuis le 02/11 (page des transactions) : balance 14/10 (367334041), boîte à café 02/08 (351643300),
serviette LEUS 12/05 (335972680), boîte marron 02/08 (351643092), scie sabre 04/08 (352000650). Puis 4 copies Vinted
retirées (vente_article_serveur) : 9332690165, 9613571304, 10641989604, 9613595410.

**Corrigé.** « Vendu » présent dès la PREMIÈRE lecture d'une annonce importée, jamais vu autrement depuis = vente d'avant
le suivi : jamais une vente du jour, jamais un retrait. Une annonce déposée par FillSell n'est pas concernée.
- `check-listing-status` (déployé) refuse la confirmation avec la raison (`_shared/lbc-vendu-avant-suivi.js`) ;
  selftest `lbc-vendu-avant-suivi`.
- Migration ci-dessus : la règle de la transaction ne prouve plus rien (`vendu_avant_suivi`) et le drapeau « Vendue » de
  la veille est écarté avant d'être écrit (déclencheur `cross_post_jobs_lbc_vendu_avant_suivi`).
- Extension (prochaine version unique, NON faite ici) : la veille Leboncoin ne pose « sold » sur une annonce importée
  que si elle l'a lue « active » sans le badge avant (une transition) ; sinon rien.

## 3. gjehly : 80 publications Vinted immobiles

**Cause prouvée — un défaut de FillSell.** Les 80 tâches (lot du 03/11 10:49) sont nées marquées « programmée » par la
marque d'une tâche d'AVANT : le lot programmé du 01/11, arrêté le 03/11 à 08:22, était recopié dans la carte de chaque
fiche (`fiches_annonce.edited`), et `construireJobs` la repassait telle quelle quand l'envoi n'était PAS programmé. Preuve :
leur `programmee_le` va du 01/11 20:10 au 02/11 12:02, avant leur création ; un envoi programmé porte l'heure du clic.
get-pending-jobs les retenait dans le créneau du soir (19:00-22:00, 8 par jour) : journal « 77…92 retenue(s) (creneau),
aucune servie » de 10:51 à 18:56, la première servie à 19:00. Le plafond et le créneau sont voulus ; les appliquer à un
envoi « tout de suite » ne l'est pas.
- Corrigé : `src/publication/moteur/regles.js` `champsDuJob` — la marque n'est posée que si l'envoi est programmé AU CLIC.
  Selftest `programmation-au-clic`. 93 tâches touchées sur le parc, toutes chez gjehly (79 Vinted, 12 Leboncoin, 2 eBay).
- À part : les « interrompues sur ton ordinateur » sont 2 republications Vinted (aeac55da, 15a15976, 4 essais) : l'onglet
  Vinted de son Brave ne répond pas (« content script ne répond pas »), 17 reprises depuis 13:12. Poste, pas file.

## Liste exacte — en attente du feu vert de Nico (rien n'est lancé)

**Étape 1** (`scripts/reparations/20261103_retraits_a_tort_etape1.sql`, sauvegardes + inverse, gardes vérifiées en
lecture le 03/11 soir : 7 fusions, 7 retraits, 5 ventes, 5 jobs) — aucune action chez les plateformes :
- défaire 7 fusions (fiches 2 à 6, 8, 9 du tableau) : chaque annonce revient sur sa fiche, au stock ;
- retirer les 5 ventes comptées deux fois (427655, 427656, 427657, 427823, 427824), fiches au stock, jobs LBC « publiés ».

**Étape 2 — annonces à remettre en ligne (11), une à la fois, hors quota, rythme de la file :**
- Leboncoin (JEAN-LUC, 5) : 3224766875 perceuse TITAN · 3233436490 boîte à pharmacie · 3224902464 chiffons Blumtal ·
  3243205231 boîte à pâtes · 3294205838 éponge (⚠️ vente Vinted du 02/11 : à confirmer).
- Beebs (Dylan, 2) : 34285076 Arcanin 15/100 · 34284932 Roublenard 092/084.
- Vinted (JEAN-LUC, 4, point 2) : 9332690165 balance Terraillon · 9613571304 boîte à café · 10641989604 serviette LEUS ·
  9613595410 boîte à café marron.
- À NE PAS remettre : Polly Pocket (louis-seller) et Dracaufeu V (Dylan) — retraits justes.

**Point 3** (`scripts/reparations/20261103_gjehly_programmation_heritee.sql`) : rendre les 93 tâches à la file. Question
avant : gjehly voulait-il « tout de suite » (ce que l'écran disait) ou son créneau du soir ?

## Ce qui reste
- Feu vert sur la migration `20261103230000_rattachement_jamais_de_retrait` (l'app et check-listing-status protègent
  déjà ; la migration protège aussi les anciennes versions de l'app et la veille Leboncoin).
- Étape 2 : le mécanisme de recréation est à décider — les annonces supprimées n'ont plus de page à relire ; il faut
  repartir de la fiche (moteur de publication de l'app) ou de la capture du 03/11 10:56 (Leboncoin) — décision de Nico.
- Extension : la veille Leboncoin (§ 2), et l'onglet Vinted bloqué sous Brave chez gjehly (§ 3).
- Les 4 ventes du rattrapage Leboncoin du 23/10 (« fiches importées depuis des annonces déjà Vendu ») relèvent peut-être
  du même défaut : non relues ici.
