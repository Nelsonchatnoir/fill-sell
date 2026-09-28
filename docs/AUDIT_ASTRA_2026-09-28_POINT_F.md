# Point F — barrière de version, 28 septembre

Cause : `EXTENSION_MIN_BUILD` alimentait le bandeau web, sans filtre général de distribution dans get-pending-jobs. Les filtres de correctifs spécifiques ne remplaçaient pas cette barrière. Une télémétrie de profil peut aussi décrire un autre poste du compte.

Corrigé : minimum commun dans `_shared/version-min-extension.js`, importé par le build web et les deux fonctions. Le build du poll décide avant distribution/réservation. Une file ancienne déjà chargée ne peut pas commencer un nouveau travail via l'ACK processing ; les résultats d'un travail déjà commencé restent acceptés. Aucun job utilisateur reclassé ni effacé. Popup en lecture inchangé.

Déployé : get-pending-jobs 157 (JWT true), update-job-status 97 (JWT false), réglages relus avant/après. Retour arrière : build/retour-point-f, source du commit a3e8a17. Tests borne exacte, build absent, version seule, ancien build Tessy, build 0.6.75 ; Deno et imports épinglés réussis.

À 16 h, Nico confirme la publication CWS par les builds officiels reçus de 34 comptes. Le code inscrit 0.6.75 dans ALREADY_PUBLISHED et PUBLISHED_BUILD_IDS ; minimum exact `2026-09-27T20:16:30Z`. Le bandeau explique l’attente sur ordinateur ET mobile et reste visible tant que la version est ancienne. Déployer ce minimum serveur seulement après livraison du bandeau web/OTA : la production 157/97 sert encore le minimum du 24/09. Pas de promotion vers 0.6.76 avant acceptation.

Capgo relu avec bundle list ET channel list : dernier bundle et canal unique production = 2.9.30. Livraison OTA et paquet 0.6.76 à faire après les autres corrections pour livrer un seul artefact propre. Rien téléversé pour l'instant.
