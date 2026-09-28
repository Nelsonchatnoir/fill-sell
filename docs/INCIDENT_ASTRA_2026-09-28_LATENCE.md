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
