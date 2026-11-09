# Un seul exécutant pour les clients Cloud — 09/11/2026 soir

Décision de Nico (09/11 soir) : chez un client au Cloud actif (`profiles.cloud_voie`), **un seul exécutant, le
Cloud** ; l'extension de son ordinateur ne reçoit plus rien des plateformes du Cloud (Vinted, Leboncoin, Beebs, Depop).

## 1. La preuve (Deborah Seghir, `f0acd3af`, `vinted_sync_runs`, heure de Paris)

| Demande | Prise par | Résultat |
|---|---|---|
| dressing Vinted (`bouton_distant`), prise 19:36:52 | PC `2026-11-09T09:46:04Z+6d36bb4` | done |
| relevé Leboncoin (`reprise_connexion`), prise 19:43:08 | PC 6d36bb4 | absente — « page de connexion » |
| relevé Leboncoin (`reprise_connexion`), prises 19:55:39, 19:59:32, 20:01:39 | Cloud `f6f45e3-cloud` | done |
| relevé Leboncoin (`reprise_connexion`), prise 20:04:08 | PC 6d36bb4 | absente — « page de connexion » |

Les **tâches** étaient déjà réservées au Cloud (`jobsSelonDrapeauCloud`, 01/11). Les **demandes de relevé en file**
(dressing, relevés « annonces ») et les **lectures de fond** (textes Vinted, pages Beebs), elles, partaient au premier
poste qui interrogeait le serveur, le PC compris.

## 2. Le correctif (get-pending-jobs + `_shared/cloud-voie.js`)

- `commandeLaisseeAuCloud()` : pour le PC d'un compte au Cloud actif, le dressing et les relevés « annonces » des
  4 plateformes du Cloud restent en file pour le poste Cloud. Le filtre est posé **à la source** : `lireCommandesEnFile`,
  la lecture unique des demandes en file. Le drapeau est lu une fois si le poll n'en a pas encore la valeur.
- `lectureFondPourCePoste()` : les lectures de fond Vinted et Beebs ne sont plus servies au PC d'un compte au Cloud.
- Inchangé : le poste Cloud ; tout compte sans Cloud (drapeau faux ou illisible = comme avant) ; eBay (API ou PC) ; les
  demandes « connexion » (un geste de la personne) ; les tâches (règle du 01/11).
- Invisible pour la cliente : rien ne s'affiche sur le PC, les demandes sont simplement prises par le Cloud.
- Selftest : `scripts/cloud-un-executant-selftest.mjs` (21 vérifications).

## 3. Ce qui reste au PC (et qui demande ton feu vert)

Le serveur ne décide pas de tout : l'extension du PC lance encore **d'elle-même** son relevé quotidien du dressing
(alarme de 24 h), son relevé quotidien des annonces, les relevés du veilleur et la lecture des commandes Vinted (si
les bordereaux sont ouverts). Deux façons de les couper pour tous les clients Cloud :
- **sans nouvelle extension** : une migration (déclencheur sur `vinted_sync_runs`, comme `releve_auto_plancher`) qui
  refuse en silence un relevé d'une plateforme du Cloud créé ou pris par une autre session que celle du poste Cloud
  (`cloud_postes.session_fillsell_id`), plus la même garde dans `messagerie_releve_autorise` ;
- **ou** une extension qui lit un champ du serveur, « plateformes du Cloud », et n'y touche plus jamais, comme
  Leboncoin « délégué » depuis la 0.6.164.
Rien n'est fait de ce côté sans ton feu vert nommé (SQL montré, essayé d'abord sur une base jetable).
