# C4 — « Voir les autres formules » et descendre à la fin de la période (09/11/2026 nuit)

**État : PRÊT, PAS EN PROD.** Nico l'avait dit : « si un point est incertain (paiement, résiliation, droits d'accès) :
pas en prod, laisse-le prêt et explique ». Trois points le sont : ils sont écrits plus bas, avec ce qu'il faut pour
les lever.

## Ce que voit l'abonné (web), une fois ouvert
Dans Réglages › Abonnement, sous la carte de la formule, une ligne « Voir les autres formules » (un pli). Elle s'ouvre
sur les formules **plus basses** seulement, la plus proche d'abord (Business : Pro, puis Premium), chacune avec son prix
et un bouton « Passer à Premium le 9 décembre ».
- **Confirmation :** « Ta formule Pro reste entière jusqu'au 9 décembre. Ensuite : Premium, 12,99 €/mois. Rien n'est
  remboursé ni prélevé aujourd'hui, et tu peux annuler ce changement jusqu'au 9 décembre. »
- **Une fois programmé :** « Ta formule passera à Premium le 9 décembre. » et un bouton « Garder Pro » (annule le
  changement).
- **Refus :** chaque refus du serveur se dit en une phrase, jamais un code brut (arrêt déjà prévu, montée en attente de
  paiement, refus Stripe…).
- **Captures :** `node scripts/apercu/capture-c4-formule.mjs`, avec le vrai bloc et de vrais clics. Le parcours complet
  est vérifié en Chrome 1440 / 390 / 320 et en WebKit iPhone SE / 15 Pro Max, fr et en : **750 contrôles verts**.
  - Rien ne déborde, aucun texte coupé.
  - Boutons ≥ 44 px, textes ≥ 4,5:1.
  - Appels : `lire` puis `programmer`, et « Garder » appelle `annuler`.
  - Défauts vus et corrigés : la date coupée (« le 9 » | « décembre ») est maintenant insécable, la formule la plus
    proche vient d'abord, et le pli a une flèche ⌄/⌃ au lieu de ›.

## Stripe — prouvé en MODE TEST (`node scripts/stripe-test/descente-formule-test.mjs`, 23/23)
Le banc utilise de vrais objets du mode test (horloges de test, `pm_card_visa`), rejoués dans NOTRE code de décision :
`drapeauxDepuisStripe`, `palierDeFacture`, `descentePrevue`. Jamais `--live`. Tout est effacé à la fin.

**A. Pro → Premium :**
- Le schedule a deux phases : la formule actuelle jusqu'à la fin de la période payée, puis Premium.
- Avant l'échéance : Pro **entier**. Rien n'est facturé ni remboursé en programmant.
- À l'échéance : même abonnement, prix Premium, `plan_type` standard.
  - Droits : Premium seulement (`is_pro` faux).
  - Facture : 12,99 € payée, crédit du mois au palier premium.
  - Plus rien de « prévu ».
- Le mois suivant : toujours 12,99 €, l'abonnement est rendu à lui-même.

**B. Business → Pro :** Pro, `is_business` faux, 29,99 €.

**C. Annuler avant l'échéance (release) :** Pro reste, 29,99 € à l'échéance.

**D. Monter pendant une descente prévue — ⛔ DANGER PROUVÉ :**
- Stripe **accepte** la montée directe mais **garde** le schedule : sa phase 2 ramènerait le Business à Premium à
  l'échéance.
- **Règle retenue (dans le lot) :** `create-checkout-session` refuse la montée tant qu'une descente est prévue. Il
  renvoie 409 `descente_prevue` avec une phrase que l'app affiche déjà (`message_fr` / `message_en`). Le client annule
  d'abord le changement, puis monte.
- **Pourquoi ne pas rendre l'abonnement d'abord ?** Avec un paiement à valider (`pending_if_incomplete`), un abandon
  ferait perdre la descente, et la personne paierait plus sans l'avoir voulu.

**E. Résilier pendant une descente prévue — ⛔ PROUVÉ :**
- Stripe **refuse** la résiliation directe (« The subscription is managed by the subscription schedule… »).
- Le `cancel-subscription` d'aujourd'hui échouerait donc : la résiliation en trois clics serait cassée.
- **Règle retenue (dans le lot) :** rendre l'abonnement à lui-même, puis le résilier. Le banc prouve : Pro jusqu'à
  l'échéance, puis Free, aucune facture Premium.

**F. Le Cloud (abonnement à part) n'est jamais touché :** la cible est l'abonnement de formule. Après l'échéance :
Premium + Cloud intact, même prix, aucun schedule.

**G. Témoin :** sans la métadonnée `plan_type` de la phase 2, un Pro passé au prix Premium **resterait Pro**.
`litAbonnementStripe` garde le `plan_type` pour un prix Premium. D'où la métadonnée de phase, vérifiée en A.

