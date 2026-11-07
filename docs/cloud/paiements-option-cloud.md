# Abonnement « FillSell Cloud » — paiements (modèle final du 04/10/2026, nuit)

Branche locale `feat/option-cloud-paiements` : **jamais poussée, jamais
déployée**, migration **non appliquée**.

## Modèle (décision finale de Nico)

- Cloud = **abonnement séparé**, 20,00 €/mois, **essai gratuit 7 jours**, carte
  obligatoire.
- **Ouvert à tous**, comptes Free compris : Cloud se prend seul. Le compte garde
  les quotas de son palier (Free : 5 annonces). Cumulable avec Premium / Pro /
  Business.
- Si le palier prend fin, le compte repasse en Free et **Cloud continue**.
- Aucun essai de palier, aucun produit combiné, aucun « démarrer maintenant ».
  Rien ne change sur les produits des paliers.

## Consoles

| Canal | Objet | Identifiant | État |
|---|---|---|---|
| Stripe | produit | `prod_VNfg9NASXvwpey` « FillSell Cloud » | actif |
| Stripe | prix par défaut | `price_1UMuLDQZRA77vrWJZfZh2IS4` 20,00 €/mois, essai 7 j | actif |
| Stripe | ancien prix 3 j | `price_1UMufsQZRA77vrWJ1YVYLml0` | **archivé** le 04/10 (aucun abonnement, lien ni session dessus) |
| Apple | groupe / abonnement | « FillSell Cloud » (22440194) / `app.fillsell.cloud.sub` (6819067675) | prix 20,00 € **confirmé** (175 pays, 25 pays euro à 20,00 €) ; offre d’intro gratuite 1 semaine remplie, **Confirmer à cliquer** ; rien soumis |
| Google | produit / forfait | `app.fillsell.cloud.sub` / `cloud-monthly` (20 pays euro à 20,00 €) | actif |
| Google | offre | `cloud-trial-3d` — **porte 7 jours** depuis le 04/10 nuit | active |

⚠️ L'offre Google s'appelle `cloud-trial-3d` mais dure 7 jours : Google a laissé
modifier la durée, un identifiant ne se renomme jamais.

## Garde-fous tenus par la branche

- Colonnes propres à Cloud, MÊMES NOMS que palier.js : `is_cloud`,
  `cloud_essai_debut`, `cloud_essai_fin`, `cloud_essai_arrete`,
  `cloud_periode_fin`, `cloud_arret_fin_periode` (+ `cloud_canal`, `cloud_ref`).
- `etatCloud` = `cloudDuProfil` (palier.js) : 0 écart sur 20 000 profils tirés
  au hasard. `cloud_etat(uuid, timestamptz)` = même corps dans la migration et
  dans la proposition de la branche conception.
- Arrêt pendant l’essai : IMMÉDIAT, rien facturé (Stripe : abonnement annulé
  sur-le-champ, y compris depuis le portail ; Apple / Google : renouvellement
  coupé pendant l’essai). Arrêt une fois payé : jusqu’à la fin de la période.
- `is_premium` / `is_pro` / `is_business` ne viennent jamais d'un abonnement
  Cloud, sur aucun canal ; une facture Cloud ne crédite aucun quota.
- Stripe : abonnement Cloud marqué `metadata.option = "cloud"` ; hors de
  `rangAbonnement` (rang -1), jamais cible d'une montée de palier, jamais repris
  ni annulé par une session de palier (et inversement).
- **Un seul essai par compte FillSell, tous canaux** : Apple et Google donnent
  leur semaine par compte de store sans rien savoir des autres canaux. Le
  serveur lit `cloud_essai_debut` : un essai déjà pris ailleurs → la semaine du
  store n’est PAS activée (Cloud ne tourne pas), Cloud démarre au premier
  paiement réel ; Stripe ouvre alors un Checkout sans essai. Rejeu du même essai
  (même canal, même référence) toujours accepté.
