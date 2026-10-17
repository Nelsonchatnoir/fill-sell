# Lot 5 — « Offres aux favoris » : inventaire du dépôt (LECTURE SEULE, 17/10/2026 ≈ 20:00 Paris)

Décision du 18/10 (session sans Nico, option la plus sûre) : **RIEN n'est ouvert**. Il n'y a rien à « finir » : aucun
envoi d'offre n'est codé sur aucune plateforme, et les questions posées à Nico par l'audit du 24/09 sont sans réponse.

## Ce qui existe

1. **Deux études, aucun code** :
   - `docs/AUDIT_BORDEREAUX_FAVORIS_2026-09-24.md` : offre native par plateforme (l.35-40) ; eBay (l.594-607)
     `find_eligible_items` a répondu 200 sur EBAY_FR (5 annonces éligibles chez Nico), `send_offer_to_interested_buyers`
     jamais appelé (remise ≥ 5 %, offre valable 2 j, acheteurs masqués) — « la seule forme autorisée » par eBay (l.631-635).
     Modèle seulement dessiné : tables `interesses`, `actions_sortantes`, RPC `reserver_action_sortante()` (plafonds par
     jour, espacement, interrupteur `coin_config`), interface −5/−10/−15 %, prix plancher (l.935-1083). Questions 4
     (« Vinted ? ») et 5 (« eBay d'abord ? ») posées à Nico (l.1320-1331), sans réponse écrite.
   - `docs/enquetes/messages-bordereaux-1610/RAPPORT.md` (l.43-57, 168-189) : eBay ✅ le plus sûr ; Leboncoin et Depop 🟡
     une par une, validées (≤ 10/jour, ≥ 3 min, textes jamais identiques) ; Vinted ❌ déconseillé (≤ 4/annonce/jour,
     préférer « Baisser le prix ») ; Beebs ❌ (app mobile seulement). L'appel Depop « Send offer » reste à relever.
2. **Compteurs de favoris (fini, pour tous)** : `annonces_plateforme.favoris` (mig 20260918001000) ; extension
   `background.js:15032-15056`, `:17369`, `:19615` ; serveur `_shared/ebay-trading-releve.ts:122-129` ; interface
   `src/stock/Carte.jsx:204-206`, `src/tabs/StockTab.jsx:2779-2852`. Des nombres, jamais des personnes.
3. **Messagerie bêta** (`beta_flags.messages_bordereaux` : Nico, Ornella, Louis) : types `'offre'` et `'favori'` dans
   `messagerie_messages` ; offres REÇUES lues (Vinted `messagerie.js:351-356, 382-386`, Leboncoin `:498-507`) ; « A mis
   l'annonce en favori » (`EspaceMessagerie.jsx:84`). Lecture seulement.
4. **eBay** : `sell.inventory` consenti (`_shared/ebay-oauth.ts:71-76`) suffirait pour l'API Negotiation (audit l.597) ;
   aucun code (0 occurrence de `negotiation`) ; seules les offres reçues sont lues (`ebay-ventes-sync:48,224`,
   `ebay-api-worker:2265`).
5. **Absent** : aucune table `interesses` / `actions_sortantes` / `offres_*`, aucun drapeau, aucune clé `coin_config`, aucun
   cron, aucune RPC, aucun écran ; pas de bouton « Baisser le prix » sur place (le seul prix modifiable passe par la
   republication, qui efface les favoris Vinted).

## Garde-fous de cadence réutilisables (le gabarit d'un futur `actions_sortantes`)

- Extension : `config.js:22-23` (8 s + jitter 12 s entre deux jobs), `background.js:3242-3245` (jamais deux ouvertures au
  même intervalle), `vinted.js:5353-5398` `creerCadenceur` (pause humaine, retard plafonné, selftest `vinted-cadenceur`),
  `vinted.js:5418-5429` / `ebay.js:2478-2517` / `leboncoin.js:5830` frappe humaine, `background.js:22585` 2 min entre deux
  gestes de republication, `:26594` / `:26962` un article par cycle, `:5332` plafond anti-robot 6 h.
- Messagerie : `messagerie.js:85-92` (10 min ± 90 s, 5 détails par passage) ; `background.js:20545-20564, 20710-20746`
  (une réponse par passage, empreinte SHA-256 revérifiée, 403/429 → `bloquerMessagerie`) ; migration 20261016220000 :
  20 envois / jour (heure de Paris), même texte en 10 min = même envoi, 60 s d'écart, jamais en retard de 24 h,
  interrupteur `coin_config.messagerie_envoi_mode` ; 20261016170000:296-361 `messagerie_releve_autorise`, pause 6 h / 24 h.

## Chemin le plus sûr (quand Nico tranche)

API eBay officielle (`find_eligible_items` puis `send_offer_to_interested_buyers`) : côté serveur, au clic du vendeur, sans
nouveau consentement ni paquet d'extension, acheteurs anonymes, plafonds tenus par eBay. Vinted et Depop = gestes sur la
page (R2), une personne à la fois, validés et plafonnés ; les deux études déconseillent Vinted et recommandent un vrai
bouton « Baisser le prix » sur place. Il manque : les décisions de Nico, la table journal avec plafonds et validation, un
drapeau bêta, les textes Legal (§ 8.5 eBay) et CWS ; pour Depop relever l'appel « Send offer », pour Vinted lire la
notification type 20.
