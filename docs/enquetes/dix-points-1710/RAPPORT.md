# Session du 17/10 — migration 24 h et dix points (Louis, DeadRoz, linda, Thibault, Héloïse, Romain, patrick, Amiral, Fluxen, Ornella)

> Pour Nico. Court d'abord, détail ensuite. Heures de Paris. Enquêtes en lecture seule (SELECT bornés, journaux,
> code), puis correctifs de la RÈGLE (tous les comptes). Aucun mail, rien chez Stripe, aucun plafond changé, aucun
> geste sur une vraie commande ni sur un vrai acheteur.
> État de livraison (versions servies, heures de déploiement) : fin de ce fichier (§ Livraison) et
> `docs/agents/etat-2026-10-01.md` (§ 17/10 après-midi).

## 0. Migration « 24 h » (feu vert de Nico)

- **Cause** : une demande faite depuis le téléphone (récupérer un bordereau, commander l'étiquette Vinted,
  confirmer la disponibilité Leboncoin, accepter la commande Beebs) expirait après 30 min sans ordinateur.
- **Fait** : migration `20261017100000_bordereau_attente_24h.sql` — une seule ligne de `bordereau_demande_a_traiter`
  (corps relu en prod, md5 `e08f9b22…`) : 30 minutes → 24 hours ; commentaire de la table. Essai à blanc **14/14**
  (transaction annulée, prod relue inchangée), appliquée à **11:45** (`db query` + `migration repair`), puis les
  contrôles rejoués sur la vraie prod **12/12** (droits, sécurité, demande de 2 h rendue, 25 h expirée, génération
  de 23 h rendue seulement à une extension « generer », incertaine jamais refaite, compte sans drapeau refusé).
  Inverse : `supabase/rollbacks/20261017100000_bordereau_attente_24h.sql`.
- **Garde-fou** : l'extension relisait déjà la commande juste avant le geste ; la relecture DANS le geste est
  désormais exacte : annulée (Vinted 500, Leboncoin `*-cancelled`, Beebs `CANCELLED`), expédiée, ou en échec chez
  Vinted (210) = aucun geste, refus nommé (`commande_annulee`, `deja_expediee`) — la 0.6.122 rendait « déjà fait »
  pour tout statut Vinted ≥ 200 (sans geste non plus). App : « En attente de ton ordinateur…, 24 h au plus… Juste
  avant, il relit la commande… annulée ou déjà traitée entre-temps, rien n'est fait. »
- Selftests : `messagerie-generation` (22), `messagerie-app` (28).

## 1 à 10

(complété à la livraison)