- **Les quatre verrous (05/10, socle `20261005120000`)** :
  - l'app appelle `cloud_essai_preparer_moi(appareil)` AVANT Stripe, l'App Store
    ou Google Play (`src/cloud/achatCloud.js`) : une PLACE est réservée (une IP
    dédiée, 30 min ; pool vide = refus, rien ne s'ouvre), et les verrous
    « compte », « appareil » et « comptes de plateforme » (Vinted déjà relevés)
    répondent ; un essai refusé est DIT, l'option se prend sans essai après
    confirmation ;
  - `create-checkout-session` exige une préparation fraîche (`cloud_essai_permis`
    → `fraiche`) et n'ouvre l'essai que si elle le permet ;
  - `stripe-webhook` pose le 4e verrou, **la carte** (`card.fingerprint` hachée) :
    déjà vue → essai annulé sur-le-champ, rien prélevé, `cloud_essai_refus` écrit ;
  - les webhooks et validations des stores lisent le verdict de la préparation
    (`_shared/cloud-essai-store.ts`) : un essai refusé n'est pas activé par la
    semaine offerte de la boutique (`essai_interdit`) ;
  - un compte de plateforme connecté depuis « Me connecter » et déjà vu sur
    l'essai d'un autre compte arrête l'essai (`cloud_essai_noter_compte_plateforme`).
- Un événement d'un canal ne touche jamais un Cloud porté par un autre canal.

## Ce que fait chaque fonction

- `create-checkout-session` : `product: "cloud"` → Checkout d'abonnement Cloud
  seul, carte obligatoire, essai 7 j si permis ; refuse un second Cloud.
- `stripe-webhook` : session, facture et mise à jour Cloud relues chez Stripe,
  sorties AVANT les chemins de palier (qui posaient `is_premium` et créditaient).
- `cancel-subscription` : sans corps → le palier seul (jamais Cloud) ;
  `{ option: "cloud" }` → en essai : arrêt IMMÉDIAT, rien facturé ; payé : fin de période ;
  `{ option: "cloud", reprendre: true }` → « Garder l'option » (arrêt prévu levé).
  ⛔ (07/11 soir, essai TestFlight de Nico) La version servie le 07/11 était la **v53 du 02/10**, d'AVANT ces
  lignes : elle ignore `option` (sans client Stripe : `is_premium=false` et `{ success: true }` ; avec : l'abonnement
  ACTIF en tête de liste mis en fin de période + accusé de résiliation de la formule). À redéployer depuis `main`
  (feu vert de Nico) avant qu'un Cloud Stripe s'arrête depuis l'app.
- (07/11 soir) **Arrêter / garder le Cloud depuis l'app : le CANAL décide, jamais l'appareil seul**
  (`src/cloud/achatCloud.js`, `voieArretCloud`) : `cloud_canal = 'apple'` → feuille d'abonnements d'Apple
  (`NativePurchases.manageSubscriptions`, repli `https://apps.apple.com/account/subscriptions`) ; vu hors iPhone/iPad →
  la phrase dit où (Réglages › ton nom › Abonnements) ; `'google'` → `https://play.google.com/store/account/
  subscriptions?sku=app.fillsell.cloud.sub&package=app.fillsell.app` ; `'stripe'` → `cancel-subscription` ; inconnu → le
  serveur décide. Une app n'annule jamais un abonnement Apple ou Google : notre état suit leurs webhooks. Aucun texte ne
  promet « tout de suite » ni « rien n'est facturé » avant la confirmation de la boutique. Une réponse sans
  `option: 'cloud'` n'est jamais prise pour un arrêt. Trace : `usage_logs` `cloud_arret_clic` / `cloud_arret_issue`
  (`cloud_reprise_*`). Selftests `cloud-achat` § 7, `cloud-ecrans` § 7c ter.
- `apple-iap-webhook`, `validate-apple-receipt`, `google-play-webhook`,
  `validate-google-purchase` : produit Cloud reconnu, colonnes Cloud seulement.
- `cloud_etat(uuid, timestamptz)` / `cloud_etat_moi()` : même état que
  `cloudDuProfil`, indépendant du palier.

## Résiliation et mails d'événement (08/11/2026, ordre de Nico — NON déployé : jour J, étape 1)

**Arrêter, par canal** (`src/cloud/achatCloud.js`, `BlocCloudReglages.jsx`) : Apple vu sur iPhone/iPad → « Arrêter le
Cloud » ouvre DIRECTEMENT la feuille Abonnements du système (`AppStore.showManageSubscriptions`, la seule qui montre
aussi un abonnement TestFlight) ; Google sur Android → la page d'abonnements du Play Store pour l'app (intention native),
puis le lien Play du produit Cloud ; Stripe → `cancel-subscription` (confirmation en deux temps). Rien ne s'ouvre → le
chemin exact reste à l'écran (« Réglages › ton nom › Abonnements › FillSell Cloud ») avec « Réessayer » — jamais un
repli silencieux vers une page web. « Arrêter » / « Garder » existent pour TOUT client Cloud vivant, même offre refermée
(`useCloudReglages`, `actionsCloud`). Après un arrêt Stripe, l'app dit « aucun prélèvement » seulement si la réponse
porte `aucun_prelevement: true` (abonnement annulé avant la fin de l'essai ET toutes ses factures à 0, relus chez Stripe).

**Règles d'arrêt** (`_shared/cloud-option.js`, `ecritureCloudStore`) :
- pendant l'essai (essai FillSell en cours) → arrêt IMMÉDIAT : `cloud_essai_arrete`, fin ramenée à maintenant → le
  déclencheur `profiles_cloud_pool` met l'IP au repos et éteint `cloud_voie` (tâches rendues à l'extension) dans la même
  transaction ; l'orchestrateur ferme le navigateur au tour suivant (60 s ; un job déjà en cours finit d'abord) ;
