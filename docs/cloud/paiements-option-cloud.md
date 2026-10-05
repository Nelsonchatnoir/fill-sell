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
- Les 4 verrous de la branche conception (compte, appareil, carte, comptes de
  plateforme, `cloud_essai_ouvrir`) ne voient que l’ouverture côté FillSell ; un
  achat dans l’App Store ou Google Play ne les traverse pas. Le verrou « compte »
  est donc REPRIS dans les webhooks Apple et Google (`verdictEssaiStore`) ; les
  verrous appareil et comptes de plateforme restent à appeler par l’app AVANT
  d’ouvrir la feuille d’achat du store (`cloud_essai_preparer_moi`).
- Un événement d'un canal ne touche jamais un Cloud porté par un autre canal.

## Ce que fait chaque fonction

- `create-checkout-session` : `product: "cloud"` → Checkout d'abonnement Cloud
  seul, carte obligatoire, essai 7 j si permis ; refuse un second Cloud.
- `stripe-webhook` : session, facture et mise à jour Cloud relues chez Stripe,
  sorties AVANT les chemins de palier (qui posaient `is_premium` et créditaient).
- `cancel-subscription` : sans corps → le palier seul (jamais Cloud) ;
  `{ option: "cloud" }` → en essai : arrêt IMMÉDIAT, rien facturé ; payé : fin de période.
- `apple-iap-webhook`, `validate-apple-receipt`, `google-play-webhook`,
  `validate-google-purchase` : produit Cloud reconnu, colonnes Cloud seulement.
- `cloud_etat(uuid, timestamptz)` / `cloud_etat_moi()` : même état que
  `cloudDuProfil`, indépendant du palier.

## Avant tout déploiement

1. Appliquer `20261004233000_option_cloud_paiements.sql` (`db query --linked -f`
   puis `migration repair`).
2. `STRIPE_PRICE_CLOUD=price_1UMuLDQZRA77vrWJZfZh2IS4`.
3. Déployer les 7 fonctions (webhooks en `--no-verify-jwt`).
4. La branche `conception/cloud-option` est déjà à `CLOUD_EXIGE_UN_PALIER = false`
   et 7 jours (palier.js) ; sa proposition SQL porte le même `cloud_etat`.
