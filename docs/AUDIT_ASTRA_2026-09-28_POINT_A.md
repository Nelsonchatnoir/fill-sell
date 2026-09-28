# Point A — preuves et corrections du 28 septembre 2026

Heures Europe/Paris. État vérifié jusqu'à 12 h 57. Ce document décrit cette
passe ; les règles opérationnelles seront reprises dans AGENTS.md en fin de lot.

## Identité

Un titre, un prix, une photo ou une date proche ouvre au plus une question.
Le rattachement automatique exige un identifiant exact ou l'historique prouvé
du dépôt. Un identifiant explicite contradictoire interdit le repli sur un lien.
Une vente ne retire pas une autre annonce de sa propre plateforme.

Chemins corrigés : classement et import des relevés, doublons, confirmation
photo, fusion automatique, recâblage, ventes relevées, rapprochement du dressing
Vinted, choix de la cible après republication, orchestrateur des ventes et
recherche d'annonce dans l'extension. Les décisions explicites des utilisateurs
sont conservées.

## Cas Opla — xxewwer

- Relevés du 28/09 : 09:49, 165/165, 70 imports ; 10:47, 176/176, 110 imports.
  Les imports avec une candidate alimentaient à tort « sans candidat ».
  Une annonce existante sur la même plateforme supprimait aussi la question.
- Les 84 fusions sont marquées `decide_par=utilisateur` et
  `inventaire_fusions.par=utilisateur (doublon proposé)` : décisions enregistrées
  entre 10:57:42 et 10:58:22. Aucune preuve d'une fusion automatique pour ces 84.
- Le moteur corrigé a réexaminé 91 fiches par appels séquentiels d'une fiche :
  67 examens ont produit 74 propositions ; 24 n'ont pas trouvé de proposition.
  Le dernier appel ne trouvait plus de fiche éligible. Aucune fusion rejouée.
- Deux relevés complets distincts sont nécessaires pour une absence. La reprise
  bornée a confirmé 100 absences Opla et posé le signal interrogatif existant
  sur 99 dépôts identifiés exactement. Les dépôts restent dans l'historique ;
  aucun retrait et aucune vente ne sont déclenchés par ce constat.
- Beebs est exclue de ce constat d'absence. La modération n'est jamais jugée.

Phrase proposée : « Les nouvelles annonces Opla sont maintenant distinguées des
anciennes. FillSell te demande lesquelles représentent le même article, sans
les fusionner tout seul. »

## Cas Albert — remialbertholl

### Les 212 annonces narema75

Le relevé `0f8ebb0f-2309-470a-bb39-59c41fc10865`, terminé à 11:42, a actualisé
212 fiches : 178 actives, une fiche encore en stock avec un signal vendu,
33 fiches déjà vendues. 212 est le total lu, pas le nombre encore en vente.
Le stock de cette boutique contient 179 fiches et 38 fiches vendues au moment
du contrôle. Les 180 fiches en stock de jcassou n'ont pas été actualisées par
ce relevé. Pas de preuve d'une perte de 33 annonces actives sur ce passage.

### Le dressing de Nadège

Le relevé du 03/09 à 07:12:52 a importé le dressing connecté dans Chrome
(16040413) dans le compte FillSell d'Albert, sans confirmation de boutique.
Il porte 714/714 et la note de changement narema75 → nadegemarcelin78.
Le relevé du 11/09 à 12:09 a ensuite été bloqué par `boutique_a_confirmer`.

Trois retraits ont réellement reçu HTTP 200 et le résultat `code: 0, Ok`.
Les identifiants correspondent aussi aux fiches du compte FillSell de Nadège :

| Job créé le 11/09 | Annonce | Job | Résultat dans la trace |
|---|---|---|---|
| 09:59:42 | 1941205588 | f5fe5dd9-216a-46e5-b6b3-432b36d43fd0 | suppression acceptée |
| 10:00:21 | 2583798600 | f9c45368-0bc2-455e-b5d0-7295b0a99590 | suppression acceptée |
| 10:03:17 | 8405994049 | d388ff88-a717-46c8-910a-b4f349c9455f | suppression acceptée |

Ces heures sont celles de création des jobs ; les traces ne donnent pas une
heure indépendante suffisamment fiable du POST. Extension 0.6.26,
build `2026-09-10T19:14:19Z+a658c6b`.

Autres opérations identifiées par l'identifiant de l'annonce, sans déduire
une suppression du seul statut du job :

| Création | Annonce(s) | Résultat enregistré |
|---|---|---|
| 20/09 18:42:31 | 9760027975 | republication annulée avant capture ; origine 16040413 sur la fiche |
| 22/09 10:40–11:25 | 2583786846, 2685705765, 2827419736, 2827413291, 2827408047, 4575784350, 4583003887, 4630729946, 4967986009 | retraits annulés ; pas de suppression réussie prouvée |
| 23/09 16:15:52 | 5945342431 | retrait annulé ; pas de suppression réussie prouvée |
| 28/09 10:40:34 | 7037831614 | POST tenté, HTTP 403 ; propriétaire 16040413, session 295151754 ; ensuite boutique_etrangere |

