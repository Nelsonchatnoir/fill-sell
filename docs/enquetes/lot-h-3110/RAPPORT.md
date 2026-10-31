# Lot F (finition) + lot H — 31/10/2026 : mise en production du lot F, retrait qui ferme une republication, dates par plateforme dans le Stock

Heure de Paris partout. Demande de Nico du 31/10 (midi). Selftests neufs : `selftest:republication-retrait` (34),
`selftest:lot-h-dates` (48) ; `selftest:stock-refonte` (règle de date et tris) mis à jour.

## Partie 1 — Lot F en production

### a/b. Déploiements (faits par Claude, relus avant et après)
| Quoi | Avant | Après | verify_jwt |
|---|---|---|---|
| get-pending-jobs | v310 (30/10 22:51) | **v311** (31/10 11:32:00) | vrai (inchangé) |
| rapprochement | v27 (15/10 17:00) | **v28** (31/10 11:32:19) | faux (`--no-verify-jwt`, inchangé) |
| OTA Capgo | canal production 2.9.139 | **2.9.140** (dist `2026-10-31T09:30:54Z+3876dc8`, relu sur le canal) | — |
get-pending-jobs répond 200 aux polls dès 11:32 (journaux de la passerelle).

### c. La garde « jamais un retrait sur un numéro périmé », en production (compte de Nico, annonces de test 999 €)
Le cas de Johan reproduit par les gestes de l'app (`scripts/essais/20261031_lot_f_garde_numero_*_nico.sql`) :
1. 11:46–11:50 : trois annonces de test publiées (Beebs 34270410, Leboncoin 3299028197, Vinted 10605269960).
2. 11:55 : file en pause ; republication manuelle de 3299028197 (**ff153150**, en file) ; l'annonce est retirée de
   Leboncoin avant que la republication parte (retrait ciblé, fait à 11:56).
3. 12:00:04 : relevé Leboncoin complet, 16/16 (l'annonce n'y est plus) ; reprise de la file.
4. **12:02:15 — RETENUE** par get-pending-jobs v311 : `cible_absente_releve` (relevé 1f68b707), « En pause, rien n'a été
   retiré : l'annonce Leboncoin n° 3299028197 n'est plus dans ta liste au dernier relevé… ». Rien retiré, rien recréé.
5. 12:05 : une fiche en double publiée sur Leboncoin (3299049683), puis fusionnée (geste « Fusionner »,
   `inventaire_fusionner`) dans la fiche de la republication — exactement le cas de Johan. (Une nouvelle publication
   sur la fiche même est refusée par l'app, « already_published », tant que la republication existe : garde normale.)
6. **12:22:09 — CLOSE « déjà remise en ligne »** après le relevé de 12:19 (qui voit 3299049683) : « Ton annonce
   Leboncoin était déjà remise en ligne (annonce n° 3299049683) : cette republication n'a plus d'objet. Rien n'a été
   retiré ni recréé. » Aucune annonce en double (relevés de 12:19 et 12:43).

### c (suite). La règle de fusion (moteur v28) en production
- v28 servie depuis 11:32:19 ; passes de production sans erreur (ex. compte de Nico, 12:00:08, après le relevé).
- Simulation (lecture seule, `simuler: true`, secret lu en base) sur trois comptes réels qui ont des annonces non
  rattachées au même titre qu'une annonce rattachée (Nico, lupilou999 — 101 décisions —, axel.terver — 13 décisions) :
  aucune remise en ligne sur la même plateforme en cours dans le parc aujourd'hui (les 13 de Johan ont été fusionnées
  le 31/10 à 10:23). La règle elle-même est prouvée sur les données de Johan par `selftest:lot-f-3110` (partie 6).

### d. La file de Johan
Toujours en pause à sa demande (non reprise), ses jobs non touchés.

### e. Beebs — parcours complet de republication
**Pas encore prouvé.** L'annonce de test Beebs 34270410 (déposée à 11:46:57) est toujours « en vérification » chez
Beebs aux relevés de 12:08 et 12:46 (13 en ligne + 1 en vérification). Une republication avant sa mise en ligne serait
mise en attente par la garde existante (vu le matin même). L'annonce et sa fiche (1793438700001) restent en place pour
la faire dès que Beebs la met en ligne (`…_lot_f_releve_beebs_nico.sql` pour le vérifier). L'annonce Beebs de test
34132220 déjà en ligne n'a pas été utilisée : import mal rattaché (« Call of Duty » sur une fiche « T-shirt »).

