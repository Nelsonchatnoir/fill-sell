# ayadi007 (Business) — stock vidé, imports en double, compte Leboncoin bloqué ; point 4 Jess (08/11/2026)

Compte : ayadi007@hotmail.com (Mohammed), `cfdfda6f-d182-4974-81b2-07050fc95d37`, inscrit le 05/11 à 18:48.
Toutes les heures sont en heure de Paris. Lecture seule en prod : rien n'a été écrit en base pendant l'enquête.

## 0. Protection (bilan donné à Nico avant la suite)

- **Le stock n'était pas vide à 10:50.** ayadi007 a lui-même lancé « Réinitialiser mon inventaire » DEUX fois, à
  **11:00:38** et **11:26:08**. Preuve : journal d'API (`edge_logs`), POST `rpc/supprimer_mon_stock_sans_retrait`,
  réponse 204, sujet du jeton `cfdfda6f…`, depuis fillsell.app (Chrome sur Mac, Saint-Clément-de-Rivière). La fonction
  efface les fiches ET les ventes. Les 170 fiches d'aujourd'hui datent de 11:26 et 11:28. Aucune vente d'avant 11:39
  n'existe plus, alors que 13 mails de vente sont partis les 06-07/11.
- **Ce défaut peut-il toucher d'autres comptes, Cloud compris ? Oui, deux défauts** (corrigés plus bas, § 3) :
  - le moteur importe une annonce que le dernier relevé n'a plus vue (7 annonces sur 4 comptes le 08/11) ;
  - « Synchroniser » est refusé (SYNC_CADENCE) après une réinitialisation, moins de 15 min après une lecture.
- **Les lignes en double ne peuvent provoquer AUCUNE action en double.** C'est prouvé :
  - Republication : get-pending-jobs ne sert jamais une republication sans fiche (garde du 06/09). Son journal retient
    eb3cfcf1 et 1031480e à chaque passage, de 11:17 à 12:25 : « non servies, aucune écriture ».
  - Retrait : il se calcule par fiche (`armer_retraits_copies`), et une ligne sans fiche n'est la copie de rien.
  - Stock : chaque annonce a au plus UNE ligne rattachée à une fiche vivante (vérifié annonce par annonce).
  - Vente : `enregistrer_ventes_relevees` trouve la fiche par `annonces_plateforme.inventaire_id`, puis par une ligne
    `inventaire_id IS NOT NULL`. Les lignes orphelines sont exclues, et un même numéro de commande n'est enregistré
    qu'une fois.
  - Les 3 ventes Leboncoin recréées à 11:44 (05/09/2025, 27/09, 08/10) sont d'anciennes ventes que la réinitialisation
    avait effacées. Elles sont comptées une fois, sans fiche, sans mail (dernier mail de vente : 07/11 23:41).
- **Les 9 publications Leboncoin de 12:09** visent 9 fiches Vinted sans aucune annonce Leboncoin rattachée. Elles partent
  sur le compte connecté dans Chrome au moment du dépôt. Une est déjà en ligne : 3304749074, à 12:12:51, « Votre annonce
  est publiée ». Ce compte publie donc normalement : très probablement le nouveau. Non prouvé par un identifiant.
- **Neutralisation : aucune**, puisque rien ne peut partir en double.
- Les retraits de 11:40 à 11:54 (Vinted : Autoradio Peugeot 408, Autoradio Toyota Hilux, Dashcam Infelala ; Leboncoin :
  Maison de poupée, déjà désactivée) suivent SES « Vendu » déclarés à 11:39-11:42. Ce sont des ventes sans commande,
  plateforme « Ailleurs » ou « Leboncoin », chemin `vente_article_serveur`.

## 1. Enquête

### 1a. Pourquoi le stock était vide — PROUVÉ
Ses deux « Réinitialiser » (§ 0). Chronologie des relevés Vinted : à 10:53, « cr 1, maj 143 » (les fiches existent) ;
à 11:11, « cr 144 » (plus rien après la réinitialisation de 11:00) ; à 11:26, « cr 144 » encore (après celle de 11:26).
Sur les 9 appuis « Synchroniser » de 10:50 à 12:06, 2 viennent de l'écran du stock vide (11:01:06, 11:26:41). Un seul a
été refusé, à 11:01:16 (§ 2c). Le compte rendu « 8 refusés depuis un stock vide » est faux : les autres sont partis.

### 1b. Les relevés Leboncoin à « 0 annoncée » et les 116 imports — PROUVÉ (la cause), NON PROUVÉ (l'identité du compte)
- Relevés de 10:43, 11:01, 11:19, 11:26, 11:45 et 12:03 : « 1 page(s), 0 en ligne lues sur 0 annoncées ». Celui de
  09:10 a échoué (page sans liste, un pied de page seulement). Le 07/11 à 20:59 : 117.
- Les imports de 11:04 et 11:28 ne viennent PAS de ces relevés. Le moteur (`rapprochement_v3_lire`) lit TOUTE annonce
  jamais datée disparue, et un relevé vide ne date rien. Les 117 annonces du 07/11 20:59 (run 6e8fbd24) avaient perdu
  leur fiche (ON DELETE SET NULL) : il les a refaites (« creer ») ou rattachées par photo aux fiches Vinted.
