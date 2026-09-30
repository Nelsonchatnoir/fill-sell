# 30/09 soir — fusion par la photo, numéro Beebs, Louis (Claude, passe unique)

Règles tenues : jamais `db push` ; fonctions SQL réécrites depuis
`pg_get_functiondef` ; rejeu annulé sur cas réels avant chaque application ;
inverse homonyme dans `supabase/rollbacks/` ; `verify_jwt` relu avant/après.

## 1. Synchronisation et fusion

### Causes
- **Opla « ne reconnaît pas »** : leopaul.hug (62 annonces) et
  melissatissier13 (9) n'ont **aucun dépôt Opla fait par FillSell** — leurs
  annonces Opla sont des copies de leur Vinted publiées hors FillSell.
  « par identifiant 0 » était exact. Là où FillSell a publié, Opla se
  rattache par l'identifiant (455 dépôts retrouvés par les relevés, 0 import
  en double constaté). La seule preuve possible pour ces annonces : la photo.
- **0 fusion utile** : les photos Opla (CloudFront) sont en **WebP** ;
  imagescript ne les lit pas (« Unsupported image type », 1 569 échecs Opla,
  119 Beebs) et le passage excluait CloudFront. Une fiche importée d'Opla
  n'avait jamais d'empreinte.
- **Passages à 6–25 s** : chaque passage relisait les couvertures du stock
  ENTIER du compte (jointure qui lisait `photo_empreintes` en entier : 1,3 s
  pour 712 fiches), revenait chaque minute sur les mêmes URL non résolues
  (carhoa 14 passages, rémi 16), et la première fusion d'une connexion coûte
  5 à 6 s (mesuré : laury.larrieu, 20:06, 5 618 ms) — chaque passage de cron
  est une connexion neuve.

### Correctifs (appliqués, dans l'ordre)
| Heure | Quoi |
|---|---|
| 19:5x | `empreintes-urls` **v2** (verify_jwt false, relu avant/après) : WebP lu par libwebp (`@jsquash/webp` 1.4.0, épinglé). Photo Opla ↔ photo Vinted : dHash 0, pHash 0. |
| 19:57:53 | `20260930203000_photo_avant_import` : une annonce que l'identifiant ne reconnaît pas **attend l'empreinte de sa photo** (30 min au plus) au lieu d'être importée. Même photo qu'UNE seule fiche en stock, sur une autre plateforme, sans autre annonce de même photo sur cette plateforme, titres non exclusifs → **rattachée** (job de suivi, motif `photo_identique`, prouvé pour les retraits). Sinon : chemin d'avant (import, une question au plus). |
| 19:59:51 | cron `fusion-photo-1min` rallumé avec `statement_timeout 8s` dans la commande. |
| 20:20:41 | `20260930211500_fusion_photo_par_lots` : plus aucune fusion dans le passage d'une minute ; fusions par lots espacés (`fusion-photo-lot-10min`, jobid 22, **laissé coupé**). |
| 20:51:36 | `20260930215000_fusion_photo_sans_balayage` : `fiche_couverture()`, jointures LATERAL (index), plus aucune relecture du stock entier ; > 2 000 fiches en stock = pas de preuve photo. |

Rejeu annulé (71 annonces Opla réelles, leopaul + melissa) : **69 rattachées à
la fiche que la personne avait choisie à la main, 0 erreur**, 2 relâchées
(deux fiches du stock ont la même photo) → **2 questions au lieu de 71**.
Passages mesurés 95 / 602 / 189 ms.

### Questions « Est-ce le même article ? »
- 909 ouvertes au départ.
- 92 fermées (`decide_par = 'regle_deux_exemplaires_3009'`, réversible) :
  les deux fiches sont EN LIGNE aujourd'hui sur une même plateforme = deux
  exemplaires.
- Classement photo des 909 : 289 même photo (dont 161 sur une même
  plateforme, 124 sur deux plateformes), 508 photos différentes, 72 proches.
- Nettoyage par fusion : voir la fin de ce document.

### Latence (get-pending-jobs)
- Référence sans cron (19:20–19:50) : 1,0–1,6 s de moyenne, p90 1,7–2,8 s.
  La base cale d'elle-même par moments : 19:51–19:55 (cron coupé) jusqu'à
  44 s.