- payé → arrêt programmé (`cloud_arret_fin_periode`, `cloud_periode_fin`) ; coupure réelle à l'expiration (Apple
  EXPIRED, Google 13, Stripe `customer.subscription.deleted`) ; remboursement / révocation → coupure immédiate ;
- essai FillSell fini (grâce) mais la boutique encore dans sa période d'essai → arrêté (place et IP rendues) ;
- coupure reçue APRÈS le prélèvement → période payée ; le paiement reçu ensuite GARDE l'arrêt (`renouvellementAuto`) ;
- même coupure rejouée → rien d'écrit (`essai_deja_arrete`, `arret_deja_programme`) ;
- reprise (Apple AUTO_RENEW_ENABLED, Google 7 RESTARTED, Stripe « Garder le Cloud ») → arrêt levé, rien d'autre ; un essai
  déjà arrêté ne rouvre pas sans paiement réel (jamais un second essai gratuit ; Stripe : `essaiCloudPermis`).

**Mails** (`_shared/cloud-mails.js` textes et événements, `_shared/cloud-mails-envoi.ts` envoi, `mailCloud` mise en page) :
`essai_debut`, `paiement`, `arret_essai`, `arret_programme`, `impaye` (Apple / Google ; Stripe garde `paiement-echoue.js`),
plus la veille (`cloud-rappel-veille.js`). Type `cloud_<événement>`, catégorie `support`. UN mail par événement : clé
réservée dans `public.cloud_mails` (migration 20261108090000) avant l'envoi, libérée si l'envoi échoue. Prix : facture
Stripe (payée ou à venir, remise comprise), transaction / renouvellement signés d'Apple, prix récurrent Google — sinon
aucune somme. « Aucun prélèvement » seulement sur la confirmation de la boutique. Preuves : `selftest:cloud-resiliation-mails`
(80), `scripts/cloud/preuve-resiliation-mails.mjs` (Postgres jetable, vraies fonctions de prod, 24),
`scripts/stripe-test/resiliation-cloud-test.mjs` (mode test Stripe, 13), `selftest:paiements-non-regression` (seules les
lignes Cloud relues changent dans les 4 fonctions de paiement).

## Avant tout déploiement

La passe complète, dans l'ordre : `docs/cloud/mise-en-ligne.md` (migrations
`20261004233000` puis `20261005120000`, secret `STRIPE_PRICE_CLOUD`, fonctions par
`scripts/cloud/deployer-fonctions-cloud.mjs` qui garde chaque `verify_jwt`, drapeau).
Ce que Nico saisit chez Apple, Google et Stripe : `docs/cloud/fiche-boutiques.md`.
