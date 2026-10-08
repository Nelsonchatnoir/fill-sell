# Bebertdeals, 08/10 — synchro Vinted, 284 « créations », une vente et un retrait Leboncoin

Compte `c15f4b0e-253a-4dbc-ad70-7af0041d7564` (Gratuit), boutique Vinted
`bebertdeals` (189313424). Heures de Paris. Enquête en LECTURE SEULE (aucune
donnée de client modifiée ; les preuves des correctifs tournent dans des
transactions annulées sur un compte fictif). **Mesuré** = lu en base ou dans les
journaux Supabase ; **estimé** = calculé avec une règle approchée (dite) ;
**à vérifier** = non établi.

## 0. Le fait qui explique presque tout

**Bebertdeals supprime ses annonces Vinted et les republie lui-même, sous un
nouvel identifiant, tous les 5 à 10 jours** (mesuré). Une seule annonce de
l'article est en ligne à la fois ; chaque titre porte un code article à lui
(« (A177) », « (G88) »…). Exemples :

| Article | Annonces Vinted successives (première vue → dernière vue) |
|---|---|
| Levi's 501 W34 L32 (A177) | 10024094123 (16/09→20/09) → 10086763082 (21/09→25/09) → 10151780447 (27/09) → 10281924433 (vue le 08/10 à 19:14, **absente** à 19:43) |
| Chino Denton Bleu Marine (G88) | 9976995061 (12/09) → 10035413664 (17/09) → 10097593631 (22/09) → 10293945312 (08/10) |

La synchro du dressing ne rattache une annonce qu'à la fiche qui porte **son
identifiant** (`inventaire.vinted_item_id`, upsert `(user_id, vinted_item_id)`,
`chrome-extension/background.js` `enregistrerArticlesDressing`) : chaque
remise en ligne devient une fiche neuve, et la fiche d'origine — celle qui
porte les copies Leboncoin publiées le 16/09, l'historique — reste « en stock »
sur une annonce morte.

## a) 284 créations sur 358 vues

- **Mesuré** : relevé du 08/10 19:14:26 (`bouton`, extension 0.6.102) : 358 vus
  = 358 annoncés (4 pages), « 284 créés » = **268 fiches** + **16 brouillons**
  écartés par la base (`sync_import_ecartes`, motif `brouillon`) mais comptés
  « créés » par l'extension ; 74 mises à jour. Relevé de 19:43:21 : 357 vus,
  « 16 créés » = **les 16 mêmes brouillons, 0 fiche créée**, 341 mises à jour.
- **Mesuré** : 757 fiches avant 19:00, 1 025 après (833 en stock, 192 vendues).
  Les 1 025 portent 1 025 identifiants Vinted **distincts** : aucun doublon
  d'identifiant. Le test « 0 doublon de photo » ne pouvait rien voir : les
  photos re-téléversées ont toutes une adresse neuve (0 adresse Vinted commune
  entre une nouvelle fiche et une ancienne) — mais leurs **empreintes**
  (dHash/pHash) sont identiques.
- **Mesuré (clé = code article du vendeur, sinon titre exact)** : sur les 268
  nouvelles fiches, **206 sont un article déjà connu** (197 même code, 205 même
  titre) ; 55 sont nées « vendues » (remises en ligne puis vendues pendant les
  11 jours sans synchro, 27/09 → 08/10) ; les autres sont de vrais nouveaux
  articles (codes récents G123+, F24-F31, T35-T41).
- **Estimé (même clé)** : 1 025 fiches pour **403 articles** ; parmi les 833 en
  stock, **226** correspondent à une annonce vue en ligne le 08/10 ; **607** sont
  des fiches d'annonces mortes (401 datées « disparues », 206 jamais datées).
- Le second passage n'a rien « rattaché » : ses 341 mises à jour sont les mêmes
  identifiants revus ; rien ne relie une fiche à la précédente du même article.
- Les relevés d'avant (cron, 20/09 → 27/09) créaient déjà 46 à 95 fiches à
  chaque passage : le phénomène a commencé le 16/09.