Des jobs anciens portent `deleted` mais leur trace indique « requête de
suppression NON envoyée ». Ce statut ne constitue pas une preuve de retrait.

Protection appliquée : import Vinted refusé en base si boutique non confirmée,
y compris lors d'un upsert ; distribution des opérations interdite sur une
origine non confirmée, inconnue ou contradictoire. L'extension préparée vérifie
en plus la propriété avant le POST de retrait, et non après un 403.
Aucune fiche d'Albert n'a été déplacée ou supprimée.

### celineetmarie et claire972elegante

Les échecs celineetmarie portent `boutique_a_confirmer` : la boutique ne figure
pas parmi narema75 et jcassou confirmées. C'est une question utilisateur réelle.
Pour claire972elegante : connecter cette boutique dans Chrome, actualiser le
dressing, confirmer « C'est bien ma boutique ». `confirmerBoutiqueVinted`
ajoute cette confirmation sans plafond par palier dans ce chemin ; ne pas
confondre avec les quotas de publication/republication.

Phrase proposée : « Ton relevé narema75 a bien lu 212 fiches, dont des ventes.
Pour ajouter claire972elegante, connecte cette boutique dans Chrome puis
confirme-la au prochain relevé. J'ai aussi identifié un ancien import d'une
autre boutique et bloqué les opérations sur ses articles. »

## Migrations et retour arrière

Chaque inverse a été écrit avant application dans `supabase/rollbacks/`, avec
le même nom que la migration. Rejeux annulés effectués avant application.
Autorisation : GO de Nico pour la passe A à I et ajout des deux cas au point A.
Les fichiers utilisent les versions réellement enregistrées par Supabase.

| Migration | Application | Portée |
|---|---|---|
| 20260928085904_point_a_identite_prouvee | 10:59 | dix fonctions d'identité et de vente/retrait |
| 20260928101812_point_a_questions_remplacements | 12:18 | identifiant exact, propositions, compteurs, reprise bornée |
| 20260928102522_point_a_boutiques_et_import_vinted | 12:25 | garde INSERT/UPDATE de l'import, rapprochement Vinted exact |
| 20260928103046_point_a_retraits_historique_exact | 12:30 | cible de retrait et annonce de la vente |
| 20260928104620_point_a_absences_releve_prouvees | 12:46 | deux relevés complets, lots de 25, aucun verdict Beebs |
| 20260928105655_point_a_identifiant_url_ventes | 12:56 | suppression du dernier repli sur un numéro dans l'URL des ventes relevées et des exclusions de candidats |

Retour arrière en ordre inverse. Aucun balayage de données dans ces migrations.
Index existants vérifiés avant les nouveaux parcours. Timeouts de 5 secondes
et attente de verrou limitée à une seconde.

Fonctions déployées et versions lues : get-pending-jobs 151 puis 152,
`verify_jwt=true` ; check-listing-status 33, `verify_jwt=false` conservé.
Sauvegardes locales de retour : `build/astra-retour-get-pending-150/` et
`build/astra-retour-check-32/`. Aucune autre fonction déployée à ce stade.

## Validation et limites de cette étape

- Tests de recréation, 16 tests de boutique, neuf scénarios de retrait Vinted,
  vérification des content scripts et des imports épinglés : réussis.
- Vérification Deno de get-pending-jobs et check-listing-status : réussie.
- Migration des absences : 25 constats Opla simulés puis annulés ; zéro Beebs ;
  inverse testé et annulé. Droits anonymes refusés, accès utilisateur conservé.
- Crons après migration : succès, 18–51 ms sur les derniers appels planifiés.
  Ces temps mesurent l'envoi pg_net ; les RPC du balayage ont aussi été lues :
  71–120 ms. Premier appel observé de get-pending-jobs 152 : 200 en 1 406 ms.
- Un appel photo isolé à 6 632 ms vers 11:55 a été observé plus tôt ; les
  contrôles suivants sont revenus entre 58 et 377 ms. Pas de dégradation
  durable constatée et pas de retour arrière appliqué.
- Le code extension 0.6.76 n'est pas encore livré. Le poste de Nico reste
  sur la 0.6.75 installée par Fable. Sa dernière lecture Vinted a confondu
  un HTTP 403 avec une déconnexion : à traiter avec D/E. Le retrait 10124335822
  reste retenu en l'absence d'une preuve fraîche de session ; pas de forçage.
- B (vente atomique), C (réservation), D (copie/reprise et écran des questions
  de recréation), E (autres chemins de disparition), F à I restent à terminer.
