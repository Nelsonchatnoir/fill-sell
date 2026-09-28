# Point C — réservation compatible avec le parc installé

## État opérationnel

Nouveau GO de Nico le 28/09 après le contrôle de midi. Nico confirme que
l'interruption ne venait pas de C. La règle JWT fait désormais foi sur la
production : **ne jamais changer le réglage servi par une fonction**.

- Migration `20260928130523_point_c_reservation_compatible_reprise`, appliquée
  le 28/09 à 15:05:23 (GO Nico), inverse de même nom dans `supabase/rollbacks/`.
- `update-job-status` **96**, JWT **false**, déployée à 15:05:28.
- `get-pending-jobs` **155**, JWT **true**, déployée à 15:05:53.
- Retour arrière : restaurer les deux fonctions sauvegardées (get 154 dans
  `build/astra-retour-get-pending-154`, update 92/95 dans
  `build/astra-retour-update-job-92`, configuration false), puis appliquer
  l'inverse. Il ne supprime que les réservations, aucun job utilisateur.

## Règle corrigée

Une réservation appartient à une session de poste. La lecture de la file
réserve sous verrou ; l'accusé de début et le verdict vérifient le propriétaire
et la génération. Une annulation ou une reprise survenue entre-temps prime.
Un résultat tardif ne ressuscite pas un job terminé. Le popup ne réserve pas.
Une file non commencée expire ; une exécution en cours reste protégée jusqu'à
son verdict ou sa reprise par le veilleur. Toute sortie de processing libère
la réservation, y compris les gardes qui répondent avant le verdict normal.

Le même poste peut relire sa file non commencée : une publication ciblée qui
ignore les autres jobs ne doit pas les geler dix minutes.

Les extensions installées conservent leur contrat et leur session existante.
La 0.6.69 vérifie déjà l'accusé processing avant les gestes sur les plateformes.
La 0.6.76 en préparation ajoute un identifiant d'installation facultatif.
Limite : deux anciennes installations ayant copié exactement la même session
JWT restent indiscernables ; cette distinction supplémentaire attend la nouvelle
extension. Aucun champ nouveau imposé à l'ancien parc.

## Vérifications

- Corps SQL réel testé sur tables temporaires, transaction annulée : concurrence
  entre postes, relecture du même poste, ancien contrat, expiration, annulation,
  reprise avec nouvelle génération, ancien verdict refusé, autres utilisateurs.
- Migration complète exécutée puis annulée : création prouvée, absence après
  ROLLBACK prouvée, avant application réelle. Pas de balayage des grosses tables.
- Deno sur les deux fonctions, tests de refresh 401 et imports épinglés : réussis.
- Identifiant d'installation stable après appels simultanés et redémarrage.
- Nadège : extension 0.6.75 active, neuf jobs en attente ; à 15:07:38 réservation
  en 35 ms, contrôle en 34 ms, écriture en 33 ms, HTTP 200. Job
  `c9fac25e-1474-4f17-a8a5-8da4be420270` passé de a_capturer à captured (capture 8950).
- Santé après déploiement : cron doublons 17 ms à 15:06, appel réel 91 ms,
  HTTP 200. Aucun ralentissement mesuré sur ces échantillons.

Succès final observé sans relance manuelle : ce même job est published/recreated
à **15:10:39.459**, nouvelle annonce
https://www.vinted.fr/items/10168328039-pantalon-jean-kiabi-40-grisbleu .
Réservation au second passage : 30 ms ; contrôle final 38 ms ; écriture finale
43 ms, HTTP 200. Le parcours complet du parc déjà installé est ainsi observé.