- 20:15–20:16 et 20:35–20:44 : dépassements → cron coupé (20:22:00, 20:44:29).
  Le second était **de mon fait** : la mise en file de 39 comptes pour le
  nettoyage faisait relire tout le stock à chaque passage (44310spgl coupé à
  8 s). File annulée, version allégée appliquée.
- Le cron a été trouvé coupé à 22:02 (arrêté vers 20:57, pas par cette
  session) ; rallumé à 22:02:58 pour la surveillance de 30 min.

## 2. Numéro Beebs

**Cause** : « Mes annonces » est lue par `fetch` + `DOMParser`, où aucun script
ne tourne. La liste « En vérification » est streamée (frontière Suspense) :
les cartes restent dans `<div hidden id="S:0">`, enfant de `<body>`, et
`<main>` n'a que le squelette. Le comptage `main img[alt]` rendait 0 carte dès
qu'il y en avait une → « 1 clé(s) exacte(s) pour 0 carte(s) » → illisible
(carhoa 3546e766 « après » ; test de Nico 19:11 « avant », à cause de la
carte Medik8 en vérification). « Actuellement en ligne » : cartes en
composant client (`AdvertsProductCard`), aucun lien `/p/` dans le HTML → lue
« complète » avec 0 identifiant.

**Correctif** : 0.6.81 (f0ebfe7) — cartes comptées dans `<main>` ET les
segments streamés, sans exiger d'image ; « en ligne » lue dans le flux RSC
(clé React = propriété id), `nb_products` annoncées et aucune lue = illisible.
Prouvé sur le compte de Nico (code exact injecté dans la page) : en
vérification 1 clé / 1 carte (33640171), en ligne 9 / 9.

Zip : `build/CWS-0.6.81-A-TELEVERSER/fillsell-extension-0.6.81-cws.zip`
(BUILD_ID `2026-09-30T18:27:53Z+f0ebfe7`).

**Non fait** : les 3 dépôts de preuve (le dossier non empaqueté de Nico n'a
pas pu être remplacé par cette session : refus du contrôle automatique) ; le
rattrapage des dépôts sans numéro (lecture refusée par le même contrôle).

## 3. Louis (faf5021a…)

Relevé navigateur, 30/09 ~20:30–20:45 :
- Vinted : **deux comptes** — evat (371531) 195 annonces, neyenonie
  (247512093) 4. Toutes ont leur fiche sauf 3 livres récents d'evat (compte
  plus synchronisé depuis longtemps). 0 annonce en ligne sur une fiche vendue.
- Beebs (dressing k7bFKkvj…) : 86, toutes rattachées à une fiche en stock.
  34056151 n'est plus dans le dressing (retrait FillSell de 19:54).
- Leboncoin (Clayton, 4535d539…) : 137, toutes connues ; 2 mises de côté par
  Louis le 23/09 → **importées** (1790798595808, 1790798595987).
- Opla (Amiral) : 53, toutes connues (1 dépôt FillSell en cours).

Familles d'écart :
1. **Fiche importée à 1 exemplaire par défaut** (le relevé ne connaît pas la
   quantité) alors que Louis imprime sans limite : une vente → fiche vendue →
   retrait automatique des autres annonces. 5 cas (Blanc et Blanc et Gris le
   27/09, Blanc et Rouge le 28/09, Gris et Noir et Gris et Blanc le 29/09).
   **19 fiches imprimées encore à 1** (13 Insert Zombicide, 5 lots
   d'adaptateurs, Rangement Blanc et Marron). Aucune quantité inventée : à
   Louis de poser 9999.
2. **Nouvelles annonces accrochées à d'anciennes fiches vendues** du même
   nom : corrigé à 12:38 (fiches à part) et règles 30/09 (ebe6916 → 6d7cff4).
3. **Vente d'une fiche à 9999** (Rangement Gris, 17:46) : la fiche reste en
   stock à 9998 ; une fiche « vendue » d'historique est créée ; l'annonce
   Vinted vendue disparaît de Vinted (à republier). Fonctionnement normal.
4. **Double annonce sur une même plateforme** pour 6 livres/jeux d'occasion
   (quantité 1) : dépôts FillSell du 27/09 10:28–10:30 posés là où l'article
   était déjà en ligne. Règle : deux annonces = deux exemplaires ; à trancher
   avec Louis (quantité réelle), rien retiré.
