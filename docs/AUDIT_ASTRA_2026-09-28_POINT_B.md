# Point B — vente atomique et reprise

Passe autorisée par Nico le 28/09/2026. Heures Europe/Paris.

## Corrigé

- `enregistrer_vente_atomique` écrit dans une transaction le statut du job,
  la quantité, l'historique vendu, les lignes de vente et le reçu de reprise.
  Une erreur annule ces écritures ensemble. Le reçu empêche une nouvelle
  consommation après une réponse perdue, y compris depuis une copie liée.
- `sale-orchestration.ts` appelle cette transaction avec le contrat existant.
  `App.jsx` l'utilise pour les confirmations de stock, vocales et de disparition.
  Une quantité attendue empêche deux écrans périmés de vendre la même unité.
- `enregistrer_ventes_relevees` partage le verrou de fiche et retrouve le reçu
  exact d'une confirmation déjà enregistrée avant d'ajouter une vente relevée.
- Les ventes anciennes ambiguës sont refusées avec une explication ; aucune
  vente historique n'a été rejouée ou réparée pendant cette passe.

## Production

- Migration `20260928111221_point_b_vente_atomique.sql` APPLIQUÉE le 28/09
  à 13:12 (GO Nico, passe A à I). Table neuve indexée ; aucun balayage de données.
- Inverse de même nom dans `supabase/rollbacks/`, écrit et testé avant application.
  Il conserve les reçus pour ne jamais oublier les ventes déjà comptées.
- `check-listing-status` version 34 déployée à 13:14, `verify_jwt=false`
  conservé ; authentification interne conservée. Sauvegarde locale version 33 :
  `build/astra-retour-check-33/supabase/`.
- Après déploiement : crons réussis (balayage 37–43 ms), RPC du balayage
  139–368 ms, HTTP 200. Aucun retour arrière nécessaire.
- App web et mobile : changements encore à livrer avec le lot final.

## Vérification et limites

- Corps réel de la RPC testé sur tables temporaires, transaction annulée :
  vente partielle, prix d'achat inconnu, rejeu, copie sur une autre plateforme,
  double confirmation, panne pendant l'insertion puis reprise, ancienne vente,
  deux exemplaires sur la même plateforme. Aucune vente réelle créée pour tester.
- Test client : réponse perdue, clé conservée, rejeu et refus affiché.
- Deno et build applicatif réussis. Pas de test simultané sur deux connexions
  de production : sérialisation assurée par verrou de fiche et reçu unique.
- Les saisies d'une vente déjà passée et les imports comptables restent des
  chemins distincts ; cette correction couvre la vente d'un stock existant.
# Complément quantité — 28/09 à 15:32

La revue demandée pour Louis a trouvé que la RPC armait ses copies même après une vente partielle. Migration `20260928133204_point_b_stock_restant` APPLIQUÉE (GO Nico) : seuls les stocks épuisés clôturent les autres plateformes. Une annonce explicitement vendue garde son reçu ; les copies encore disponibles ne reçoivent pas ce reçu et leur prochaine vente reste distincte. Aucun retrait ni vente historique modifié.

Inverse dans `supabase/rollbacks/20260928133204_point_b_stock_restant.sql`, écrite avant application. Rejeu DDL annulé et tests SQL sur tables temporaires réussis : vente partielle, rejeu, dernière unité, retrait de sa copie prouvée, erreur puis reprise. Le trigger de vente existant écarte déjà les quantités supérieures à 1 avant consommation. Aucun déploiement edge nécessaire.