- **Lien avec le moteur v3 et les migrations du 08/10 : aucun effet causal.**
  `rapprochement` v14 a tourné à 19:45:06-19:45:10 (bilan : 3 annonces Leboncoin
  déjà rattachées, `vinted_a_juger` = 0 — ce compte n'a ni import ni fiche créée
  à la main, rien à juger). Mais il ne PEUT pas aider : par règle, deux fiches
  Vinted ne sont jamais comparées (« deux annonces d'une même plateforme = deux
  exemplaires »). La règle du 25/09 qui réunissait les remises en ligne
  (`vinted_remise_en_ligne`) ne voyait que les annonces « closed » (celles de
  Bebertdeals sont supprimées : elles restent « active » + disparues) et le
  balayage qui l'appliquait (cron 17 `doublons-balayage-2min`) est **coupé
  depuis le 28/09**. Depuis cette date, plus rien ne rattache une remise en ligne.

## b) Les 249 disparitions bloquées

- **Mesuré** : exactement 249 fiches vues au relevé du 27/09, absentes le 08/10,
  non datées : **206 en stock + 43 vendues**. Des 206 en stock, **171** ont une
  remplaçante en ligne le 08/10, **40** une remplaçante vendue (5 ont les deux),
  **0** n'a pas de remplaçante (clé = code du vendeur / titre exact).
- La garde (« effondrement » : plus de 40 % des connues à dater d'un coup →
  aucun marquage) a fait son travail : dater ces 206 aurait posé 206 questions
  « Plus en ligne — Vendue ? » sur des articles toujours en vente.
- **Mais elle masque le vrai problème** : (1) ce sont des remises en ligne, pas
  des disparitions ; (2) une disparition bloquée devient **définitivement
  impossible à dater** — la fenêtre des « connues » ne remonte qu'au départ du
  relevé précédent moins 5 min (`background.js`, règle 3, ~l. 17785) ; au relevé
  de 19:43 elles n'étaient déjà plus candidates. Elles resteront des fiches
  « en ligne » fantômes tant que rien ne les rattache.

## c) La carte 1789584910310000 déclarée vendue à 19:26:21

- **Mesuré (journaux edge)** : à 17:26:21 UTC, preflight `OPTIONS
  check-listing-status` (navigateur), `POST rpc/enregistrer_vente_declaree`,
  `POST check-listing-status` 200, puis l'app relit les ventes (Windows,
  Chrome 154). **C'est un geste de la personne**, pas une décision du serveur :
  la « Revue des disparus » de l'app (`App.jsx`, `confirmerVenteDisparue`) liste
  les fiches Vinted « Plus en ligne » ; la fiche d'origine du jean A177
  (annonce 10024094123, « unavailable » depuis le 21/09) y était ; il a cliqué
  « Vendue ✓ » (prix proposé 25 €).
- Chaîne : `check-listing-status` → `enregistrer_vente_declaree` →
  `enregistrer_vente_atomique` (pas de preuve « sold » → plateforme
  « ailleurs » ; la garde du 08/10 « remplacée par une annonce en ligne de la
  MÊME fiche » ne voit pas la remplaçante, qui est sur une AUTRE fiche) → fiche
  « vendu » → déclencheur `inventaire_vendu_retire_ses_copies` (chemin
  `vente_article_serveur`, délai 10 min) → `armer_retraits_copies` → retrait
  Leboncoin 469e5d3e exécuté à 19:38 par l'extension 0.6.102 (identité par
  l'URL et le titre, confirmation reçue).
- « 17 jours après » : ce n'est pas un minuteur — la question attendait dans
  l'app depuis le 21/09 ; il l'a tranchée en ouvrant l'app après sa synchro.
- **La vente semble réelle (à confirmer avec le vendeur)** : (1) l'annonce
  vivante du jean, 10281924433, est **la seule** des 358 qui a quitté le
  dressing entre 19:14 et 19:43 (aucune remise en ligne derrière) ; (2) le
  vendeur a lui-même **corrigé la vente** à 19:31:03 et 19:48:17 (`PATCH
  ventes?id=104301`) : elle porte maintenant « Leboncoin ». Le retrait de
  l'annonce Leboncoin 3271070031 est cohérent avec sa déclaration.
- **Ce qui est faux** : la vente est accrochée à la fiche d'une annonce morte
  (`annonce_id` = 10024094123) ; la fiche de l'annonce vivante
  (1791479678441000) reste « en stock », datée disparue à 19:45 → elle est
  maintenant dans la même « Revue des disparus » (**risque d'une 2ᵉ vente
  comptée**) ; deux autres fiches A177 restent en stock (1790013141776007,
  1790512859983002).
