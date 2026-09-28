# Point C suspendu — 28 septembre 2026

Heures Europe/Paris. **Nouveau GO nommé de Nico obligatoire avant toute remise en production de C.**

## Déploiement interrompu

- 13:43:22 : `20260928114322_point_c_reservation_jobs` appliquée.
- 13:44:38 : `update-job-status` 93 déployée, JWT true.
- 13:47:21 : `20260928114721_point_c_liberation_reservations` appliquée.
- `get-pending-jobs` est restée en version 154 : la distribution avec réservation n'a jamais été déployée.
- Alerte Nico : aucun job abouti depuis 13:30:42, malgré 18 postes actifs et 87 jobs en attente. Cette heure précède le déploiement de C ; elle ne suffit pas à établir sa responsabilité.

## Retour arrière effectué à la demande de Nico

- Vers 13:53 : source sauvegardée de `update-job-status` 92 restaurée, servie en version **94**. JWT true d'abord conservé selon la consigne initiale ; la version 92 avait JWT false.
- 13:58:26 : retour arrière complet, configuration comprise, en version **95**, JWT false comme avant C. L'ordre urgent de retour arrière complet prime sur la consigne initiale. La fonction vérifie toujours le Bearer et `auth.getUser()` ; aucune authentification interne retirée. Config locale également restaurée.
- 13:53:14 : `20260928115314_retour_point_c_liberation_reservations`, retrait du trigger et de sa fonction.
- 13:53:30 : `20260928115330_retour_point_c_reservation_jobs`, retrait des trois RPC et de la table de réservation.
- La table était vide avant suppression. Aucun job ni contenu utilisateur modifié par ces inverses.
- Relecture : table et RPC absentes ; `get-pending-jobs` 154 JWT true, `update-job-status` 95 JWT false.
- Code C non déployé sauvegardé dans `build/POINT-C-SUSPENDU-20260928/`, puis fichiers opérationnels restaurés à HEAD. Les travaux A/B et les deux fichiers locaux préexistants restent conservés.

## Constats de reprise — ne pas confondre démarrage et réussite

- Journaux de distribution : Nadège recevait deux jobs à 13:49 et 13:51, puis à 13:53. Un HTTP 200 seul ne prouve pas qu'un job a été exécuté.
- Après retour arrière : job `edd1e8c1-70e8-450b-aabd-a366f26b0647` passé en processing à 13:53:37, puis remis en pending à 13:55:26, étape deleted, reprise automatique prévue vers 14:00.
- À 13:56, aucun succès après le retour arrière parmi les 18 comptes actifs contrôlés, en lectures séquentielles bornées. **Rétablissement complet non confirmé à ce stade.**
- Santé : cron doublons 14 ms à 13:54 ; appels réels `doublons_examiner_fiche` 29–64 ms, HTTP 200. Aucun ralentissement mesuré sur cet échantillon après les inverses.

## Suite autorisée

Observer une réussite réelle sans relance manuelle. Ensuite établir la cause sur les journaux et le code. C reste suspendu, même si la cause se situe ailleurs. Aucun autre déploiement pendant ce contrôle.

## Reprise confirmée à 14:02:37

Le job `edd1e8c1-70e8-450b-aabd-a366f26b0647` de Nadège est `published`,
étape `recreated`, `published_at = 2026-09-28T12:02:37.711Z` :
https://www.vinted.fr/items/10167489341-jean-bleu-gemo-38

Aucun réarmement ni UPDATE manuel. Deux reprises automatiques ont été observées,
à 13:53:37 puis 14:01:37. La deuxième aboutit.

## Diagnostic après reprise

- La responsabilité de C dans un arrêt général n'est **pas établie**. La distribution 154 n'utilisait pas la nouvelle réservation. La table vide ne prouve donc pas une panne de réservation.
- Nadège exécutait déjà ce même job avant C : processing à 13:33:40, 13:34:44 et 13:41:39 ; pending à 13:35:35 et 13:43:24. Ces événements sont dans les journaux de `update-job-status`, pas déduits de l'heure de création.
- Sous la version 93, les captures continuaient d'être acquittées : jobs `8eeb4cf7…`, `d888a98c…`, `c1ce72ae…`, `dd5421db…` remis en pending entre 13:45:58 et 13:52:03. Les appels 93 visibles dans `function_edge_logs` sont HTTP 200 ; cet échantillon ne prouve pas l'absence de toute erreur du parc.
- Le diagnostic conservé pour la recréation de Nadège est un refus Vinted HTTP 400 : `package_size`, « Sélectionne le format de ton colis ». Son annonce déjà retirée retenait les retraits suivants via la garde existante « un seul retrait en vol » (`get-pending-jobs/index.ts`, vers 2677). Les logs 13:49–13:53 le confirment. Cette garde protège les autres annonces ; elle n'a pas été retirée.
- À 14:01–14:02, parmi 18 comptes récemment connectés, seuls quatre portaient des jobs pending/processing : Nadège, xxewwer (un retrait Beebs), un compte avec republication Vinted captured, un compte avec trois retraits Opla différés. Les autres n'avaient pas de travail pending/processing à cet instant. Cette lecture ne décrit pas tous les comptes ni toutes les 87 lignes signalées initialement.
- Le succès à 14:02:37 confirme la reprise demandée ; il ne prouve pas que tous les blocages D/E antérieurs sont réglés, ni que le format de colis a été corrigé à la racine.
- Après restauration complète, cron doublons 23 ms à 13:58 et appels réels 65–138 ms HTTP 200 sur l'échantillon disponible. Pas de dégradation mesurée.

**Décision maintenue : aucun redéploiement de C sans nouveau GO de Nico.**