## Ce qui est dans `main` (inerte) et ce qui est dans le LOT (pas appliqué)
**Dans `main` (rien ne s'allume : interrupteur fermé, fonction absente) :**
- `supabase/functions/_shared/descente-formule.js` : les règles pures (`selftest:descente-formule`, 28/28).
- `src/reglages/BlocChangerFormule.jsx` et `formuleDescente.js` : l'écran. Branché dans `SousPageAbonnement.jsx`, il ne
  rend **rien** et n'envoie aucune requête tant que `coin_config.descente_formule_ouverte` ≠ 1. La clé est ajoutée à
  `config/interrupteurs.js` et lue avec les autres, dans la même requête.
- Migration `20261109020000_formule_prevue.sql` : **PAS appliquée**.
  - Colonnes `formule_prevue`, `formule_prevue_le` et `formule_prevue_canal`, avec une règle CHECK.
  - Jamais écrites par le client : relu en prod, les `UPDATE` de `profiles` sont par colonne.
  - Banc : `PREUVE_PG=embarque node scripts/essais/20261109020000_banc.mjs`, 14/14.
  - Inverse : `supabase/rollbacks/`.
- Les bancs et harnais : `scripts/stripe-test/descente-formule-test.mjs`, `scripts/apercu/c4-formule.*`,
  `capture-c4-formule.mjs`.

**Dans le LOT `docs/enquetes/c4-descente-0911/lot-c4-paiements.patch` :** il touche des chemins d'argent, donc il est
hors `main`. Le garde `selftest:paiements-non-regression` verrouille ces fonctions et c'est voulu.
- Nouvelle fonction `changer-formule` : `lire`, `programmer`, `annuler`. Elle touche Stripe seulement ; une formule
  prise en boutique renvoie `{ disponible: false }`.
- `stripe-webhook` : la descente prévue est lue chez Stripe, écrite **à part** des droits, jamais bloquante.
- `cancel-subscription` : release puis résiliation (E).
- `create-checkout-session` : refus de monter pendant une descente prévue (D).
- `git apply --check` passait sur l'arbre du 09/11 ~02:30.

## Les 3 points incertains (pourquoi pas en prod)
**1. iPhone (Apple).** Lu dans le code par un agent, avec les références `fichier:ligne` dans son rapport de session :
- **Aucun binaire neuf n'est nécessaire.**
- **Nos fonctions ne font JAMAIS tomber un palier.** `apple-iap-webhook` ignore `DID_CHANGE_RENEWAL_PREF / DOWNGRADE`.
  Au renouvellement (`DID_RENEW`), il pose `is_premium` mais n'écrit `is_pro` / `is_business` que pour un produit
  Pro / Business. `validate-apple-receipt` ne met les drapeaux qu'à vrai.
- **Conséquence :** une descente Pro → Premium prise dans l'App Store laisserait **Pro ouvert pour toujours**, au prix
  Premium.
- **Les niveaux du groupe « FillSell Plan » sont à vérifier dans App Store Connect.** Nos notes de relecture donnent
  `premium.standard` niveau 2 et `pro2.sub` niveau 2. Si Premium et Pro sont au **même** niveau, le passage est un
  changement IMMÉDIAT (crossgrade), pas « à la fin de la période ».

**2. Android (Google).**
- **Aucun binaire neuf n'est nécessaire :** le patch du plugin passe déjà `oldPurchaseToken` et `replacementMode`.
  DEFERRED = **6** dans Billing 8.3.0. ⚠️ L'énumération TypeScript du plugin dit 4, ce qui serait invalide.
- **Mais nos fonctions ne font jamais tomber un palier** (`google-play-webhook`, `validate-google-purchase`), et
  `linkedPurchaseToken` n'est pas lu.
- On ne sait pas, sans bac à sable, quand Google signale le nouveau jeton (achat ou bascule).

**3. Le portail Stripe (« Mes factures »).** S'il permet de résilier ou de changer de formule, il faut savoir ce qu'il
fait d'un abonnement tenu par un schedule. Non vérifié : sa configuration est un réglage Stripe, et rien chez Stripe ne
se touche sans ordre de Nico.

## Pour ouvrir (dans l'ordre, chaque pas sur feu vert de Nico)
1. Relire le lot. `git apply docs/enquetes/c4-descente-0911/lot-c4-paiements.patch`, puis mettre à jour les lignes
   permises de `selftest:paiements-non-regression` et relancer la suite.
2. Migration `20261109020000` : `npx supabase db query --linked -f …`, puis `migration repair … applied`.
3. Déployer : `changer-formule` (verify_jwt **true**), `stripe-webhook`, `cancel-subscription`,
   `create-checkout-session`. Versions et `verify_jwt` lus avant et après chacun.
4. Vérifier le portail Stripe face à un abonnement sous schedule (point 3).
5. Un essai réel sur le compte de Nico, puis ouvrir : `coin_config` `descente_formule_ouverte` = 1. Web seulement.
6. **iPhone et Android : un chantier à part.**
   - Faire tomber le palier au vrai produit renouvelé, après vérification des autres canaux (`droits-canaux.js`).
   - Enregistrer la descente prévue (Apple : `autoRenewProductId` de DOWNGRADE ; Google : `linkedPurchaseToken`).
   - Vérifier les niveaux App Store Connect.
   - Faire les essais en bac à sable sur un appareil.
