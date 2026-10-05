# FillSell Cloud — la fiche à saisir par Nico (Apple, Google, Stripe)

Claude n'y touche pas. Chaque valeur ci-dessous est celle que le CODE attend
(relu le 05/10 dans `_shared/cloud-option.js`, les webhooks et `src/cloud/achatCloud.js`).
Prix : **20,00 € TTC partout**.

## 1. Apple — App Store Connect (app FillSell, `app.fillsell.app`)

**Où** : Apps › FillSell › Monétisation › Abonnements › groupe **« FillSell Cloud »**
(ID 22440194) › abonnement **« FillSell Cloud »**.

| Champ | Valeur | Pourquoi (code) |
|---|---|---|
| ID produit | `app.fillsell.cloud.sub` (Apple ID 6819067675) — **ne pas changer** | `PRODUIT_CLOUD_APPLE`, `achatCloud.PRODUIT_CLOUD` |
| Durée | 1 mois | renouvellement mensuel |
| Prix | 20,00 € France ; 175 pays — **déjà confirmé le 04/10** | `CLOUD_PRIX_AFFICHE` |
| **Offre d'introduction** (à confirmer) | Prix de l'abonnement › « Configurer une offre d'introduction » : **Pays : tous (175)** · **Début : aujourd'hui** · **Fin : aucune** · **Type : Gratuit** · **Durée : 1 semaine** → **Confirmer** | le webhook reconnaît l'essai à `offerType = 1` + `FREE_TRIAL` (`lectureCloudApple`) |
| Localisation FR — Nom d'affichage (30 car.) | `Sans ordinateur` | le libellé de l'app |
| Localisation FR — Description (45 car.) | `Tes annonces publiées même PC éteint` | |
| Localisation EN — Display name | `No computer` | |
| Localisation EN — Description | `Your listings posted, computer off` | |
| Informations de vérification | capture de l'écran d'achat (feuille des formules, interrupteur « Sans ordinateur ») + note : « Abonnement séparé des formules ; essai 7 jours ; s'arrête dans Réglages › Abonnement » | |

**Notifications serveur (App Store Server Notifications V2)** : rien à changer —
l'URL de production de l'app est déjà
`https://tojihnuawsoohlolangc.supabase.co/functions/v1/apple-iap-webhook`
(à VÉRIFIER, pas à modifier : App Store Connect › FillSell › Informations sur l'app).

**Soumission** : le premier abonnement d'un nouveau groupe part **avec une version
de l'app** (page de la version › section « Achats intégrés et abonnements » ›
cocher « FillSell Cloud »). Il faut donc un nouveau build iOS (Codemagic) ET un
compte de démonstration pour le relecteur : **donner à Claude l'identifiant de ce
compte** → il va dans `CLOUD_OFFRE_TEMOINS` (l'offre lui est visible, à lui seul).

## 2. Google — Play Console (app `app.fillsell.app`)

**Où** : Monétiser › Produits › Abonnements › **`app.fillsell.cloud.sub`**.

| Élément | Valeur | Pourquoi (code) |
|---|---|---|
| ID produit | `app.fillsell.cloud.sub` — existe | `PRODUIT_CLOUD_GOOGLE` |
| Forfait de base | `cloud-monthly` · renouvellement automatique · 1 mois · 20,00 € dans les pays euro — **actif** | `FORFAIT_CLOUD_GOOGLE` |
| Offre | `cloud-trial-3d` (l'identifiant garde « 3d », il ne se renomme pas) · **Essai gratuit 7 jours** · **Éligibilité : « Acquisition de nouveaux clients » → « N'a jamais eu cet abonnement »** · **active** | le webhook reconnaît l'essai à `offerId = cloud-trial-3d` + notification 4 (achat) |
| Délai de grâce / suspension | laisser les valeurs par défaut | un paiement en échec garde l'option jusqu'au verdict de Google |
| Notifications en temps réel (RTDN) | Monétiser › Configuration de la monétisation : le sujet Pub/Sub **déjà réglé** pour l'app (le même que les formules) — à vérifier, pas à changer | `google-play-webhook` |

⚠️ Le greffon d'achat Android choisit la première offre du forfait : on ne peut
pas imposer « sans essai » depuis l'app sans nouveau binaire. Côté serveur, une
semaine offerte par Google à un essai refusé par nos verrous **n'est pas activée**
(Cloud démarre au premier paiement), et l'écran le dit avant l'achat.

## 3. Stripe — Dashboard (compte FillSell, mode réel)

| Élément | Valeur | État |
|---|---|---|
| Produit | `prod_VNfg9NASXvwpey` « FillSell Cloud » | actif — rien à faire |
| Prix | `price_1UMuLDQZRA77vrWJZfZh2IS4` · 20,00 EUR / mois · essai 7 j sur le prix | actif — rien à faire (notre Checkout passe l'essai lui-même ; le prix seul ne l'applique jamais) |
| Ancien prix 3 j | `price_1UMufsQZRA77vrWJ1YVYLml0` | archivé le 04/10 — rien à faire |
| Webhook (endpoint de `stripe-webhook`) | événements : `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_action_required` | **vérifier** qu'ils sont tous cochés (ce sont ceux des formules) |
| Portail client (Paramètres › Facturation › Portail client) | « Changer d'offre » : **ne PAS proposer « FillSell Cloud » comme cible** d'un passage de formule (ni l'inverse) ; « Annuler l'abonnement » : autorisé, **à la fin de la période** | un arrêt demandé pendant l'essai est rendu immédiat par le webhook |
| Reçus (Paramètres › E-mails clients › Paiements réussis) | **activés** (comme pour les formules) | les reçus du Cloud partent par Stripe |
| Rappels de fin d'essai Stripe (Paramètres › Facturation › Abonnements et e-mails) | **coupés** (proposition) : notre mail de la veille part déjà (`cloud_essai_veille`) — deux rappels pour un essai de 7 jours, c'est un de trop | décision de Nico |

Le secret `STRIPE_PRICE_CLOUD=price_1UMuLDQZRA77vrWJZfZh2IS4` est posé par Claude
à la mise en ligne (`docs/cloud/mise-en-ligne.md`, étape 3).