- Quel compte est connecté ? L'extension lit le numéro du compte Leboncoin (cookie `lbc_user_id`, pour l'API) mais ne
  l'écrit nulle part (ni relevé, ni dépôt). Le faisceau d'indices :
  - les annonces de l'ancien compte sont mortes : « Cette annonce est désactivée » (3295932166, 11:06), 410 (3303023460,
    11:51), et 4 republications en pause « Leboncoin n'a pas rendu cette annonce » ;
  - le compte connecté lit une liste vide propre, sans renvoi ni mur, et PUBLIE (12:12:51) ;
  - quatre postes d'extension sont nés de 11:13 à 11:16 sur le même Mac (profils ou réinstallations) ;
  - son message : « J'essaie d'ajouter un nouveau compte ».
  Conclusion : nouveau compte, très probablement. Non prouvé.

### 1c. Pourquoi le 2e import n'a « pas reconnu » les annonces — PROUVÉ, et le constat de départ est inexact
Aucune annonce n'a deux lignes sur la même fiche. Après chaque réinitialisation, les lignes d'avant restent
« published » sans fiche ; l'import suivant crée la ligne de la fiche neuve. Ce sont donc 455 lignes vivantes sans fiche
(Leboncoin 236, Vinted 219), chacune doublant une ligne rattachée.
Les « 6 sans fiche » sont des lignes de 11:04 dont le double de 11:28 est « vendu » (4) ou « annulé » (1), plus
l'import Vinted de 10:53.

