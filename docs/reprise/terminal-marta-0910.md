# Reprise — terminal « Marta » du 09/10 (chantiers A, B, C, D, E)

Compte déclencheur : Marta MELE (`ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3`), Pro payée
le 09/10 à 11:07, Italie (Stresa, EOLO), app dans Chrome, extension dans Edge.

## A — fausse vente eBay (enchère)

- **Cause prouvée** : le veilleur eBay (`ebay-api-worker` v79) lisait « date de fin
  présente » comme « terminée », sans la comparer à maintenant. Enchère
  920016444915 (Browse : `[FIXED_PRICE, AUCTION]`, fin 14/10 06:36Z, IN_STOCK,
  0 vendu) posée « Plus en ligne — Vendue ? » à 11:30:05 ; à 11:32:15-16 un POST
  `check-listing-status` depuis SON Chrome (jeton de Marta, corps `{job_id, price:15}`)
  → `enregistrer_vente_declaree` → vente 108675 « Ailleurs ». Ce n'est PAS le
  serveur seul : c'est un appui sur une question fausse.
- **Corrigé** : `_shared/ebay-etat-annonce.js` (fin future = vivante ; enchère sans
  acheteur = ni vente ni question, job clos) ; veilleur v80→v83 (lève les faux
  drapeaux, eBay dément toute question « unavailable ») ; migration
  **20261009120000 APPLIQUÉE** (sans preuve, une annonce encore en ligne n'est
  jamais vendue — eBay fin future / vue en vente, toute plateforme revue en ligne
  après l'alerte). Preuve : `scripts/preuves/preuve-vente-annonce-en-ligne.mjs`.
- **Reste (GO Nico)** : `scripts/reparations/20261009_marta_recu_fausse_vente.sql`
  (le reçu de la vente annulée bloquerait la vraie vente de l'enchère) ; audit des
  8 ventes eBay et des 60 ventes « Ailleurs » (rapport du 09/10).
- **Bebertdeals (08/10)** : même chemin (`check-listing-status` → vente déclarée),
  entrée « Revue des disparus », puis `inventaire_vendu_retire_ses_copies`.

## B — Vinted bloqué (Marta)

- **Cause prouvée** : extension dans Edge (poste ac2c311e, en-tête `Edg/154`),
  app dans Chrome ; aucune session Vinted dans Edge → sonde 403 « session_absente ».
  vinted.it : non vérifiable sans permission (sa réponse au mail tranchera).
- **Corrigé** : `get-pending-jobs` v225 (navigateur + pays du poste,
  `contexte.vinted_etranger`) ; bloc « Synchroniser » nomme le navigateur ;
  eBay : compte étranger jamais publié ni configuré sur ebay.fr (`_shared/ebay-site.ts`,
  migration **20261009150000 APPLIQUÉE**, ebay-api-worker v81+, ebay-account v17,
  ebay-oauth-callback v11 ; Marta = « Italy »). Extension 0.6.106 (domaines Vinted
  étrangers en permission OPTIONNELLE) : voir le rapport.

## C — mail « paiement échoué » pendant un paiement qui passe

- 3D Secure demandé au Checkout (subscription_create) : Stripe émet
  `payment_failed` + `payment_action_required` pendant la validation ; v57 écrivait.
- **Corrigé** : `stripe-webhook` v58 (`decisionMailEchec`) ; selftest
  `selftest:paiement-echoue-acquis` (Marta, romain.knc → 0 mail ; Nadège → mail).
- MCP Stripe à reconnecter pour lire charges / Radar.

## D — mail « vendu » sans vente (Bebertdeals)

- Les 2 ventes sont RÉELLES (pages publiques « Vendu ») ; la vente n'était pas
  enregistrée (la lecture de page du veilleur n'était pas une preuve pour Vinted).
- **Corrigé** : migration **20261009130000 APPLIQUÉE** (lecture de page = preuve →
  cron 52 enregistre, retire les copies, puis mail).
- **NON appliquée (décision Nico)** : 20261009160000 (aucun mail avant la vente
  enregistrée) — ferait perdre son mail à une vraie vente non prouvée (RoCotCot, LBC).

## E — refus de modération Leboncoin en « Vendue ? »

- **Corrigé** : migration **20261009140000 APPLIQUÉE** (dépôt jamais vu en ligne =
  échec de publication avec motif ; cron 72 h ; questions déjà ouvertes intactes).
- **Reste (GO Nico)** : `scripts/reparations/20261009_depots_jamais_en_ligne_question_vers_echec.sql`
  (Nadia ×3, Tech-t ×1) ; garde doublon par photo au dépôt (proposée).
