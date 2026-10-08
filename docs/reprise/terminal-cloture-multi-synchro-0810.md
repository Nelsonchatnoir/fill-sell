# Reprise — clôture du sujet multi-synchro (08/10, fin de matinée)

Suite de `docs/reprise/terminal-boucles-0810.md`. Feux verts nommés de Nico :
20261008100000, 20261008102000, une version RÉVISÉE de 20261008101000,
déploiement d'ops-digest, nettoyage de Nadège ; chantier Louis.

## Appliqué et déployé

| Quoi | État |
|---|---|
| 20261008100000 (une même décision jamais réécrite) | appliquée + `repair` |
| 20261008102000 (une synchro ne vide jamais une marque) | appliquée + `repair` |
| 20261008101000 RÉVISÉE (veilleur : la cause, aucun plancher) | appliquée + `repair` |
| 20261008110000 (Vinted : fiche et signal suivent l'annonce en ligne) | appliquée + `repair` |
| 20261008111000 (la fiche ne recule que sur preuve) | appliquée + `repair` |
| 20261008112000 (démenti d'un signal de la même synchro) | appliquée + `repair` |
| `ops-digest` | v34, `verify_jwt` false (v32 avant) |
| Nadège | 8 953 lignes retirées, sauvegarde `_backup_0810_boucle_rapprochements` (8 954), 3 restent dont l'import utile |
| Louis | 7 fiches recalées sur leur annonce en ligne, sauvegarde `_backup_0810_fiches_vinted` |
| App | « Plus en ligne — Vendue ? » masquée pour une annonce remplacée par une annonce en ligne (web au push, OTA 2.9.67) |

## Le veilleur (20261008101000 révisée)

- **Cause Opla (44310spgl)** : le relevé Opla de l'extension
  (`content-scripts/opla.js`, `listerMesArticles`) écrit « en ligne » un
  article au statut `draft` (dépublié). L'oracle public le dit `draft`
  (vérifié sur deux annonces), le veilleur le lit « indisponible » à juste
  titre. Le relevé dément, la lecture suivante repose l'alerte : sans fin.
  Opla seulement (112 alertes démenties sur Opla, 1 sur Leboncoin, 0 ailleurs).
  Correctif de l'extension NON fait (Opla sort le 10/10, zip 0.6.103 en revue).
- **choupette06 (Beebs)** : 9 annonces vraiment disparues depuis le 27/09 ;
  une absence n'est jamais conclue sur Beebs : les relevés n'apprenaient rien.
- **Règle** (`releve_veilleur_decision`, déclencheur
  `garde_releve_veilleur_cause`) : pour les annonces suivies lues
  « indisponibles » depuis le dernier relevé complet de la plateforme —
  vue en ligne par ce relevé et déjà démentie une fois → rien ; vue en ligne
  et jamais démentie → le relevé part (disparition nouvelle) ; vue sous un autre
  statut → rien ; absente : Beebs → rien, absence déjà constatée → rien, sinon
  le relevé part (il constate l'absence). Aucun relevé complet, aucune annonce
  signalée ou erreur → le relevé part. Refus comptés dans `releves_auto_refuses`.
- **Ce qu'un relevé du veilleur apporte à une vente** : seulement le constat
  d'absence (deux relevés complets → question « Vendue ? ») ; l'enregistrement
  automatique exige une preuve lue sur la page (`enregistrer_ventes_prouvees`),
  l'API eBay ou une commande, et il ATTEND qu'aucun relevé ne tourne.
- **Rejeu 7 jours** (sur ce que chaque relevé a réellement apporté) : 438 → 144 ;
  44310spgl Opla 166 → 50, dont 45 « absente » du 02 au 04/10 (sans accès à
  Opla, aucune requête) et 5 constats d'absence ; choupette06 Beebs 14 → 0.
  Les 113 relevés du veilleur qui ont constaté une absence sont gardés.
- **Délai de détection des ventes** : 36 ventes hors Vinted de la période,
  vérifiées une à une — 32 par preuve de page, API eBay ou commande (aucun
  relevé), 4 par un constat d'absence dont les deux relevés sont gardés.
  Avant = après, vente par vente. Délais mesurables (vente → enregistrée, ventes
  à date connue) : 1 h 38, 56 min, 1 min, 1 min, inchangés.
- Coût : 7,2 ms au plus par demande du veilleur (44310spgl, 1 118 jobs Vinted).

## Louis — la cause et la règle

- **Cause 1 (signal sur le mauvais job)** : la synchro du dressing de
  l'extension (`ventesSignaleesAuJob`) cherche le job d'une annonce vendue par
  son id parmi les jobs PUBLIÉS ; l'ancienne annonce a un job déjà `sold` →
  absente → repli par la FICHE → le job publié de la fiche est celui de
  l'annonce NEUVE, qui reçoit `sale_signal: sold` (05/10 16:48:35) alors que la
  même synchro la relève « active » 0,7 s plus tôt.
- **Cause 2 (la fiche recule)** : la même synchro (PATCH léger, rattrapage par
  job) réécrit sur la fiche l'id et le statut `sold` de l'ancienne annonce,
  après qu'update-job-status l'a recalée sur la neuve.
- **Effet** : bandeau « 🎉 Vendue sur Vinted ! » sur une annonce en ligne ;
  06/10 15:02, 14 « Oui » en 30 s → 14 ventes, 14 remises → 14 annonces neuves.
- **Règle** (Vinted seulement : seule plateforme où la fiche porte l'annonce) :
  un relevé « active » dément un signal posé avant ou dans la même synchro ;
  la fiche ne revient jamais vers une annonce plus ancienne sans preuve que la
  récente n'est plus en ligne ; « Oui, enregistrer la vente » refuse une
  annonce revue en ligne ou remplacée par une annonce en ligne ; la remise en
  vente attend tant que l'annonce vendue est en ligne (6 h) ; une note de vente
  dont le signal est retiré n'envoie ni push ni mail. L'app ne pose plus la
  question pour une annonce remplacée par une en ligne.

## Louis — état final et ventes à revoir (rien supprimé)

- 7 fiches recalées : 4 sur l'annonce « vendue » le 06/10 mais toujours en
  ligne (10254055978, 10251765273, 10248443064, 10254091481), 3 sur leur
  annonce la plus récente en ligne (10269303712, 10276047846, 10276053804).
- 7 fiches n'ont plus aucune annonce en ligne sur Vinted (l'annonce « vendue »
  le 06/10 et la remise du jour ont disparu du dressing sans y être vendues).
- **12 ventes du 06/10 15:02** reposent sur un signal faux (parc entier : Louis
  seulement) : 4 sur des annonces toujours en ligne (92670, 92672, 92676,
  92682 — fictives), 7 sur des annonces disparues sans vente Vinted (92673,
  92674, 92675, 92677, 92678, 92680, 92681), 1 sur une annonce vendue sur
  Vinted ensuite (92679). Décision de Louis ou de Nico ; rien supprimé.

## Commandes de contrôle

```
select * from releves_auto_refuses order by dernier_le desc;
select releve_veilleur_decision('<user>', '<platform>');
npm run selftest:boucles-fermees && npm run selftest:vinted-annonce-en-ligne
```