- **Un signal « unavailable » suffit-il à déclarer une vente ?** Non, jamais
  automatiquement : le serveur n'enregistre une vente que sur preuve (Vinted
  « sold », API eBay, commande relevée) ou sur la réponse de la personne. Le
  défaut : la question est posée sur une annonce **remplacée**, et la réponse
  est acceptée sans vérifier que l'article est de nouveau en ligne sous une
  autre fiche.

## d) Rayon d'explosion (parc, 14 jours) — mesuré

- **248** retraits armés par `vente_article_serveur`, **139** fiches, **29**
  comptes ; 196 exécutés.
- Preuve de la vente, par fiche : 84 « sold » Vinted ; 33 vente sur l'annonce
  d'une autre plateforme (relevé de commande, eBay, Opla…) ; 11 déclarées à la
  main depuis la fiche ; 8 sans reçu (chemin d'avant le 28/09 — dont les 5 de
  28a45b62, en fait des ventes Leboncoin prouvées) ; 3 déclarées sur une annonce
  Vinted sans preuve.
- **Ventes sur un simple « unavailable » ayant retiré des copies : 3 fiches,
  2 comptes**, toutes déclarées par la personne :

| Compte | inventaire_id | Retiré | Date | Toujours en vente ? |
|---|---|---|---|---|
| c15f4b0e (Bebertdeals) | 1789584910310000 | Leboncoin 3271070031 | 08/10 19:26 (exécuté 19:38) | Non (vente réelle selon le vendeur, cf. c) |
| f8aa02a5 | 1790436902142 (pantalon de ski) | Leboncoin 3277146898 | 28/09 08:34 | Aucune jumelle en ligne, aucune vue en ligne après (titre) |
| f8aa02a5 | 1790588782935 (service à café) | Beebs, eBay 307203282676, Leboncoin 3279066926 | 04/10 09:35 | Aucune jumelle en ligne ; dernière vue Vinted 02/10 (titre) |

  Aucune vente fausse **démontrée** ; pour f8aa02a5, contrôle sur photo fait :
  aucune fiche ni annonce vivante du compte n'a une photo proche (≤ 6) de ces deux
  articles (mesuré, empreintes).
- À part (vente déclarée « Vinted » à la main, annonce Vinted **toujours en
  ligne** une semaine après, copies retirées) : 7373c96c 1789120409619000
  (Levi's 501 W36, vente du 01/10, annonce 9873737304 active le 08/10 20:07) et
  f44b5917 1789586123082002 (bouilloire, 02/10, 10174544854 active le 08/10).
  Soit la vente est fausse, soit l'annonce Vinted reste à retirer : **à vérifier
  avec les vendeurs**.
- **Le vrai rayon est celui du rattachement (estimé)** : sur le parc, **≥ 2 796**
  fiches en stock (88 comptes) dont l'annonce Vinted est remplacée par une
  fiche plus récente au titre identique (borne basse : titre exact), dont
  1 573 jamais datées ; 24 fiches / 11 comptes / 30 annonces d'autres
  plateformes rattachées à une fiche dont l'article semble **déjà vendu** sur
  Vinted sous une nouvelle annonce (titre proche). **Vérifié sur photo
  (mesuré)** : **13 fiches, 6 comptes, 16 annonces** portent exactement les
  mêmes photos que la fiche vendue (5 sans photo lisible, 6 aux photos
  différentes) — en ligne au dernier relevé de leur plateforme, à revérifier
  avant tout retrait :

| Compte | Fiche (annonce morte) | Annonces encore rattachées |
|---|---|---|
| c15f4b0e | 1789584910310001 (A178), 1789584909858007 (C202), 1789584910310003 (C193) | Leboncoin 3271071626, 3271067256 ; 3271073990 (déjà sortie le 08/10) |
| 53efea05 | 1789908554470005 (pichet), 1790567639439004 (serre-livres) | eBay 407158289846, 407251123942 ; Leboncoin 3274979798, 3278099376 |
| 28a45b62 | 1787208161508006, 1787208161888004, 1787208162351007, 1787208162351006 (t-shirts) | Leboncoin 3253413654, 3253395372, 3253403411, 3253412467 (dernier relevé : 25/09) |
| dbca7f39 | 1789169151553005 (foulard), 1789169113126005 (blouse) | Opla art_ee40eb22…, art_37726fdc… |
| 66ffd657 | 1786879362114007 (baskets 41) | Leboncoin 3251212628 ; eBay 820010156289 |
| c4c31845 | 1790615175346002 (Carhartt W42) | Opla art_bba23ef9… |

  Chez Bebertdeals : Leboncoin **3271071626 (A178)** et **3271067256 (C202)**
  sont en ligne alors que l'article est vendu sur Vinted (10217872092 et
  10086746583) — **risque de double vente, mesuré**.