### f. Un retrait ferme les republications en attente de la même annonce
- Règle : `_shared/republication-retrait.js` (`selftest:republication-retrait`, 37 vérifications) — un retrait vivant ou
  fait sur la même annonce (même plateforme, même numéro, jamais un titre) clôt toute republication NON ENGAGÉE
  (`cancelled` + `arret_utilisateur` + `hors_quota` + `republication_retrait_demande`), rien n'est recréé ; une
  republication engagée n'est jamais touchée.
- **Prouvé en production (get-pending-jobs v312)** : 12:47, republication manuelle de l'annonce de test Vinted
  10605948167 (cedf24fc) et son retrait ciblé (9b9ed266) dans la même transaction → **12:48:03 la republication CLOSE**
  par get-pending-jobs (« Annonce retirée à ta demande : cette republication n'a plus d'objet. Rien n'a été retiré par
  elle, rien n'a été recréé. », marqueurs posés) ; le retrait servi, l'annonce retirée à 12:48.
- **Déploiement incomplet (refus du classifieur « Production Deploy »)** : la v312 en production clôt les republications
  SERVIES d'une file active (porte après la pause). La version du dépôt (candidat v313) porte la règle AVANT la pause et
  pour les republications en attente d'un geste (le cas exact du 31/10 matin) ; son déploiement, et celui
  d'update-job-status (porte prévue au retrait fait, retirée du dépôt), ont été refusés. Un seul job du parc serait
  concerné au déploiement de la v313 : la republication Vinted 6b7ee9f7 de Johan (annonce retirée le 30/10 14:57) —
  elle se clorait alors que sa file est en pause : à décider.

## Partie 2 — Lot H : dates de mise en ligne par plateforme (XEWER)
- **Cause** : la pastille rendait la PLUS ANCIENNE mise en ligne (`ancienneteJours`), avec une règle de date qui n'était
  pas celle de la republication automatique (date de recréation d'abord, import daté du jour de l'import).
- **Une seule règle** : `_shared/mise-en-ligne.js` = l'expression de `republish_planifiee_candidats` (SQL relu en
  production, non modifié) : Vinted = `listed_at_guess` ; autres plateformes = dernier job publish/republish
  `published` qui porte un lien, daté `coalesce(published_at, created_at)` ; un import (`releve-annonces`) daté par
  `annonces_plateforme.publiee_le` quand elle est antérieure au job. **Équivalence sur les données réelles de XEWER :
  928 dates identiques au SQL, 0 écart** (`scripts/essais/20261031_lot_h_equivalence_xewer.sql` +
  `scripts/lot-h-equivalence.mjs`, lecture seule). « Anciennes », « Remonter » et le plancher gardent l'annonce la plus
  ancienne (même règle).
- **a.** Pastille = la mise en ligne la plus RÉCENTE. GIGN (1789717144944001) : « En ligne · 9 j » (Leboncoin, republiée
  le 21/10) au lieu de « 42 j » (import eBay du 18/09). Le seuil d'affichage des jours (7 j) est inchangé.
- **b.** Appui sur la pastille (ou « En ligne sur … depuis … » du menu « … », vue Liste) → feuille « En ligne depuis » :
  par plateforme l'état, la date (heure de Paris), publiée / republiée / importée (`releve-annonces` et
  `… · sync-dressing`), et l'historique (republications remplacées comprises ; annulations sans `published_at`
  exclues).
- **c.** Le filtre « En ligne sur X » (déjà dans « Filtrer » : Vinted, Leboncoin, Beebs, eBay, Depop) fait dire à la
  pastille la date de X ; la feuille le précise.
- **d.** Tri « Mise en ligne récente » (6e choix de « Trier par ») : date de la plateforme filtrée, sinon la plus récente ;
  dates inconnues en dernier, tri stable. Les tranches « Ancienneté de l'annonce » suivent la date affichée.
