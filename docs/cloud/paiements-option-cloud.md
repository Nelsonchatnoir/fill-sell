# Option « FillSell Cloud » — paiements (04/10/2026)

Branche locale `feat/option-cloud-paiements`, **jamais poussée, jamais déployée**.
Décision finale de Nico (04/10 soir) : palier payant + Cloud, carte obligatoire,
**essai 3 jours à 0 €** (Cloud tourne avec les quotas du gratuit), débit palier +
Cloud au jour 3 sauf résiliation ; Cloud jamais vendu seul ; si le palier tombe,
Cloud s'arrête.

## 1. Ce qui existe dans les consoles (04/10)

| Canal | Objet | Identifiant | État |
|---|---|---|---|
| Stripe | produit | `prod_VNfg9NASXvwpey` « FillSell Cloud » | actif |
| Stripe | prix 3 j (défaut) | `price_1UMufsQZRA77vrWJ1YVYLml0` 20,00 € /mois, essai 3 j | actif |
| Stripe | prix 7 j (ancien) | `price_1UMuLDQZRA77vrWJZfZh2IS4` 20,00 € /mois, essai 7 j | actif, **à archiver sur GO** |
| Apple | groupe | « FillSell Cloud » (22440194) | créé |
| Apple | abonnement | `app.fillsell.cloud.sub` (Apple ID 6819067675), 1 mois, 175 pays, nom FR « Cloud » | **sans prix ni offre d'intro**, non soumis |
| Google | produit | `app.fillsell.cloud.sub` « FillSell Cloud » | créé |
| Google | forfait | `cloud-monthly` mensuel, grâce 7 j, 20 pays euro à 20,00 € | **actif** |
| Google | offre | `cloud-trial-3d` essai gratuit 3 j, « n'ont jamais eu cet abonnement » | **active** |

Le code de l'app ne nomme aucun de ces identifiants : rien n'est achetable depuis l'app.

## 2. Le palier gratuit 3 jours SEULEMENT avec Cloud — étude (rien créé)

- **Stripe — fait par construction.** Un seul abonnement, deux articles (palier +
  Cloud), `trial_period_days: 3` au Checkout : l'essai porte sur l'abonnement
  entier. Un palier seul n'a jamais d'essai. Abonnés actuels : aucun effet.
  « Un seul essai par compte » : garde serveur (`essaiCloudPermis`), Stripe ne la
  garantit pas.
- **Apple — produits combinés dans le groupe « FillSell Cloud ».** Une offre
  d'introduction s'attache à un produit, sans condition : on ne peut pas rendre le
  produit Premium gratuit « seulement si Cloud ». Les offres promotionnelles et
  les codes d'offre ne visent pas un nouvel abonné de façon fiable. Recommandé :
  `app.fillsell.premium_cloud.sub`, `app.fillsell.pro_cloud.sub`,
  `app.fillsell.business_cloud.sub` (niveaux décroissants Business > Pro >
  Premium), chacun avec une intro gratuite 3 jours. Apple garantit une intro par
  identifiant Apple et par groupe : un seul essai, quel que soit le combiné.
  Abonnés actuels (groupe « FillSell Plan ») : aucun effet ; personne n'a encore
  consommé d'intro dans ce groupe neuf. ⚠️ Un abonné Premium du groupe
  « FillSell Plan » qui prend un combiné paie deux paliers : l'app doit lui
  proposer `app.fillsell.cloud.sub` à la place.
- **Google — offres « choix du développeur » sur les forfaits de palier.**
  Une offre `premium-cloud-trial-3d` (et pro-, business-) sur chaque forfait de
  palier existant, essai 3 jours, éligibilité décidée par l'app : elle n'est
  proposée que dans le parcours palier + Cloud. Google ne vérifie alors aucun
  historique : la garde « un seul essai » est la nôtre. Abonnés actuels : leur
  prix ne bouge pas, une offre ne s'applique qu'à un nouvel achat. Le paiement
  se fait en deux achats successifs (palier, puis Cloud) : le plugin
  `@capgo/native-purchases` ne sait pas faire l'achat groupé « add-ons ».

## 3. « Démarrer mon abonnement maintenant » pendant l'essai — ce qui marche

| | Arrêter l'essai, débit immédiat | Monter de palier | Descendre de palier |
|---|---|---|---|
| **Stripe** | ✅ `trial_end: "now"` (facture immédiate des deux articles) | ✅ immédiat, même appel | ✅ immédiat, même appel (c'est nous qui décidons) |
| **Apple** | ❌ impossible sur le même produit (aucune API) | ✅ immédiat, débit tout de suite, l'essai s'arrête | ❌ seulement à l'échéance (fin de l'essai) |
| **Google** | ⚠️ seulement en changeant de forfait/offre (remplacement `CHARGE_FULL_PRICE`) ; garder le même palier « maintenant » : non prouvé | ✅ immédiat (`CHARGE_FULL_PRICE`) | ✅ immédiat avec `CHARGE_FULL_PRICE` (à éprouver en test interne) |

