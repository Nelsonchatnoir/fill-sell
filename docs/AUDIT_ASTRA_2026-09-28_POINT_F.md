# Point F — barrière de version, 28 septembre

Cause : `EXTENSION_MIN_BUILD` alimentait le bandeau web, sans filtre général de distribution dans get-pending-jobs. Les filtres de correctifs spécifiques ne remplaçaient pas cette barrière. Une télémétrie de profil peut aussi décrire un autre poste du compte.

Corrigé : minimum commun dans `_shared/version-min-extension.js`, importé par le build web et les deux fonctions. Le build du poll décide avant distribution/réservation. Une file ancienne déjà chargée ne peut pas commencer un nouveau travail via l'ACK processing ; les résultats d'un travail déjà commencé restent acceptés. Aucun job utilisateur reclassé ni effacé. Popup en lecture inchangé.

Déployé : get-pending-jobs 157 (JWT true), update-job-status 97 (JWT false), réglages relus avant/après. Retour arrière : build/retour-point-f, source du commit a3e8a17. Tests borne exacte, build absent, version seule, ancien build Tessy, build 0.6.75 ; Deno et imports épinglés réussis.

Le minimum reste celui déjà publié du 24/09 à 14:34:46Z. La promotion vers `2026-09-27T20:16:30Z` attend la vérification du tableau de bord CWS demandée par Nico : l'outil navigateur ne présente que le navigateur intégré sans session Chrome. Question envoyée à Nico ; les profils actifs portent bien 0.6.75, mais le tableau de bord n'a pas été lu. Pas de promotion vers 0.6.76 avant acceptation.

Capgo relu avec bundle list ET channel list : dernier bundle et canal unique production = 2.9.30. Livraison OTA et paquet 0.6.76 à faire après les autres corrections pour livrer un seul artefact propre. Rien téléversé pour l'instant.