### 1d. Le blocage Leboncoin
- Activité FillSell sur son Leboncoin (compte FillSell de 3 jours) :
  - 06/11, de 10:34 à 14:35 : 30 publications (2 vendues) ;
  - du 06/11 21:49 au 07/11 23:17 : **76 republications** demandées par lui (lot « manuel » du 06/11 19:32), soit un
    retrait + un redépôt environ 4 fois par heure, nuit comprise (03:07, 04:09, 05:05…) ;
  - 12 retraits (ventes, retraits ciblés depuis l'app).
- Deux refus Leboncoin le 06/11 :
  - « mucar CS6 OBDII » : « Nous refusons ce type de bien ou service » (http 403) — pause de contrôle, relevé
    `controle_blocage_lbc` à 21:27, réussi ;
  - « Autoradio Suzuki » : refusé juste après le dépôt.
- Est-ce FillSell qui l'a provoqué ? **Non prouvé.** Leboncoin ne donne pas son motif. Le rythme (76 retraits +
  redépôts en 26 h sur un compte qui vient d'arriver, après deux refus de modération) est un suspect plausible, rien de
  plus.
- Même schéma ailleurs ? Oui, et plus fort : sos.cuisine.va (129 republications le 04/11, dont 27 de nuit) et gjehly
  (76 le 07/11, 39 le 08/11 dont 24 de nuit). Leurs relevés du 07/11 lisent toujours 366 et 319 annonces : pas de
  blocage visible. La cadence est intouchable sans décision de Nico (§ Feux verts, question 1).

### 1e. Les 4 republications en needs_user
8898cfa1 (Saillie Ragdoll), 7d2fe3f1 (Pompe yacht), 6283934b (ESSGOO), 67d3e4a5 (Wallbox) : créées par lui à 11:35:24
sur des annonces de l'ancien compte, en pause « introuvable à confirmer » ; rien n'a été retiré.
Les relevés du nouveau compte ne les reverront jamais. Après 2 relevés complets sans elles, elles seront closes
« n'est plus en ligne… FillSell n'a rien retiré ». Les 2 republications sans fiche du 06/11 (eb3cfcf1, 1031480e) visent
2 de ces mêmes annonces : le rattrapage § 3 les clôt.

## 2. Questions produit

- **a. Deux comptes Leboncoin sur un même compte FillSell ?** Non : un seul à la fois. L'extension travaille avec la
  session Leboncoin ouverte dans le Chrome où elle est installée (relevé, dépôt, retrait). FillSell ne retient aucun
  numéro de compte Leboncoin. Deux comptes en même temps voudraient dire deux profils Chrome, donc deux extensions
  actives, et elles se disputent les tâches (règle « une seule extension active »).
  « Comptes reliés » (18/10) est le cas inverse : deux comptes FillSell, un Leboncoin.
- **b. Quand on change de compte Leboncoin** (ce qui se passe aujourd'hui, avant correction) :
  - le relevé lit le NOUVEAU compte ; ses annonces entrent au stock (créées, ou rattachées par photo) ;
  - les annonces de l'ancien compte restent « en ligne » dans FillSell, puisqu'un relevé vide ne date rien.
    Avant correction :
    - le moteur les réimporte si leur fiche a disparu (ce qui est arrivé) ;
    - dès que deux relevés probants lisent le nouveau compte, chacune reçoit « Plus en ligne — Vendue ? ». Un « Oui »
      retire ses copies ailleurs (Vinted) ;
  - les fiches restent au stock, avec leurs autres plateformes. Une republication d'une annonce de l'ancien compte se met
    en pause « introuvable », puis se clôt ; un retrait lit « désactivée » et se clôt « déjà hors ligne » ;
  - les publications partent sur le compte connecté.
- **c. « Synchroniser » refusé depuis un stock vide** : l'app affichait, en orange, « La demande n'a pas pu être
  envoyée. Réessaie dans un instant. » — faux motif, aucune heure. C'était le seul refus de la matinée (11:01:16). Il
  vient du déclencheur `garde_cadence_sync_runs`, qui n'avait pas l'exception « stock vide » du 26/10.

## 3. Corrections à la racine (codées, prouvées, RIEN déployé ni appliqué)

Preuve de bout en bout sur un Postgres jetable portant le schéma de prod : `PREUVE_PG=embarque node
scripts/preuve-ayadi-0811.mjs` → **54/54**.
- Avant (définitions de prod) : les 5 défauts se reproduisent.
- Après : les règles neuves jouent, et tout le reste reste comme avant.
- Inverses : ils rendent les md5 de prod, et les migrations se rejouent.

| Migration | Règle (tous comptes) |
|---|---|
| `20261108140000_cadence_stock_vide_garde_runs` | `garde_cadence_sync_runs` : pas de cadence de 15 min sur un stock vide (même condition que `demander_sync_dressing`) ; le cron garde ses 20 h. |
| `20261108141000_releve_ancien_jamais_importe` | `rapprochement_v3_lire` rend `perimee` (le DERNIER relevé terminé de la plateforme ne l'a pas revue). Moteur (`moteur.js`) : une annonce `perimee` SANS fiche n'entre jamais au stock et ne se rattache pas. 1,3 ms mesurée. |
| `20261108142000_republication_vendue_avant_suivi` | Point 4 : le badge « sold » d'une annonce Leboncoin vue en ligne et vendue AVANT le suivi n'interdit plus la republication. |
| `20261108143000_une_ligne_vivante_par_annonce` | « Réinitialiser » clôt les lignes de ses fiches avant d'effacer (jamais un retrait, une tâche « processing », une republication engagée, une ligne vendue). `lignes_sans_fiche_clore` et son déclencheur : une ligne rattachée publiée clôt ses doubles sans fiche (numéro exact). |
| `20261108144000_compte_change_sans_vendue` | `constater_absences_releve` : au moins 5 annonces absentes et aucune continuité entre les deux relevés et ce qui était connu → rien daté, aucun « Vendue ? », une trace `releve_compte_change`. |

App (web au push ; mobile à la prochaine OTA) :
- un refus SYNC_CADENCE se dit comme la cadence, par un fait au passé (« Tes annonces Vinted ont été lues il y a 8 min ») ;
- l'appui relance le rangement (`synchro_relancer_rangement`) : jamais un cul-de-sac.
⚠ La demande disait « le client voit … quand ça repartira ». La règle de Nico du 16/10 (« ni durée, ni heure prévue »,
`selftest:aucune-estimation`) l'interdit : je l'ai suivie (question 3 ci-dessous).

Lignes en double d'ayadi007 : `scripts/reparations/20261108_lignes_sans_fiche_doublons.sql`.
- Ce script passe par LA fonction de la règle (aucun UPDATE à la main) : 440 lignes (mesure du 08/11).
- Sauvegarde dans `_backup_0811_lignes_sans_fiche` ; inverse et lecture préalable (`…_PREUVE.sql`) fournis.
- Après la migration seulement.

Selftests ajoutés :
- `sync-refus-cadence` (15)
- `releve-ancien-jamais-importe` (13)
- `une-ligne-vivante-par-annonce` (20)
- `republication-vendue-avant-suivi` (6)

Non fait, à décider :
- l'extension n'écrit toujours pas le numéro du compte Leboncoin. Ne pas l'écrire dans `vinted_user_id` :
  `cloud_essai_preparer_moi` lit cette colonne comme des comptes Vinted (anti-abus de l'essai Cloud). Il faudrait une
  colonne à part, une extension, une soumission CWS ;
- l'app ne dit pas « ton compte Leboncoin a changé ».

## 4. Jess (jessica.alhiane, Premium) — PROUVÉ, corrigé (migration 20261108142000)
- Fiche 1794077239905 : une seule ligne Leboncoin (d47ea135, import du 07/11 19:47), annonce 3178619102 en ligne
  (`statut_brut` active, relevée à 12:12).
- Les 4 refus sont `spend_coins_and_republish` → `republication_annonce_partie` = « annonce_vendue », par sa 1re branche :
  `transaction_plateforme = 'sold'`. Sur cette ligne, ni verdict, ni constat, ni `sale_signal`.
- Le badge « Vendu » est là depuis la 1re lecture (annonce « Unité ou Lot » du 12/04). `leboncoin_vendu_avant_suivi` =
  vrai, et les relevés l'écartent déjà des ventes (7 traces `vendu_avant_suivi`).
- Parc : 40 annonces Leboncoin en ligne « vendues avant le suivi », dont 26 sur une fiche au stock, toutes refusées
  aujourd'hui.
