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
   `inventaire_fusionner`) dans la fiche de la republication — exactement le cas de Johan.
6. (résultat ci-dessous)

### c (suite). La règle de fusion (moteur v28) en production
- v28 servie depuis 11:32:19 ; passes de production sans erreur (ex. compte de Nico, 12:00:08, après le relevé).
- Simulation (lecture seule, `simuler: true`, secret lu en base) sur trois comptes réels qui ont des annonces non
  rattachées au même titre qu'une annonce rattachée (Nico, lupilou999 — 101 décisions —, axel.terver — 13 décisions) :
  aucune remise en ligne sur la même plateforme en cours dans le parc aujourd'hui (les 13 de Johan ont été fusionnées
  le 31/10 à 10:23). La règle elle-même est prouvée sur les données de Johan par `selftest:lot-f-3110` (partie 6).

### d. La file de Johan
Toujours en pause à sa demande (non reprise), ses jobs non touchés.

### e. Beebs — parcours complet de republication
(à compléter)

### f. Un retrait ferme les republications en attente de la même annonce
(à compléter)

## Partie 2 — Lot H : dates de mise en ligne par plateforme (XEWER)
(à compléter)

## Non-régression
(à compléter)

## Ce qui reste
(à compléter)