## e) L'annonce Leboncoin disparue à 19:45

**3271073990** — « Pantalon Dockers D1 Slim velours côtelé beige camel 40 FR
(C193) ». Dernière vue le 27/09 14:55 ; absente des deux relevés Leboncoin
complets du 08/10 (19:16 : 4/4, 19:45 : 3/3) → datée disparue à 19:45:06 par
le relevé (deux relevés complets). **FillSell ne l'a pas retirée** (aucun job de
retrait). Sa remplaçante Vinted 10151689648 est **vendue** sur Vinted (vue
19:44) : l'article est vendu ; l'annonce Leboncoin a quitté le site entre le
27/09 et le 08/10 (retirée par le vendeur ou vendue là aussi — à vérifier). Son
job f058a353 porte maintenant « unavailable » : la question « Vendue ? »
apparaîtra sur la fiche d'origine 1789584910310003.

## f) Pourquoi aucune fusion Vinted ↔ Leboncoin

Les 5 annonces Leboncoin sont rattachées depuis le 16/09 **par preuve** (dépôt
FillSell, `source_rapprochement = job`) aux fiches de l'époque — c'est juste.
Ce qui manque, c'est le lien entre ces fiches d'origine et les **fiches Vinted
des remises en ligne** : le moteur v3 ne compare jamais deux fiches Vinted, la
règle du 25/09 ne voyait pas les annonces supprimées, et son balayage est coupé
depuis le 28/09.

## Correctifs (la règle, pas le cas)

1. **Rattachement : la remise en ligne Vinted** — `_shared/rapprochement/remises-en-ligne.js`
   (moteur v3, passe normale, fonction `rapprochement` v15) : deux fiches Vinted
   de la même boutique **jamais en ligne ensemble** (l'ancienne absente d'un
   relevé complet, jamais vue vendue), **mêmes photos** (≥ 2 à ≤ 4 bits, une si
   l'une n'en a qu'une), titre en **accord fort**, **aucun conflit**
   (type/couleur/taille), **aucun rival** (autre exemplaire en ligne ou vendu,
   deux anciennes en ligne ensemble, quantité > 1) → la nouvelle fiche se fond
   dans la **plus ancienne** (copies, prix d'achat gardés), l'identité Vinted
   vivante la suit, les intermédiaires s'y fondent, les jobs des annonces mortes
   sont clos « remplacée, pas une vente ». Doute → la question « Est-ce le même
   article ? ». Jamais la photo seule, jamais le titre seul.
2. **Vente** (`enregistrer_vente_atomique`, chemin job Vinted, **sans preuve
   « sold »**) : refusée quand l'article est de nouveau en ligne sous une autre
   fiche de la même boutique (même titre, annonce apparue après la dernière vue
   de celle-ci, vue en ligne ces 72 h) — la vente se déclare depuis la fiche en
   ligne. Une vente prouvée « sold » ne passe pas par là : **ses retraits de
   copies sont inchangés** (prouvé).
3. **App** : la raison d'un refus du serveur est affichée (avant : « Une erreur
   est survenue » — même pour la garde du 08/10 déjà en prod).

Mesures (rejeu à blanc, rien écrit) : Bebertdeals **166 chaînes** (379 fiches
d'annonces mortes rejoignent 166 fiches), 58 questions, 45 vrais nouveaux
articles ; contrôle indépendant par le code article du vendeur : 161 même code,
**0 code différent**, 5 sans code (titres identiques). Parc, 30 comptes les plus
touchés : 575 chaînes, 742 questions (gonflées par les photos pas encore
empreintées dans la simulation), **0 écart** sur toutes les autres décisions du
moteur. CPU de la passe normale (200 fiches nouvelles) : 0,67 s (Node).

## Le compromis (avant d'armer)

- **Fusion automatique** : le risque est de fondre deux exemplaires identiques
  republiés l'un après l'autre avec les mêmes photos (le premier vendu ailleurs,
  le second posté ensuite). Protections : jamais si l'un a été vu vendu, jamais
  s'il existe un autre exemplaire en ligne ou vendu aux mêmes photos, jamais deux
  anciennes en ligne ensemble, jamais une quantité > 1 ; réversible une à une.
  Sans elle : les copies Leboncoin restent sur des fiches mortes et ne sont **pas
  retirées** quand l'article se vend sur Vinted (A178, C202 aujourd'hui).
- **Garde de vente** : elle peut refuser une vente RÉELLE déclarée sur l'ancienne
  fiche (le cas de Bebertdeals ce soir : il avait vendu le jean sur Leboncoin) ;
  le message lui dit de déclarer la vente depuis la fiche en ligne. Tant que la
  règle 1 n'a pas réuni les fiches, les copies restées sur l'ancienne fiche ne
  sont alors pas retirées par cette déclaration. Sans elle : une vente sur une
  annonce remplacée retire les copies de la vieille fiche, laisse l'annonce
  vivante en ligne et la fiche vivante en stock (2ᵉ vente possible).
- Recommandation : armer la règle 1 d'abord (et son rattrapage, compte par
  compte), puis la garde 2.

