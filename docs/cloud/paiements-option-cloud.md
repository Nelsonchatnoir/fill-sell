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
| Stripe | ancien prix 3 j | `price_1UMufsQZRA77vrWJ1YVYLml0` | actif, **à archiver sur GO** |
| Apple | groupe / abonnement | « FillSell Cloud » (22440194) / `app.fillsell.cloud.sub` (6819067675) | prix en attente du clic de Nico, intro 1 semaine à poser ensuite |
| Google | produit / forfait | `app.fillsell.cloud.sub` / `cloud-monthly` (20 pays euro à 20,00 €) | actif |
| Google | offre | `cloud-trial-3d` — **porte 7 jours** depuis le 04/10 nuit | active |

⚠️ L'offre Google s'appelle `cloud-trial-3d` mais dure 7 jours : Google a laissé
modifier la durée, un identifiant ne se renomme jamais.

## Garde-fous tenus par la branche

- Colonnes propres à Cloud (`is_cloud`, `cloud_essai_*`, `cloud_canal`,
  `cloud_ref`, `cloud_fin_periode`, `cloud_annule_fin_periode`).
- `is_premium` / `is_pro` / `is_business` ne viennent jamais d'un abonnement
  Cloud, sur aucun canal ; une facture Cloud ne crédite aucun quota.
- Stripe : abonnement Cloud marqué `metadata.option = "cloud"` ; hors de
  `rangAbonnement` (rang -1), jamais cible d'une montée de palier, jamais repris
  ni annulé par une session de palier (et inversement).
- Un seul essai par compte côté Stripe (`essaiCloudPermis` : ligne profiles +
  historique Stripe du client). Apple et Google le garantissent eux-mêmes.
- Un événement d'un canal ne touche jamais un Cloud porté par un autre canal.

## Ce que fait chaque fonction

- `create-checkout-session` : `product: "cloud"` → Checkout d'abonnement Cloud
  seul, carte obligatoire, essai 7 j si permis ; refuse un second Cloud.
- `stripe-webhook` : session, facture et mise à jour Cloud relues chez Stripe,
  sorties AVANT les chemins de palier (qui posaient `is_premium` et créditaient).
- `cancel-subscription` : sans corps → le palier seul (jamais Cloud) ;
  `{ option: "cloud" }` → Cloud à l'échéance (fin d'essai : aucun débit).
- `apple-iap-webhook`, `validate-apple-receipt`, `google-play-webhook`,
  `validate-google-purchase` : produit Cloud reconnu, colonnes Cloud seulement.
- `cloud_droits(uuid)` / `cloud_droits_moi()` : état `aucun | essai | paye |
  essai_termine`, `actif` — indépendant du palier.

## Avant tout déploiement

1. Appliquer `20261004233000_option_cloud_paiements.sql` (`db query --linked -f`
   puis `migration repair`).
2. `STRIPE_PRICE_CLOUD=price_1UMuLDQZRA77vrWJZfZh2IS4`.
3. Déployer les 7 fonctions (webhooks en `--no-verify-jwt`).
4. Réaligner `cloudDuProfil` de la branche `conception/cloud-option`
   (`CLOUD_EXIGE_UN_PALIER` → false, essai 7 jours).