Conséquence pour l'écran : « Démarrer maintenant » n'existe que sur le web
(Stripe). Sur iPhone, seul « Passer à Pro / Business maintenant » est vrai. Sur
Android, « Changer de palier maintenant » ; l'option Cloud, abonnement à part,
garde son essai jusqu'au jour 3. ⚠️ Le patch actuel du plugin passe
`replacementMode = 2` (CHARGE_PRORATED_PRICE, montée seule) : `CHARGE_FULL_PRICE`
(5) demandera une ligne dans `src/lib/iap.js`.

## 4. Coût d'un essai de 3 jours — estimation chiffrée

Sources : prix public Steel (offre Launch, 0,10 $/h de navigateur), commande
IPRoyal #83578416 (5,40 $ / 30 j / IP), sessions du prototype (connexion 588 s,
publication 242 s, republication LBC 9 min ; 10-19 Mo de proxy par session),
charge base mesurée le 04/10 (0,1-0,25 % CPU par poste allumé). **Non mesuré en
réel** : aucun essai complet n'a tourné (test en attente du feu vert de Nico).

| Poste | Navigateur ouvert en continu | Ouvert le temps des actions (≈ 1 h/jour) |
|---|---|---|
| Steel (72 h vs 3 h) | 7,20 $ | 0,30 $ |
| IP dédiée dès l'essai (3 j + quarantaine 14 j) | 3,06 $ | 3,06 $ |
| IP d'essai partagée, dédiée seulement au paiement | ≈ 0,54 $ | ≈ 0,54 $ |
| Base | négligeable | négligeable |
| **Total d'un essai non converti** | **≈ 10,30 $ (≈ 8,8 €)** | **≈ 0,85 $ à 3,40 $ (≈ 0,75 € à 2,9 €)** |

Recommandé pour le garder bas :
- navigateur **ouvert à la demande** pendant l'essai (un job arrive, on ouvre, on
  ferme ; relevés regroupés deux fois par jour) — les quotas du gratuit bornent
  déjà le travail ;
- **IP d'essai prise dans un petit pool partagé** (une IP sert un essai à la
  fois, quarantaine courte), **IP dédiée attribuée au paiement** ;
- plafond d'essais simultanés (déjà prévu dans la conception du pool).

## 5. Si le palier prend fin

- **Stripe** : l'option est un article de l'abonnement du palier — elle tombe
  avec lui. Un abonnement qui porterait Cloud sans palier (édition manuelle) est
  résilié par `stripe-webhook`.
- **Apple / Google** : on ne peut pas résilier à la place de la personne. L'état
  devient `suspendu` (`cloud_droits` / `etatCloud`) : `actif = false`, le
  navigateur Cloud ne doit plus tourner. L'app affiche
  `avertissementCloudSuspendu(canal)` : reprendre un palier, ou résilier l'option
  dans la boutique pour ne pas être débité. Rien n'est affiché aujourd'hui (aucun
  changement visible).

## 6. Ce que fait la branche

- `supabase/functions/_shared/cloud-option.js` : règles pures (état, essai unique,
  lecture Stripe / Apple / Google, écriture par canal) ;
  `scripts/option-cloud-selftest.mjs` (`npm run selftest:option-cloud`).
- `stripe-webhook` : drapeaux relus chez Stripe (essai = quotas du gratuit, aucun
  grant avant le débit), fin d'essai, Cloud sans palier résilié.
- `create-checkout-session` : `avec_cloud: true` (palier + Cloud, carte, essai
  3 j si permis) ; `product: "cloud"` (option ajoutée à un palier existant, payée
  tout de suite) ; refus `cloud_requiert_palier` / `deja_abonne` ; la montée de
  palier ne touche que l'article du palier (`itemPalier`) ; une session « avec
  Cloud » n'est jamais reprise pour une demande sans Cloud.
- `cancel-subscription` : `{ option: "cloud" }` retire l'option seule ; l'essai
  (`trialing`) est résiliable.
- `apple-iap-webhook`, `validate-apple-receipt`, `google-play-webhook`,
  `validate-google-purchase` : produit Cloud reconnu, colonnes propres à Cloud,
  garde « autre canal / référence remplacée ».
- Migration `20261004233000_option_cloud_paiements.sql` (NON appliquée) :
  colonnes `is_cloud`, `cloud_essai_*`, `cloud_canal`, `cloud_ref`,
  `cloud_fin_periode`, `cloud_annule_fin_periode` ; `cloud_droits(uuid)`,
  `cloud_droits_moi()`.

Avant tout déploiement : appliquer la migration, poser le secret
`STRIPE_PRICE_CLOUD=price_1UMufsQZRA77vrWJ1YVYLml0`, déployer
`stripe-webhook` / `apple-iap-webhook` / `google-play-webhook` en
`--no-verify-jwt`, réaligner `cloudDuProfil` de la branche
`conception/cloud-option` (l'essai y est suspendu sans palier ; ici il prime).
