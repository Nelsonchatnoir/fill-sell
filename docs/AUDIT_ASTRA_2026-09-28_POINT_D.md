# Point D — copie et reprise, 28 septembre 2026

Une annonce importée peut être republiée. La sécurité porte sur la copie réellement disponible avant retrait.

## Changements

- Prévol : description, photos réelles et catégorie exigées. Un lien Leboncoin ou un compteur de photos ne remplace plus les données. Une désactivation du prévol ne permet plus de retirer sans copie.
- Une page de dépôt illisible entraîne une attente automatique avant tout retrait.
- Capture Vinted relue par identifiant de capture ET identifiant d'annonce.
- Retrait : navigation vers l'identifiant exact vérifiée et retentée avant d'appeler le gestionnaire. Une page de membre ne vaut jamais une annonce.
- Format du colis Vinted posé et relu avant le retrait, puis avant recréation. Aucun défaut choisi silencieusement en mode strict.
- Un refus propre à un article ou une question en attente ne retient plus toute la file. Une recréation réellement en cours conserve la priorité.

## État réel des cas

- Nadège : défaut de file confirmé. Partie serveur livrée dans get-pending-jobs 156, verify_jwt=true conservé, à 15:21 le 28/09. Partie locale attend l'extension 0.6.76 ; les anciennes extensions conservent leur garde locale.
- jocabroc8, job bd333e23-4980-4190-914d-5105801cb6b8 : attente du créneau 19 h, constatée dans les logs ; pas une recréation figée.
- doriane-henri, job 63b68552-e186-4f52-9bb5-66b8aa6c4ce2 : attente du créneau 18 h ; pas une recréation figée.
- carhoa, job 279c046f-c63c-42c4-9536-ec55fcdb9e04 : déjà recréé, Vinted 10164728230. L'ancien diagnostic n'est pas son état actuel.
- Nico, retrait c1c8a6b5-acc9-49de-8bad-3056a75fdc0c : identifiant 10124335822 prouvé ; garde de navigation corrigée, test réel en attente du chargement du nouveau build. Aucun retrait forcé.

## Vérification et limites

Tests de prévol, file par article, identité des routes, format réellement sélectionné ; syntaxe des scripts, content-scripts, republication-hors-ligne, contrôle Deno et build réussis. Aucun test sur une annonce d'utilisateur.

Après déploiement : cron doublons 98 ms, veilleur 22 ms ; réservation RPC HTTP 200, 50 ms à 15:25. Retour arrière serveur disponible dans build/astra-retour-get-pending-155 ; aucun retour arrière nécessaire.

La complétude des champs spécifiques et le parcours de correction d'une copie incomplète restent à contrôler avec les points G et les ajouts. Les changements extension ne sont pas encore servis au parc.