## Réparation proposée (RIEN n'est appliqué sans feu vert)

**Bebertdeals**

1. **Urgent — double vente possible** : Leboncoin **3271071626** (Levi's 501 noir
   A178 ; vendu sur Vinted, annonce 10217872092) et **3271067256** (chino Lee
   Brooklyn C202 ; vendu sur Vinted, 10086746583) sont en ligne. Confirmer avec
   le vendeur, puis les retirer (retrait ciblé depuis l'app, ou
   `armer_retrait_job_pour` sur décision).
2. **Rattrapage remise en ligne** (après la migration et le drapeau) :
   `node scripts/reparations/20261008_remises_en_ligne_vinted.mjs --user c15f4b0e-253a-4dbc-ad70-7af0041d7564 --appliquer`
   → 166 chaînes (379 fiches d'annonces mortes rejoignent 166 fiches ; les 206
   fiches non datées du point b) y sont), 58 questions ; stock estimé
   833 → ~454.
3. **A177** : la vente 104301 est réelle selon le vendeur (corrigée par lui en
   « Leboncoin ») → la garder ; réunir dans la fiche vendue 1789584910310000 les
   trois fiches A177 restées en stock (1790013141776007, 1790512859983002,
   1791479678441000 — fusion depuis l'app, ou par nous sur décision) pour qu'aucune
   ne soit déclarée vendue une seconde fois. **Leboncoin 3271070031** : aucune
   remise en ligne (l'article est vendu). Si le vendeur dit le contraire :
   supprimer la vente 104301 dans l'app (la fiche revient en stock), puis publier
   sur Leboncoin depuis la fiche (une annonce neuve : l'ancienne ne se restaure pas).
4. **C193** : la fiche 1790512859983005 (Vinted 10151689648 vendue) attend la
   confirmation de la vente (bandeau) ; la question « Vendue ? » qui va apparaître
   sur la fiche d'origine 1789584910310003 (Leboncoin 3271073990 disparue) se
   tranche par la fusion des deux fiches, pas par une seconde vente.

**Parc**

5. Les **16 annonces** (13 fiches, 6 comptes, table du point d) rattachées à une
   fiche dont l'article est vendu sur Vinted sous une nouvelle annonce (mêmes
   photos, mesuré) : revérifier qu'elles sont en ligne, puis retrait sur décision
   (la règle ne les retire pas : la nouvelle annonce est née « vendue »).
6. Rattrapage compte par compte (rejeu à blanc des 30 comptes les plus touchés
   dans le rapport ; sauvegarde avant chaque compte, inverse prêt).
7. **7373c96c** (Levi's 501 W36, 1789120409619000) et **f44b5917** (bouilloire,
   1789586123082002) : vente déclarée « Vinted » mais annonce Vinted toujours en
   ligne — demander aux vendeurs.
8. **f8aa02a5** (pantalon de ski 1790436902142, service à café 1790588782935) :
   ventes sur « unavailable » ayant retiré des copies — contrôle sur photo fait,
   aucune jumelle vivante : rien à réparer sauf avis contraire du vendeur.
9. Hors sujet relevé en passant : **28a45b62**, 5 retraits Vinted en attente depuis
   le 26/09 (ventes Leboncoin) — à regarder.
