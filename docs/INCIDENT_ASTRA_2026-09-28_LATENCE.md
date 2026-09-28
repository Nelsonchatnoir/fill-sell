# Latence du 28/09, contrôle de fin de passe

## Faits et retour arrière

À 16:42 environ, get-pending-jobs 158 ajoute un appel à
`enregistrer_ventes_prouvees` sur les polls d'exécution. Minimum conservé au
24/09 dans cette livraison temporaire, pour attendre le nouveau bandeau app.
update-job-status 98 conserve verify_jwt=false ; get-pending conserve true.
handler-watch 65 conserve false (seul changement de son module partagé :
ajout d'un utilitaire non appelé par ce handler).

Contrôle ClickHouse 16:20–16:49, appels RPC : avant 16:42, 1 738 appels,
moyenne 103 ms, p95 172 ms ; après, 558 appels, moyenne 392 ms, p95 1 447 ms.
Un suivi de poste atteint 5 066 ms, un relevé 6 891 ms. Aucun 5xx dans cet
échantillon. Le lien causal exact n'est PAS démontré.

Conformément au garde-fou Nico : déploiements suivants bloqués et retour
immédiat de get-pending-jobs au code fba7c15, relu comme version **159**,
verify_jwt=true. C reste actif ; seul le lot ajouté après ce code disparaît.
Le minimum réellement servi reste 2026-09-24T14:34:46Z. Les ventes atomiques
et les gardes « vente enregistrée avant retrait » restent en base.

Les premiers contrôles après retour montrent encore des pointes, puis
32–109 ms sur huit appels ordinaires à 16:49. Ce n'est pas encore une preuve
de stabilité durable. À 16:47, aucun travail SQL long actif observé ; la vue
statistique des appels automatiques donne 29 appels, moyenne SQL 210 ms,
maximum 1 114 ms (les durées HTTP incluent aussi les attentes hors exécution).

## État à ne pas confondre

- Les trois ventes demandées d'Angel sont enregistrées (54005–54007), aucune
  recréation et aucun mail. Elles ne sont pas annulées par le retour arrière.
- L'automatisation générale n'est plus appelée depuis le poll. Sa réactivation
  demande une cause et un coût vérifiés ; son appel est aussi retiré du source.
- Migration 20260928144357 : préparée et testée en transaction annulée, **NON
  appliquée**. Inverse homonyme prêt. Ne pas la présenter comme livrée.
- Pas de push, OTA, promotion du minimum 0.6.75, paquet CWS livré ni recharge
  de l'extension Nico pendant ce blocage.
- Deux différences locales préexistantes préservées ; prototype cloud intact.

Reprise : observer des comptes avec un job réellement prêt et une extension
active ; contrôler latence par RPC et attente de verrous. Ne pas confondre un
poste en ligne avec un job dû (créneaux, anti-robot et questions restent des
attentes légitimes). Aucun autre déploiement avant levée de ce blocage.

## Complément, 16:57

Les pointes persistent après get-pending 159. Les plus lentes concernent
`rapprochement_urls_a_empreinter` (13 701 ms, HTTP 500 à 16:50:04) et
`doublons_reserver_fiches` (8 391 ms, HTTP 500 à 16:50:22). Ces fonctions
datent du 27/09. Leur source commune `doublons_fiches_a_examiner` fait un
UNION avec une recherche corrélée sur toutes les fiches candidates AVANT
le LIMIT. Le budget de trois secondes de la fonction photos n'est vérifié
qu'entre les boucles : il ne borne pas la requête qui les précède.

Retour arrière également d'update-job-status : version **99**, code fba7c15,
verify_jwt=false, pour ne pas laisser un lot partiellement nouveau pendant
l'incident. handler-watch 65 garde le même comportement que 64 : l'ajout au
module poste-extension est une fonction qu'il n'appelle pas.

Migration **20260928145446_incident_suspendre_balayage_doublons**, appliquée
à 16:54:46 après inverse écrit et simulation annulée : un seul cron suspendu,
`doublons-balayage-2min` (job 17). Passage par `cron.alter_job` ; l'essai initial
d'UPDATE direct, en transaction annulée, a été refusé par les droits PostgreSQL.
Aucun autre cron arrêté, aucune fiche modifiée par cette mesure.

À 16:56:32–36, appels ordinaires 26–84 ms, réservation de jobs 30 ms ; les
autres crons réussissent (12–44 ms d'envoi). Suspension = mesure de protection,
PAS correction racine de la recherche : sa pagination et sa progression
persistante restent à corriger et à mesurer avant réactivation.

## Contrôle 17:03–17:05

Les vingt derniers appels RPC à 17:02:39–59 répondent en 26–72 ms, tous
200/204, dont réservation 38 ms et écriture de statut 38 ms. Les crons
handler-watch et republish-auto-sweep réussissent à 17:03, envois 40/48 ms ;
ces durées mesurent l'envoi, pas tout le traitement asynchrone.
Pas de nouveau succès de publication confirmé par ce contrôle : lecture
ciblée Nadège sans résultat depuis 16:54:46 ; recherche globale bornée par
statement_timeout=2s annulée à cette limite, non relancée. Ne pas présenter
la baisse de latence comme une preuve de reprise complète du parc.

## Reprise contrôlée après levée du blocage — 18:03

Nico a levé le blocage après une plage stable à 26–72 ms et 38 jobs aboutis
entre 16:39 et 17:35 sur six comptes. Les livraisons ont ensuite été faites
une par une : push `2c298b4`, OTA 2.9.31, zip extension 0.6.76, puis minimum
serveur 0.6.75 seulement après présence du bandeau dans le web et l'OTA.

Contrôles successifs de l'API : 69 ms de moyenne / p95 167 ms après le push ;
60 / 118 ms après l'OTA ; 64 / 78 ms après le zip. Le premier échantillon
après les fonctions serveur a porté un pic isolé à 692 ms ; le second, sur
40 lectures, est revenu à 56 ms de moyenne, 45 ms de médiane et 120 ms de
p95, sans aucune attente de verrou en base.

Après le déploiement complet du minimum, deux jobs ont abouti sur deux des
cinq comptes compatibles qui avaient encore une file ; trois comptes avaient
des réservations vivantes, dont un job en traitement. Les réglages relus sont
`get-pending-jobs` version 160 / `verify_jwt=true` et `update-job-status`
version 100 / `verify_jwt=false`. Le diff livré par rapport au retour serveur
`fba7c15` est uniquement la borne 0.6.75 ; le retour arrière reste prêt depuis
ce commit.

Le cron `doublons-balayage-2min` reste `active=false`. Aucun appel périodique
à `enregistrer_ventes_prouvees` n'a été réintroduit. Ces deux automatismes
restent bloqués jusqu'à une version bornée, légère et mesurée. Aucun mail,
aucune correction manuelle de données et aucune intervention sur le prototype
cloud pendant la reprise.