- Colonnes `platform_listing_id`, `handler_build` ajoutées à la lecture des jobs du Stock (vérifiées dans le schéma) ;
  dates relevées lues une fois (4,8 ms pour XEWER).
- **Vu en production (fillsell.app, build dbbc512, session de Nico, 12:45)** : pastilles « En ligne » ; la feuille de la
  Veste de test : « Leboncoin — En ligne depuis aujourd'hui · 31 oct. 2026 à 12:43 — Republiée par FillSell — Historique
  · 3 mises en ligne dont 1 republication » (Republiée · en ligne n° 3299092610 ; Publiée · remplacée n° 3299049683 et
  n° 3299028197 ; ni la republication close ff153150 ni le lot annulé n'y figurent) ; « Beebs — Publiée par FillSell
  11:46 » ; filtre « En ligne sur Leboncoin » + tri « Mise en ligne récente » : 16 articles sur 41, « Filtre actif : la
  carte montre la date de Leboncoin. » ; aucune erreur dans la console.
- **OTA 2.9.141** : `dist/` construit (`2026-10-31T11:43:02Z+dbbc512`, commit dbbc512) ; l'envoi a été **refusé** par le
  classifieur (« Production Deploy »). Ne pas reconstruire ce `dist/`. Le web (Vercel) sert déjà dbbc512.

## Non-régression
- Suite complète : **504 selftests, 0 rouge** (12:41, avant le commit 67a962b) ; `build:essai` vert ; lint des fichiers
  touchés sans erreur nouvelle.
- **Republication manuelle** (compte de Nico, prod v312) : Vinted 10605269960 → 10605948167 (12:40), Leboncoin
  3299049683 → 3299092610 (12:43). Beebs : voir e.
- **Republication automatique** : le SQL des créneaux n'est pas touché ; depuis 11:32, hors compte de Nico : Vinted
  automatique 2 publiées, Vinted manuelle 12, Leboncoin 3, Beebs 6, Depop 3 — 0 échec. Aucun créneau automatique
  Leboncoin / Beebs dans la fenêtre (ils tournent le soir).
- **« Republier en lot » puis « Tout annuler »** (file en pause, `…_lot_h_test_lot_annule_nico.sql`) : 2 republications
  créées dans un lot (47c0bdc8 Vinted, d3dc9e88 Leboncoin) puis annulées (« Annulée à ta demande — ton annonce est restée
  en ligne. », `arret_utilisateur`, `hors_quota`), rien n'est parti.
- **Pause et reprise** : 11:55 pause (la republication ff153150 attend), 12:00 reprise (servie à la garde), 12:24 pause
  (le lot ne part pas), 12:28 reprise (les republications partent), 12:49 pause remise comme Nico l'avait laissée.
- **Filtres et tris actuels** : `selftest:stock-refonte` (102) ; les cinq tris d'avant et les filtres sont à l'écran,
  inchangés.
- **Relevé et rattachement** : relevés Leboncoin 12:00 (16/16), 12:19, Beebs 12:08 et 12:46 ; 3299049683 et 3299092610
  rattachées à leur fiche PAR LEUR NUMÉRO (source `job`), aucune fiche neuve.
- Johan : file en pause depuis le 30/10, 32 republications Leboncoin intactes, aucune marque posée.

## Ce qui reste
- **Refusés par le classifieur (« Production Deploy »)** : get-pending-jobs à porte unique (candidat v313, dans le dépôt),
  update-job-status (non modifié), OTA 2.9.141 (`dist/` prêt). Commandes :
  `npx supabase functions deploy get-pending-jobs` (verify_jwt vrai) ;
  `npx @capgo/cli@8.99.0 bundle upload --channel production --bundle 2.9.141 --path dist`.
- Beebs : prouver la republication complète quand 34270410 sort de vérification ; puis retirer l'annonce de test.
- Règle de fusion v28 : aucun cas vivant dans le parc aujourd'hui pour la voir décider en production (simulations
  lecture seule sur trois comptes : aucune succession en cours).
- Johan 6b7ee9f7 (voir f) : à décider avant le déploiement de la v313.
- Fiches de test de Nico restées au stock (comme les essais précédents) : 1793438700000, 1793438700001 (Beebs en ligne),
  1793438700002 (fusionnée).
