# Audit — Bordereaux d'envoi, favoris, messages et offres (24/09/2026)

> **Statut : audit seul.** Aucune ligne de code, aucune migration, aucun
> déploiement, aucun paquet d'extension. La mise en place attend le GO de Nico.
>
> Plateformes : Vinted, Leboncoin, eBay, Beebs, Opla — et Stoolz (API à venir).

---

## 0. L'essentiel

1. **Les bordereaux sont à portée de main sur Vinted et Leboncoin**, dans la
   session du vendeur, par les mêmes appels que leurs pages : commande,
   transporteur, QR ou PDF, n° de suivi. Prouvé sur de vraies ventes
   (terminées) de Nico pour la commande et le suivi, et dans le code des
   sites pour le fichier du bordereau. **Aucune vente en cours n'existait**
   sur aucun compte : l'étape « bordereau prêt » reste à voir en vrai (§ 9).
2. **eBay : pas d'achat de bordereau par API en France** (API réservée aux
   États-Unis) ; les bordereaux eBay s'achètent dans eBay, payés par le
   vendeur. En revanche **commandes et suivi arrivent déjà par l'API reliée**,
   sans nouveau consentement.
3. **Opla crée l'étiquette seul** (QR Mondial Relay, 5 jours) ; **Beebs la fait
   générer par le vendeur, et générer = accepter la commande et débiter
   l'acheteur**. Ni l'un ni l'autre n'a pu être vu en vrai (Opla déconnecté,
   0 vente Beebs).
4. **Après une vente, FillSell ne garde aujourd'hui RIEN** : ni transporteur,
   ni suivi, ni bordereau, ni acheteur — et le relevé des ventes jette
   justement les ventes en cours. C'est voulu : une règle écrite (code,
   conditions publiques, dossier eBay) interdit toute donnée d'acheteur. **Le
   cockpit exige de la rouvrir : c'est la première décision.**
5. **Savoir qui a mis en favori** : oui chez Opla (sauf anonymes) et Beebs
   (dans l'app) ; au fil de l'eau chez Vinted (une notification par favori,
   effacée après 7 jours) et Leboncoin (seulement ceux qui choisissent de
   prévenir) ; **jamais chez eBay** (un nombre, pas de nom).
6. **Offre aux intéressés, native** : eBay (par API, anonyme — **vérifié :
   EBAY_FR accepté, 5 annonces éligibles chez Nico, accès déjà consenti**),
   Opla (aux favoris qui acceptent d'être recontactés), Leboncoin (aux favoris
   qui préviennent, une par une), Beebs (groupée, mais dans l'app), Vinted
   (une par une ; **aucune offre groupée**). Sur Vinted, **baisser le prix
   prévient déjà tous les favoris**, sans message.
7. **Le risque est dans l'envoi, pas dans la lecture.** Lire une commande,
   c'est ce que fait la page. Envoyer en série, c'est ce que les conditions de
   Vinted (« 5 utilisateurs ou plus »), Leboncoin (messages répétitifs), eBay
   (communications non sollicitées) et Opla (outils automatisés) visent — et
   Vinted mène depuis juillet une vague de restrictions « activité
   automatisée ».
8. **Recommandation** : lot 1 « À expédier » en lecture (Vinted, Leboncoin,
   eBay), puis bordereau en un clic, puis suivi ; en parallèle, l'offre eBay
   aux intéressés (serveur, native, la moins risquée) ; les offres à une
   personne ensuite, **toujours validées, plafonnées en base, journalisées** ;
   générer les bordereaux en dernier ; jamais d'envoi en série automatique.
9. Rien à ajouter au manifest de l'extension : tous les appels relevés sont
   déjà couverts par ses hôtes.
10. **Stoolz** n'a aucune API publique aujourd'hui ; le modèle proposé
    (§ 5) l'accueille par un connecteur et un webhook, sans écran nouveau.

---

## 1. Méthode, comptes observés, niveaux de preuve

### 1.1 Ce qui a été fait

- Observation **dans le Chrome de Nico, sur ses propres comptes**, pages et
  appels **en lecture seulement** (GET) pour Vinted, Leboncoin, Beebs et
  Opla. Aucun POST, PUT, PATCH ou DELETE n'a été envoyé à ces plateformes.
- **eBay, par l'API, sur le compte relié de Nico, avec son accord explicite
  donné pendant l'audit** : renouvellement de son seul jeton (l'action de
  mesure `mesure_categories` du worker eBay, lancée sur un article
  inexistant pour qu'elle ne fasse rien d'autre) puis quatre lectures :
  `find_eligible_items`, `getOrders`, liste des sujets de notification,
  `GetMyeBaySelling` (un appel de lecture de la Trading API, qui ne connaît
  que la méthode POST). Le jeton n'a jamais été affiché ; les réponses brutes
  ont été effacées après lecture.
- Lecture du **code client que les sites servent eux-mêmes** (leurs fichiers
  JavaScript publics) pour relever les appels qu'ils font — méthode, adresse,
  champs — **sans les déclencher**.
- Audit du code FillSell (extension, fonctions edge, migrations, app).
- Recherche documentaire : documentation officielle (eBay développeurs,
  centres d'aide) et sources tierces, chacune étiquetée.

### 1.2 Ce qui n'a PAS été fait (garde-fous de l'audit)

- Aucun message, aucune offre, à personne.
- Aucun bordereau généré, acheté ou confirmé. Le seul fichier d'étiquette
  demandé l'a été sur une vente Leboncoin **terminée depuis six mois** (réponse
  404, rien reçu).
- Aucune connexion à un compte (Opla était déconnecté : il est resté
  déconnecté).
- Aucune bannière de consentement acceptée (la fenêtre « messagerie
  intelligente » de Leboncoin a été laissée ouverte, sans clic).
- Aucune activation de service (le « Hub vendeur » eBay n'est pas activé sur
  le compte ouvert dans Chrome ; il n'a pas été activé).
- Aucune donnée d'utilisateur FillSell lue ou touchée, hors le compte de Nico.
  La lecture en base de son jeton eBay a d'abord été **refusée par le
  garde-fou du mode automatique** ; elle n'a pas été contournée, et n'a été
  faite qu'après l'accord explicite de Nico.
- Seuls effets de bord connus : une conversation Vinted d'une vente terminée
  a été ouverte à l'écran (elle a pu être marquée comme lue) ; des menus ont
  été ouverts puis refermés sans choix.
- Aucun nom, pseudo ou adresse d'acheteur n'est recopié dans ce rapport.

### 1.3 Comptes observés

| Plateforme | Session | Ce qu'il y avait à voir |
|---|---|---|
| Vinted | connecté | 218 ventes passées (finalisées, remboursées), **0 en cours** ; 12 annonces actives, dont une à 2 favoris |
| Leboncoin | connecté (particulier) | 10 ventes passées (terminées, annulées), **0 en cours** ; 9 annonces en ligne ; conversations d'acheteurs intéressés |
| eBay — session Chrome | connecté | 0 commande sur 90 jours ; 6 annonces actives, **0 personne qui suit** |
| eBay — compte relié par l'API | jeton renouvelé (accord de Nico) | 0 commande ; 20 annonces actives, dont 3 suivies ; **5 annonces éligibles** à l'offre aux intéressés |
| Beebs | connecté | **0 vente** |
| Opla | **déconnecté** | rien de lisible en session ; code client seulement |

⚠️ Conséquence directe : **aucune vente « à expédier » n'existait sur aucun
compte**. L'étape « bordereau prêt à imprimer » n'a donc pu être observée en
direct nulle part ; elle est établie par le code client des sites (Vinted,
Leboncoin, Opla) et par la documentation (eBay). Le § 9 décrit exactement ce
qu'il faudrait pour la prouver.

### 1.4 Niveaux de preuve (utilisés partout)

| Code | Signification |
|---|---|
| **OBS-R** | Réponse **observée** : appel de lecture fait sur un compte de Nico (session du navigateur, ou API eBay reliée), réponse lue |
| **OBS-É** | **Écran** observé dans la session de Nico |
| **OBS-C** | **Code client** observé : l'appel (méthode, adresse, champs) est écrit dans le JavaScript que le site sert ; il n'a pas été déclenché |
| **DOC** | Documentation **officielle** de la plateforme (lien donné) |
| **TIERS** | Source tierce (presse, forum, outil, dépôt GitHub) |
| **DÉDUIT** | Raisonnement, sans preuve directe |

---

## 2. Le tableau plateforme × fonction (livrable 1)

**Comment lire une case** : verdict · voie · preuve · risque.

- Verdict : ✅ faisable · 🟡 partiel · ❌ impossible · ⏳ à venir
- Voie : **EXT** = extension, dans la session du vendeur · **API** = API
  officielle · **—** = aucune
- Preuve : voir § 1.4 (OBS-R, OBS-É, OBS-C, DOC, TIERS, DÉDUIT)
- Risque pour le compte : **R0** nul (identique à ce que fait la page) ·
  **R1** faible · **R2** moyen · **R3** élevé

| | Bordereau | Suivi | Liste des favoris | Offre aux favoris | Message aux favoris | Messagerie |
|---|---|---|---|---|---|---|
| **Vinted** | ✅ lire · EXT · OBS-C + DOC (+ OBS-R pour la commande) · R1 — générer : étape à prouver | ✅ · EXT · OBS-R · R0 | 🟡 une par une, par les notifications (7 j max) · EXT · OBS-C + DOC · R1 | 🟡 une par une, native ; groupée ❌ · EXT · DOC + OBS-C/OBS-R · **R2 unitaire, R3 en série** | 🟡 même chemin · EXT · DOC + OBS-C · **R3 en série** (CGU : ≥ 5 destinataires interdit) | ✅ · EXT · OBS-R + OBS-C · R1 lire, R2 répondre |
| **Leboncoin** | ✅ lire · EXT · OBS-R + DOC · R1 — générer : confirmer la dispo / Colissimo = engage | ✅ · EXT · OBS-R · R0 | 🟡 ceux qui ont choisi de prévenir · EXT · DOC + OBS-É · R1 | ✅ une par une, native · EXT · DOC + OBS-R + OBS-C · **R2 unitaire, R3 en série** | 🟡 dans la conversation « s'intéresse » ; message aux abonnés natif (boutique pro, quota 1) · EXT · OBS-R · R2 | ✅ · EXT · OBS-C + OBS-É · R1 lire, R2 répondre |
| **eBay** | 🟡 achat par API ❌ (US seulement) ; lien vers la page eBay · — · DOC + OBS-É · R0 | ✅ · API (déjà consentie) · OBS-R + DOC · R0 | ❌ identité ; nombre ✅ (API) · API · OBS-R + DOC · R0 | ✅ native, anonyme · API (déjà consentie) · **OBS-R** + DOC · **R1** | ❌ (seulement le mot joint à l'offre) · — · DOC | 🟡 API existe, accès « messagerie » non demandé (et exclu par nos conditions) · API · DOC + OBS-R · R1 + décision |
| **Beebs** | 🟡 non observé ; **générer = accepter la commande** · EXT · DOC + OBS-C · R2 | 🟡 · EXT · DOC · R1 | ✅ dans l'app ; web non trouvé · — · DOC + OBS-C · R1 | ✅ dans l'app, **y compris groupée** ; web ❌ · — · DOC + OBS-C · R2 | ❌ (offre seulement) · — · DOC | 🟡 · EXT · OBS-C · R1 |
| **Opla** | 🟡 non observé (déconnecté, 0 vente) · EXT · DOC + OBS-C · R1 | 🟡 · EXT · OBS-C · R1 | ✅ (sauf anonymes) · EXT · OBS-C + DOC · R1 | ✅ une par une, native, **aux personnes qui l'acceptent** · EXT · OBS-C + DOC · R1-R2 | 🟡 par la conversation · EXT · OBS-C · R2 | ✅ · EXT · OBS-C · R1 |
| **Stoolz** | ⏳ API promise · API · — | ⏳ · API · — | ⏳ · API · — | ⏳ · API · — | ⏳ · API · — | ⏳ · API · — |

Trois lectures du tableau :
1. **Les bordereaux sont lisibles partout où il y a une session**, et nulle
   part on n'est obligé de les générer nous-mêmes pour les montrer : Vinted
   et Opla les créent seuls, Leboncoin après la confirmation du vendeur,
   eBay seulement si le vendeur l'achète dans eBay. **Générer** est un autre
   sujet, qui engage le vendeur (Beebs : accepter la commande).
2. **« Qui a mis en favori » n'existe vraiment qu'à Opla (web) et Beebs
   (app)**. Vinted et Leboncoin le disent au fil de l'eau, une notification à
   la fois ; eBay jamais.
3. **L'offre aux intéressés la plus sûre est celle d'eBay** : native, par API,
   déjà consentie, encadrée par eBay. La plus risquée est celle de Vinted en
   série.

---

## 3. Détail par plateforme

### 3.1 Vinted

#### A. Bordereaux et suivi

**Où vit une commande.** Une vente Vinted = une **conversation** (page
`/inbox/<id>`) qui porte une **transaction**, qui porte un **envoi**
(`shipment`). Il n'y a pas de page « commande » séparée : `/my_orders` liste,
la conversation détaille.

**Ce qui a été observé sur le compte de Nico (OBS-R) :**

| Appel (GET, session vendeur) | Ce qu'il rend |
|---|---|
| `/api/v2/my_orders?type=sold&status=all&per_page=20&page=1` | la liste des ventes : `conversation_id`, `transaction_id`, `title`, `price{amount,currency_code}`, `status` (phrase française), `date`, `photo_url`, `transaction_user_status` (`completed`, `failed`…). 218 ventes, 11 pages. |
| `/api/v2/my_orders?type=sold&status=in_progress…` | accepté (200) ; **0 vente en cours** chez Nico. Les valeurs du filtre sont `all`, `in_progress`, `completed`, `cancelled` (OBS-C). |
| `/api/v2/conversations/<id>` | la conversation, ses messages (types `offer_request_message`, `status_message`, `message`, `action_message`) et la transaction : `status` (450 = finalisée), `shipment_id`, `shipment_status` (400 = livrée), `package_size_code`, `available_actions`, `current_user_side` (`seller`), `is_bundle`, `item_ids`, `offer_price`… |
| `/api/v2/transactions/<id>` | la transaction détaillée, dont `shipment{id,status,status_updated_at,status_title}` (« Commande livrée ! ») |
| `/api/v2/transactions/<id>/shipping_instructions` | le **transporteur** : `carrier.name` = « Shop2Shop by Chronopost » sur la vente observée |
| `/api/v2/shipments/<id>` | `delivery_type` (2 sur la vente observée) |
| `/api/v2/transactions/<id>/shipment/journey_summary` | le **suivi** : `details[]`, `actions[]`, `carriers[]`, `estimated_detail`, `current_carrier` — **vide** sur une vente livrée il y a 4 mois |

**Ce que le site sait faire, relevé dans son code (OBS-C, rien déclenché) :**

| Geste | Appel | Engage quelque chose ? |
|---|---|---|
| options d'étiquette | `GET shipments/<id>/label_options` | non |
| **commander l'étiquette** | `PUT transactions/<id>/shipment/order` avec `seller_address_id`, `pick_up_date`, `drop_off_type`, `reusable_package_selected`, `label_type` | **OUI — c'est le geste qui engage, quand il existe** (voir l'écart plus bas) : choix du mode de dépôt (point relais, enlèvement…), de la date d'enlèvement et du type d'étiquette (papier ou numérique) |
| lien de l'étiquette | `GET shipments/<id>/label_url` → `{label_url}` | non |
| étiquette PDF | `GET transactions/<id>/shipment/pdf_label` → `{file:{label (base64), filename}}` | non |
| étiquette numérique (QR) | `GET transactions/<id>/shipment/digital_label` | non |
| code de dépôt | `GET transactions/<id>/shipment/parcel_collection_code` (+ `_pdf`) | non |
| points de dépôt proches | `GET shipments/<id>/nearby_drop_off_points` (lat., long., type d'étiquette) | non |
| dates d'enlèvement | `GET shipments/<id>/collection_dates` | non |
| marquer « expédié » | `PUT transactions/<id>/shipment/mark_as_shipped` | oui (déclaration) |
| suivi détaillé | `GET escrow-order-fulfilment/app/v1/escrow_orders/<id>/shipment_journey` | non |
| actions sur la commande | `…/escrow_orders/<id>/actions` : `cancel`, `extend_shipping_deadline`, `change_delivery_option`, `mark_as_shipped` ; changement de transporteur (`carrier_change_request`, `available_rates`) ; annulation d'envoi (`shipment_cancellation` accept/decline) | oui |

Les noms d'étapes que le site mesure confirment le parcours :
`get_shipping_label`, `select_label_type`, `generate_label_screen…`,
`download_shipping_label`, `download_digital_label`, `ready_to_be_shipped`
(OBS-C).

**Ce que dit l'aide Vinted (DOC) :**
- « Une fois ton article vendu, nous envoyons un **bordereau d'envoi prépayé**
  généré par Vinted à ton adresse e-mail et dans ta messagerie Vinted »
  ([aide 753](https://www.vinted.fr/help/753)). L'**acheteur** choisit et paie
  le transport ; transporteur, type de bordereau (imprimable ou numérique),
  adresse et taille du colis **ne se modifient plus** après la vente
  ([aide 482](https://www.vinted.fr/help/482-comment-envoyer-l-article)).
- Transporteurs France : Mondial Relay, Chronopost, Colissimo, Vinted Go, DHL
  Express ([aide 234](https://www.vinted.fr/help/234)) ; Relais Colis n'y est
  plus (TIERS, fin 2025).
- **5 jours ouvrés** pour envoyer, sinon annulation automatique ; prolongation
  de 3 ou 5 jours ouvrés **si l'acheteur accepte**
  ([aide 740](https://www.vinted.fr/help/740)) — c'est l'action
  `extend_shipping_deadline` du code.
- Causes d'annulation automatique : le vendeur **n'ouvre pas les instructions
  d'envoi ou ne télécharge pas le bordereau** sous 5 jours ouvrés ; il ne
  confirme pas l'envoi (envoi personnalisé) ; ou le colis ne donne aucun signe
  de vie 4 jours ouvrés après usage du bordereau
  ([aide 665](https://www.vinted.fr/help/665-pourquoi-la-transaction-a-t-elle-ete-annulee)).
  ⇒ **Vinted mesure l'ouverture du bordereau.** Si FillSell va le chercher,
  Vinted le comptera comme ouvert — c'est plutôt souhaitable, mais c'est un
  signal envoyé en notre nom.
- Un bordereau généré **ne s'échange pas** contre un autre transporteur ; le
  recours est l'annulation ([aide 154](https://www.vinted.fr/help/154-bordereau-d-envoi-non-recu)).
  Le code du site porte pourtant une demande de changement de transporteur
  (`carrier_change_request`) : fonction récente ou réservée, **à vérifier**.
- Télécharger le bordereau **n'engage à rien** : la transaction reste annulable
  tant que l'article n'est pas expédié ([aide 58](https://www.vinted.fr/help/58)).
- Suivi : « Suivre le colis » dans la conversation, jusqu'à 48 h avant les
  premières informations ([aide 420](https://www.vinted.fr/help/420/100-comment-suivre-un-colis)).
- Date d'expiration du fichier : NON TROUVÉ (il devient inutile à
  l'annulation automatique — TIERS).

⚠️ **Écart à trancher sur une vraie vente** : l'aide dit que le bordereau
arrive tout seul ; le code du site contient en plus une étape « commander
l'étiquette » avec des choix (point de dépôt, date d'enlèvement, papier ou
numérique). Hypothèse (DÉDUIT) : cette étape ne concerne que certains
transporteurs ou modes (enlèvement à domicile, emballage réutilisable Vinted
Go…). C'est **la** chose à observer en premier (§ 9).

**API officielle** : « Vinted Pro Integrations » existe (commandes, envoi,
**PDF d'étiquette**, webhooks `ORDER_CREATED`, `SHIPMENT_LABEL_CREATED`,
`ITEM_SOLD`…) mais elle est **réservée à des entreprises Vinted Pro sur liste
blanche**, 500 articles actifs par utilisateur API au départ, et ne couvre ni
messages, ni offres, ni favoris (DOC :
[pro-docs](https://pro-docs.svc.vinted.com/)). Inutilisable pour le parc
aujourd'hui ; à garder en tête pour les comptes pro.

**Le lien avec ce qu'on a déjà.** Le relevé des ventes de l'extension lit
déjà `my_orders` puis `transactions/<id>` (`background.js:14385-14490`), mais
**ne garde que les ventes finalisées ou annulées** : une vente en cours,
c'est-à-dire justement une vente à expédier, est comptée puis jetée. Le
rattachement à l'article passe par `item_id` → `inventaire.vinted_item_id` ou
le job de dépôt (RPC `enregistrer_ventes_relevees`). Pour un lot (`item_ids`
à plusieurs éléments), aucun rattachement automatique aujourd'hui.

#### B. Favoris, messages, offres

- **Compteurs** : `favourite_count` et `view_count` sont dans la liste du
  dressing (`/api/v2/wardrobe/<id>/items`) — **déjà capturés** chaque jour
  (`inventaire.vinted_favourite_count`, `vinted_listing_snapshots`) (OBS-R).
- **Qui a mis en favori** : aucune liste sur la page de l'annonce, même vue
  par sa propriétaire (OBS-É : les seules actions sont Booster, Indiquer comme
  vendu, Marquer comme réservé, Masquer, Modifier l'annonce, Supprimer). La
  seule trace nominative est la **notification** « X a ajouté ton article à
  ses favoris » :
  - appel : `GET https://api.vinted.fr/inbox-notifications/v1/notifications?page&per_page` (OBS-R) ;
  - chaque notification porte `entry_type`, `subject_id` (l'article),
    **`user_id` (la personne)**, `body`, `link`, `updated_at` (OBS-R) ;
  - le type **20 = `ItemFavourite`** (OBS-C, table des types du site) ;
  - ⚠️ **non observé en réel** : le compte de Nico n'avait que 9
    notifications au total (types 40, 50 et 300), aucune de type 20. On ne
    sait donc pas si Vinted les regroupe (« X et 3 autres »). Conséquence :
    une liste des favoris ne peut se construire **qu'au fil de l'eau**, à
    partir du moment où on commence à relever — jamais pour le passé.
- **Types de notification utiles plus tard** (OBS-C) : 20 favori, 30 nouvel
  abonné, 50 **baisse de prix d'un favori**, 110 nouveau message, 120/121
  nouvelle offre (121 = offre reçue par le vendeur), 125/126 offre
  acceptée/refusée, 300 favori vendu, 750 **suggestion de baisse de prix**
  faite par Vinted au vendeur.
- **Durée de vie des notifications** : « généralement conservées… pendant
  **7 jours maximum** » (DOC, [aide 433](https://www.vinted.fr/help/433-comment-gerer-tes-notifications)).
  Une liste des favoris par notification exige donc un relevé **au moins
  hebdomadaire** ; et un acheteur peut, semble-t-il, désactiver l'avis au
  vendeur (TIERS) : la liste sera **incomplète par nature**.
- **Offre à un favori, une par une : native.** « Si un acheteur ajoute ton
  article à ses favoris ou te pose une question à son sujet, tu peux lui faire
  une offre » (DOC, [aide 57](https://www.vinted.fr/help/57-comment-vendre-tes-articles-plus-rapidement)).
  Le site porte une route pour ouvrir une conversation avec un membre donné à
  propos d'un article donné : `/inbox/want_it?receiver_id=<membre>&item_id=<article>`
  (OBS-C) ; l'appel qui crée la conversation côté vendeur n'a pas été relevé
  (il ne se charge qu'à l'ouverture de cette page, qui n'a pas été ouverte).
- **Offre groupée à tous les favoris : n'existe pas** (OBS-C : rien dans le
  code web ; TIERS : « Tu ne peux pas envoyer d'offre groupée », forum
  vint-aide, 02/2025). L'argumentaire du Boost promet seulement de
  « découvrir combien de personnes ont vu ton article, l'ont ajouté à leurs
  favoris » (OBS-C).
- **La baisse de prix prévient tous les favoris** : Nico, comme acheteur, a
  reçu une notification de type 50 « le prix de l'article … a été réduit de
  70,00 € à 50,00 € » (OBS-R) ; l'aide le confirme pour les abonnés (DOC,
  aide 57). Seuil de 5 % minimum : TIERS seulement. C'est **la seule façon
  native de toucher tous les favoris d'un coup**, sans message.
- **Offre dans une conversation** :
  - `GET /api/v2/transactions/<id>/offers/seller_options` → bornes de l'offre
    vendeur : `min_price` 1,00 €, `max_price` 30 000 € (OBS-R) — les mêmes
    bornes que le prix d'une annonce (DOC, [aide 376](https://www.vinted.fr/help/15/376-comment-fixer-le-prix-de-ton-article)) ;
  - `POST /api/v2/transactions/<id>/offers` avec `{offer:{price,currency}}`
    (OBS-C) ;
  - « Il n'y a **pas de limite** sur le nombre d'offres que tu peux faire en
    tant que vendeur » ; l'acheteur, lui, est limité à 25 offres par jour et
    à −40 % ; le nouveau prix n'est visible que par cette personne ; l'offre
    n'est pas contraignante (DOC, [aide 258](https://www.vinted.fr/help/4/258-comment-faire-une-offre-proposer-un-prix-different)).
    Durée de validité : environ 24 h selon TIERS, NON TROUVÉ côté officiel.
- **Créer une conversation** : dans les pages chargées, le code ne crée une
  conversation que côté acheteur (`POST /conversations` avec `initiator` =
  `buyer_enters_offer_form`, `ask_seller` ou `buy`, OBS-C) ; le chemin
  vendeur passe par la route `want_it` ci-dessus.
- Les outils tiers qui écrivent aux favoris existent (Bleam, Vatbot, Clemz…) :
  ils relisent les notifications toutes les 4 à 6 minutes, onglet Vinted
  ouvert (TIERS). Un dépôt public de 2023 montre les mêmes appels que ceux
  relevés ici (`/api/v2/inbox`, `POST /api/v2/conversations/<id>/replies`) avec
  des pauses de 2-3 s « pour éviter les règles anti-robot strictes de Vinted »
  (TIERS, [callycodes/vinted-seller-bot](https://github.com/callycodes/vinted-seller-bot)).
- **Messagerie** : `GET /api/v2/inbox?page&per_page` → conversations
  (`id`, `item_count`, `description`, `unread`, `updated_at`,
  `opposite_user`, `item_photos`) et un `websocket_user_id` (le site reçoit
  les messages en temps réel) (OBS-R) ; réponse par
  `POST conversations/<id>/replies`, lecture par `mark_as_read` (OBS-C).

#### C. Risques propres

- DataDome est branché dans le client Vinted (événement `DD_BLOCKED_EVENT`,
  OBS-C) ; nos lectures partent déjà d'un onglet, jamais du service worker.
- Précédent : **restriction de publication** chez nadegemarcelin78 (29/08),
  après des **rafales** de republications (318 en 50 min selon
  `vinted.js:2060-2063` ; « 96 republications le 28/08 » selon la migration
  `20260829130000` — les deux sources du dépôt ne disent pas le même
  chiffre). La restriction visait la cadence, pas le total.
- Un message ou une offre envoyé à quelqu'un **qui ne l'a pas demandé** peut
  être **signalé** par le destinataire : c'est un risque d'une autre nature
  que la cadence, et il ne se maîtrise pas par un délai.

- **Les CGU de Vinted** (DOC, [conditions](https://www.vinted.fr/terms-and-conditions),
  version applicable au 05/10/2026, même clause dans la version anglaise en
  vigueur depuis le 10/08/2026) :
  - interdisent « tout type d'outil logiciel externe (… bots …) … dans le but
    de promouvoir des Articles, d'ajouter des Articles aux favoris), à moins
    qu'une telle utilisation ne soit autorisée… par nous » ;
  - interdisent d'« envoyer des messages non sollicités ou **de masse à 5
    Utilisateurs ou plus** » ;
  - prévoient comme sanction, entre autres, « le blocage d'une fonctionnalité
    de votre Compte (**comme les messages**) ».
  Relancer automatiquement tous les favoris d'un article franchit ce seuil
  dès le cinquième.
- **Vague de restrictions « activité automatisée » depuis le 21/07/2026** :
  24 h sans publier ni modifier, déclenchée d'après les témoignages par des
  republications, des favoris, des changements de prix — y compris sur des
  comptes sans outil ; un compte en est à sa 4e (TIERS,
  [vint-aide](https://www.vint-aide.com/t/public-restrictions-pour-activite-automatisee-21-07-2026/4512),
  [redrip](https://www.redrip.app/en/blog/vinted-automation-restriction-2026/)).
  Aucun bannissement **vérifié** lié spécifiquement aux messages aux favoris
  n'a été trouvé.
- Restriction de 24-48 h du bouton « faire des offres » rapportée après un
  message contenant « PayPal » (TIERS) : les **mots** comptent aussi.

### 3.2 Leboncoin

#### A. Bordereaux et suivi

**Où vit une commande.** Page `/compte/part/mes-transactions?page=ventes`
(liste), puis `/compte/part/transaction/<purchase_id>` (détail). Le bordereau
se prépare sur une page « préparer le colis » ; il n'est **pas** dans la page
de détail d'une vente terminée (OBS-É : prix, frais, n° de transaction,
« Contacter l'acheteur », étapes « Colis envoyé » / « Colis reçu »).

**Observé sur une vraie vente de Nico (Shop2Shop, terminée en mars 2026) —
OBS-R, jeton que porte la page :**

| Appel (GET) | Ce qu'il rend |
|---|---|
| `api.leboncoin.fr/api/consumergoods/proxy/v3/pages/transactions?…&user_kind=seller` | la liste des ventes (déjà lue par notre relevé) : `id.purchase_id`, `created_at`, `item{title,price,type}`, `price` (**centimes**), `step` (`done`, `cancelled`, `in_progress`) |
| `…/consumergoods/proxy/v1/pages/prepare-parcel/<purchase_id>` | **`parcel_id`, `label_url`, `with_qrcode`, `shipping_type`** (`shop2shop`), coordonnées, `shipping_instructions_link` (vers l'aide Leboncoin) |
| `label_url` = `…/api/shippingproxy/v1/parcels/<id>/label` (jeton requis) | **404** sur cette vente terminée → **le fichier n'est plus disponible une fois la vente finie** |
| `…/api/shipping/v1/parcels/<id>/label/url` | la même adresse d'étiquette |
| `…/api/shipping/v1/parcels/<id>/status` | `{status:"in_transit", sub_status:"in_transit", occurred_at}` — ⚠️ **resté « en transit » sur une vente terminée** : ce statut seul ne dit pas « livré » |
| `…/consumergoods/proxy/v1/pages/track-and-trace/<purchase_id>` | **le n° de suivi** (`reference`, 15 caractères), `provider` (vide ici), et la liste des transporteurs proposés pour un envoi « par ses soins » : Chronopost, Relais Colis, Colissimo, DPD, GLS, La Poste, Mondial Relay, Swiship (Amazon), UPS |

**Relevé dans leur code (OBS-C, rien déclenché) :**

| Geste | Appel | Engage ? |
|---|---|---|
| infos Colissimo du vendeur | `POST …/shipping/v1/parcels/<id>/sender/colissimo` `{contact, address, drop_off_type, mailbox_picking}` | **oui** : c'est ce qui fait naître l'étiquette Colissimo (dépôt en bureau ou enlèvement en boîte aux lettres) |
| infos « courrier suivi » | `POST …/parcels/<id>/sender/courriersuivi` | oui |
| confirmer l'envoi avec un n° de suivi | `POST …/consumergoods/proxy/v1/purchases/<id>/confirm-shipment` `{provider, reference}` | oui (déclaration) |
| points de dépôt | `GET …/shippingproxy/v1/pick_up_drop_off_points?shipping_type_id&coordinates&parcel_weight` | non |
| délai d'envoi dépassé | `…/purchases/<id>/action/refund-purchase-delivery-expired` | remboursement de l'acheteur |
| retours | `prepare-return-parcel`, `confirm-return-shipment`, `return-parcel` | oui |

**Ce que dit l'aide Leboncoin (DOC, articles datés) :**
- **Deux étapes avant le colis** : l'acheteur paie, puis **le vendeur confirme
  la disponibilité** — c'est ce geste qui déclenche la vente. Délai : 48 h
  ([360009934580](https://assistance.leboncoin.info/hc/fr/articles/360009934580),
  03/12/2025) ou 3 jours ([4417759842962](https://assistance.leboncoin.info/hc/fr/articles/4417759842962),
  07/11/2025) — **les pages se contredisent**.
- Puis le « **bon d'envoi** » : fenêtre dans la messagerie (« Récupérer mon bon
  d'envoi »), e-mail, ou Mon compte › Transactions › Ventes › encart
  « Livraison » › « Télécharger le bon d'envoi ». Délai de dépôt : **72 h**
  ([360010403120](https://assistance.leboncoin.info/hc/fr/articles/360010403120),
  13/04/2026, la plus récente) ou 6 jours (07/11/2025) — contradiction encore.
- **QR code : Mondial Relay seulement**, reçu par e-mail ~30 min après
  l'achat, à faire imprimer en point relais ; la livraison à domicile Mondial
  Relay exige l'impression ; pour régénérer un QR (casier), il faut passer par
  Mondial Relay ([360010025559](https://assistance.leboncoin.info/hc/fr/articles/360010025559),
  10/06/2026).
- Transporteurs : Mondial Relay (point relais, casier, domicile), Colissimo,
  Courrier suivi, Shop2Shop by Chronopost ; **frais facturés à l'acheteur**
  ([4417759780370](https://assistance.leboncoin.info/hc/fr/articles/4417759780370),
  06/05/2026).
- « Pensez à **confirmer l'envoi** via la messagerie leboncoin » ; côté pro, une
  page de 2023 prévient qu'un clic sur « colis envoyé » **avant** d'imprimer
  fait perdre l'accès au bon d'envoi.
- Suivi dans la messagerie ; l'acheteur a 3 jours pour confirmer la
  réception, sinon clôture sous 30 jours.

**Le lien avec ce qu'on a déjà.** Le relevé des ventes Leboncoin lit la même
liste (`background.js:14507-14567`) mais **n'écrit pas** les ventes
`in_progress` — donc aucune vente à expédier. La liste ne donne **aucun
identifiant d'annonce** : le rattachement passe par le moteur (titre + prix),
comme aujourd'hui. Les ventes en main propre n'y sont pas.

#### B. Favoris, messages, offres

- **Compteurs par annonce** (OBS-É, « Mes annonces ») : « N vues pour cette
  annonce », « N mises en favoris », « N conversations engagées ». L'API de
  la page rend `stats{Views, Favorites, Messages, Replies, Leads, Phones}` ;
  on ne lit aujourd'hui que Views et Favorites (`background.js:14189-14193`).
- **Qui a mis en favori** : pas de liste sur « Mes annonces », seulement le
  nombre (OBS-É). **Mais le vendeur est prévenu** quand un acheteur ajoute
  l'annonce à ses favoris — l'aide dit tantôt « automatiquement »
  ([360000595169](https://assistance.leboncoin.info/hc/fr/articles/360000595169),
  02/02/2026), tantôt « les acheteurs ont la possibilité de notifier »
  ([26433072047122](https://assistance.leboncoin.info/hc/fr/articles/26433072047122),
  16/05/2025) ; le réglage vendeur s'appelle « Mise en favoris de mes
  annonces » (DOC).
- **Ce que ça donne à l'écran** : Leboncoin crée lui-même une conversation
  « **X s'intéresse à votre annonce** — Votre bien est toujours disponible ?
  Faites-le lui savoir » (message automatique Leboncoin), avec des réponses
  rapides et un bouton **« Faire une offre » côté vendeur** (OBS-É, dans une
  conversation de Nico ; rien cliqué). Il relance aussi le vendeur (« X
  attend votre réponse ! Il ne vous reste plus que quelques heures… »).
  Hypothèse forte (DÉDUIT) : cette conversation **est** l'avis de mise en
  favori — à confirmer avec un second compte (§ 9).
- **Offre aux favoris : native, une par une.** « En tant que vendeur, vous
  pouvez envoyer une offre aux utilisateurs qui ont placé votre article dans
  leurs favoris et ont choisi de vous notifier, [ou] qui ont entamé une
  discussion avec vous » ; valable **48 h** ; une nouvelle offre annule la
  précédente ; plusieurs acheteurs possibles pour une même annonce, une offre
  à la fois ([4404460279314](https://assistance.leboncoin.info/hc/fr/articles/4404460279314),
  05/12/2024). Le vendeur émet « **sans limite** » ; l'acheteur est limité à
  15 offres par 24 h ([4417744585746](https://assistance.leboncoin.info/hc/fr/articles/4417744585746),
  24/04/2026). Aucune offre groupée documentée.
- **Offre du vendeur** :
  - `GET …/negotiation-front-api/v1/page/send-offer/ad/<id>` sur une annonce
    de Nico → `sender_type: "seller"`, suggestions −10 % et −20 %, prix en
    centimes (OBS-R) ;
  - `POST …/negotiation-front-api/v1/page/send-offer`
    `{offered_price, item_id, item_type, buyer_id}` (OBS-C) — l'offre vise
    **une personne** (`buyer_id`) déjà connue : un favori qui a choisi de
    prévenir, ou quelqu'un qui a écrit ;
  - acceptation, refus, affichage : `offers/<id>/buyer-accept`,
    `seller-accept`, `decline-offer`, `page/show-offer/<id>` (OBS-C).
- **Message aux abonnés (fonction native)** : « follower targeting ».
  - `GET …/followme/v1/follower-targeting/eligibility` →
    `{eligible:false, reasonCode:"FALLBACK_NO_STORE"}` (OBS-R) ;
  - `GET …/follower-targeting-api/v1/core-data` →
    `{availableQuota:{available:1, maximum:1}, followerCount:3}` (OBS-R) ;
  - envoi : `POST …/follower-targeting-api/v1/messages` (OBS-C).
  - Lecture : réservé aux comptes avec **boutique** (pro) (DÉDUIT du motif
    `FALLBACK_NO_STORE`), **quota d'un envoi** (sur une période non observée),
    vers les **abonnés** — pas vers les favoris.
- **Messagerie** : API `…/messaging/proxy/api/v1/hal/<userId>/conversations/<id>/messages`,
  pièces jointes, blocage, compteur (OBS-C) ; liste des conversations visible
  (OBS-É). Leboncoin propose une « messagerie intelligente » (réponses
  suggérées) à activer : fenêtre observée, **non cliquée**.

- **Baisse de prix → favoris prévenus ?** NON TROUVÉ côté officiel (un forum
  de 2022 l'affirme — TIERS, possiblement périmé).
- **API** : aucune API publique pour les objets du quotidien ; la diffusion
  automatique est réservée aux pros de certains secteurs (immobilier,
  automobile, emploi…), **pas la mode** (DOC,
  [360000033519](https://assistance.leboncoin.info/hc/fr/articles/360000033519)).
- Statistiques : l'aide (2022, ancienne) dit que les particuliers n'ont pas
  les favoris ; **l'écran de Nico, particulier, les montre** (OBS-É) — l'aide
  est périmée sur ce point.

#### C. Risques propres

- DataDome enveloppe `window.fetch` sur toutes les pages (script
  `dd.leboncoin.fr/tags.js`, OBS-R) : chaque appel de la page passe par lui.
- Précédent du 09/07 : « Accès temporairement restreint — vous surfez et
  cliquez à une vitesse surhumaine », IP signalée (mémoire `anti-bot-timing`).
- 92,6 % de 403 sur les sondes lancées hors onglet (`config.js:83-85`) : tout
  doit partir d'un onglet de la plateforme.
- **La messagerie se bloque** pour « l'envoi de messages répétitifs » ; le
  « spam, démarchage » peut être masqué ou empêché (DOC,
  [4407783631122](https://assistance.leboncoin.info/hc/fr/articles/4407783631122),
  [360000032839](https://assistance.leboncoin.info/hc/fr/articles/360000032839)).
  Un même texte envoyé à plusieurs personnes est exactement ce motif.
- Les CGU interdisent robots et extraction (clause lue en extrait de
  recherche seulement — TIERS : la page des CGU répond 403) ; compte bloqué
  environ 7 jours ouvrés en cas d'« activité suspecte » (DOC,
  [360021498740](https://assistance.leboncoin.info/hc/fr/articles/360021498740)).

### 3.3 eBay

Deux comptes eBay distincts sont en jeu chez Nico :
- le compte **ouvert dans Chrome** (voie extension) : 0 commande sur 90 jours,
  6 annonces actives, « 0 suivi par personne » sur chacune (OBS-É) ;
- le compte **relié à FillSell par l'API** (`nelsonthecat`, 5 accès
  consentis, OBS-R en base) : c'est sur lui qu'ont porté les appels API
  ci-dessous, **avec l'accord explicite de Nico donné pendant l'audit**.
  Le jeton, expiré depuis le matin, a été renouvelé pour ce seul compte (action
  de mesure du worker eBay sur un article inexistant : aucune autre écriture) ;
  il n'a jamais été affiché.

#### A. Bordereaux et suivi

- **Acheter un bordereau eBay par API : impossible en France.** La Logistics
  API est « Limited Release », **États-Unis seulement, USPS seulement** (DOC :
  [guide gestion des commandes](https://www.edp.ebay.com/develop/guides-v2/order-management/order-management-guide),
  [aperçu Logistics](https://www.edp.ebay.com/api-docs/sell/logistics/overview.html)).
- **Les bordereaux eBay existent en France, dans l'interface seulement** : Mon
  eBay › Commandes › « Imprimer un bordereau d'envoi », **après la vente**
  (DOC : [aide 4157](https://www.ebay.fr/help/selling/posting-items/labels-packaging-tips/buying-printing-postage-labels?id=4157)).
  - transporteurs : Mondial Relay (point relais, domicile UE), La Poste Lettre
    suivie, Colissimo ; Chronopost et international via Packlink
    ([tarifs](https://www.ebay.fr/espacevendeurs/livraison/frais-bordereaux-ebay)) ;
  - **payés par le vendeur**, sur ses fonds eBay ; **QR code** possible sans
    imprimante ; réimpression gratuite ; annulation remboursée sous **14 jours**
    si non utilisé ;
  - le n° de suivi est **posé tout seul** sur la commande et l'objet passe
    « expédié » (DOC :
    [aide 4088](https://www.ebay.fr/help/selling/shipping-items/effectuer-le-suivi-des-objets-que-vous-avez-vendus?id=4088)).
  - Vu dans Chrome (OBS-É) : la page « Mon eBay › Bordereaux d'envoi »
    (`/ship/labels/my-ebay`, « Suivre et gérer vos envois », « Vous pouvez
    toujours accéder aux factures des envois Packlink ») existe ; elle était vide.
  - Contexte : depuis le 1er septembre 2026, les particuliers ne paient plus
    de frais de vente sur ebay.fr et eBay pousse ses bordereaux négociés
    (DOC : [communiqué eBay](https://www.ebayinc.com/stories/press-room/fr/ebay-supprime-les-frais-de-vente/)).
- **La commande et le suivi, par l'API déjà reliée** (scope `sell.fulfillment`,
  déjà consenti) :
  - `GET /sell/fulfillment/v1/order` → **200**, 0 commande sur le compte relié
    (OBS-R) : l'appel marche, il n'y avait rien à voir ;
  - aucune commande ne porte d'étiquette ; le n° de suivi vit dans
    `GET …/order/<id>/shipping_fulfillment` (`shipmentTrackingNumber`,
    `shippingCarrierCode`) (DOC) ;
  - l'état est `orderFulfillmentStatus` / `lineItemFulfillmentStatus`
    (`NOT_STARTED`, `IN_PROGRESS`, `FULFILLED`) (DOC) ; la date limite d'envoi
    est `lineItemFulfillmentInstructions.shipByDate` (spec eBay lue via un
    miroir — TIERS) ;
  - le transporteur de la commande est **celui choisi par l'acheteur à
    l'achat** (`shippingStep.shippingServiceCode`), pas forcément celui
    réellement utilisé (même source) ;
  - `POST …/order/<id>/shipping_fulfillment` **marque « expédié »** avec
    transporteur + n° de suivi (codes France : `Colissimo`, `MondialRelay`,
    `Chronopost`, `LAPOSTE`, `Exapaq` (DPD)… — l'appel `GeteBayDetails` fait
    foi) (DOC).
- **Notification en temps réel d'une vente** : le sujet `ORDER_CONFIRMATION`
  est disponible **avec le scope `sell.fulfillment` qu'on a déjà** (OBS-R :
  `GET /commerce/notification/v1/topic`). `ITEM_MARKED_SHIPPED` demande
  `commerce.shipping` (non détenu). eBay prévient que les notifications
  **ne sont pas rejouées** en cas d'échec : le relevé quotidien reste le filet
  (DOC).

#### B. Favoris (« suivis »), offres, messages

- **Nombre de suivis** : lisible par l'API Trading `GetMyeBaySelling` avec le
  jeton actuel (OBS-R : 20 annonces actives, 3 suivies chacune par 1
  personne). Aujourd'hui on le lit dans le Hub vendeur
  (`watchCount`, DOM). **L'identité des personnes qui suivent : jamais**
  (DOC ; offres masquées, voir ci-dessous).
- **Vues** : `getTrafficReport` couvre EBAY_FR mais demande
  `sell.analytics.readonly` (**non détenu**, 100 appels/jour) (DOC).
- **Offre aux acheteurs intéressés — native, par API, disponible chez nous** :
  - `GET /sell/negotiation/v1/find_eligible_items` avec
    `X-EBAY-C-MARKETPLACE-ID: EBAY_FR` → **200, 5 annonces éligibles** sur le
    compte de Nico (OBS-R). **EBAY_FR est donc pris en charge, avec le scope
    `sell.inventory` déjà consenti : aucun nouveau consentement.**
  - `POST /sell/negotiation/v1/send_offer_to_interested_buyers` (non appelé) :
    une annonce par envoi, **remise d'au moins 5 %**, offre valable **2 jours**
    sur EBAY_FR (non modifiable), message de 2 000 caractères au plus, sans
    coordonnées ni lien ; « intéressé » = a mis en suivi, ou a laissé l'objet
    dans son panier ; les acheteurs sont **masqués** ; eBay limite le nombre
    d'offres qu'un acheteur peut recevoir et renvoie une erreur quand le
    vendeur a atteint sa limite (valeurs non publiées) (DOC :
    [spec OAS](https://www.edp.ebay.com/api-docs/master/sell/negotiation/openapi/3/sell_negotiation_v1_oas3.json),
    [aide 4144](https://www.ebay.fr/help/selling/listings/selling-buy-now/adding-best-offer-listing?id=4144)).
  - Dans l'interface, la même fonction (« Envoyer une offre ») n'apparaît que
    sur une annonce qui a des intéressés : le menu des annonces du compte
    Chrome (0 suivi) ne la proposait pas (OBS-É : Modifier, Partager,
    Historique du trafic, Terminer la vente).
- **Offre directe (l'acheteur propose)** : activée sur les 6 annonces du compte
  Chrome (« ou Offre directe », OBS-É). eBay sait **accepter ou refuser tout
  seul** au-dessus / en dessous de seuils fixés par annonce
  (`bestOfferTerms.autoAcceptPrice` / `autoDeclinePrice` de l'Inventory API) ;
  répondre à une offre passe par la Trading API (`GetBestOffers`,
  `RespondToBestOffer`, 24 h pour répondre) (DOC).
- **Messagerie** : une Message API REST existe depuis le 03/11/2025 (envoi,
  conversations) mais exige le scope **`commerce.message`**, que notre propre
  garde-fou interdit (`_shared/ebay-oauth.ts:67-70`) et que les conditions
  publiques excluent (§ 8.5 : « Aucun autre accès (messagerie…) ») ; les
  sujets de notification `NEW_MESSAGE` et `BUYER_QUESTION` exigent le même
  scope (OBS-R). La Trading API borne les destinataires : partenaires d'une
  commande pendant 90 jours, auteurs d'enchères ou d'offres, réponse à une
  question (DOC).

#### C. Risques propres

- Tout passe par l'API officielle, dans les règles et quotas d'eBay :
  **risque de compte le plus faible des cinq plateformes**.
- La licence API interdit toute communication non sollicitée (§ 8.2(d)) et le
  règlement « contacts entre membres » interdit les messages commerciaux non
  sollicités (DOC : [licence](https://www.edp.ebay.com/join/api-license-agreement),
  [aide 4262](https://www.ebay.fr/help/member-behavior-policies/policies/rglement-sur-les-contacts-entre-membres?id=4262)).
  L'offre aux intéressés est la seule forme autorisée : eBay la cadre lui-même.
- À retenir pour l'IA plus tard : la même licence (§ 8.5(b)(i)) interdit de
  verser des données issues de certaines API « restreintes » dans une IA
  tierce sans accord écrit d'eBay (DOC ; lesquelles de nos API sont
  concernées : non établi).

### 3.4 Beebs

- **Aucune vente** sur le compte de Nico (OBS-É « Pas encore de ventes ? » sur
  `/fr/account/orders/list/seller`). Le parcours d'envoi n'est donc **pas
  observable**.
- Le site déclare dans sa configuration un service d'expédition dédié,
  `shipping-api.beebs.app`, un service de messagerie `chat-api.beebs.app`, et
  une identité Firebase (OBS-C).
- **Offres, dans le code du site web** (OBS-C) : l'acheteur fait une offre
  depuis son panier (« Ajoutez des articles à votre panier, puis faites une
  offre »), avec un **quota quotidien** (« N offres restantes aujourd'hui ») et
  un minimum ; le vendeur répond par accepter, refuser ou **contre-offre**
  (`make_a_counter_offer`, `accept_counter_offer`). Aucune offre à
  l'initiative du vendeur **dans le site web**.
- **Messagerie** (OBS-C) : `/chats/v3` (liste), compteur de non-lus,
  suppression, signalement, blocage.
- **Favoris** : compteurs déjà capturés (index public `product_nb_favorite`,
  `product_nb_views` ; cœur et œil sur « Mes annonces »). Identité : aucune
  trace dans le code.

**Ce que dit l'aide Beebs (DOC, centre d'aide `sos.beebs.app`) :**
- ⛔ **Générer le bordereau, c'est accepter la commande** : « Une fois le
  bordereau généré, cela signifie que vous acceptez la commande. L'acheteur a
  été débité du montant de la commande »
  ([360018395820](https://sos.beebs.app/hc/fr/articles/360018395820)) ; « Nous
  prélevons l'argent uniquement lorsque le vendeur confirme la commande et
  qu'il génère le bordereau » ([360018488619](https://sos.beebs.app/hc/fr/articles/360018488619)).
  Le vendeur a **48 h** pour le faire, puis **6 jours** pour déposer, sinon
  annulation automatique ([360018436119](https://sos.beebs.app/hc/fr/articles/360018436119)).
  Sur le web : « Mes commandes » › « Générer mon bordereau d'envoi ».
- Transporteurs : Mondial Relay et Shop2Shop by Chronopost (page du
  26/06/2026 ; des pages de 2023 citent aussi Relais Colis et Colis Privé).
  **Aucun QR code documenté** : il faut imprimer.
- Suivi : « Suivre la livraison » dans l'app.
- **Favoris : Beebs a exactement la fonction demandée, dans l'app** : « Un
  encart affiche le nombre d'ajout(s) en favoris : cliquer sur le bouton
  "Faire une offre". Le(s) membres ayant mis votre article en favoris
  s'affiche(nt) alors. Depuis cet écran, vous pouvez soit : **faire une offre
  groupée à toutes les personnes intéressées** ; faire des offres
  individuelles » (rabais proposés 20, 30, 40 %)
  ([360019157199](https://sos.beebs.app/hc/fr/articles/360019157199)) ; le
  vendeur n'a **aucune limite** d'offres par jour
  ([6565981348764](https://sos.beebs.app/hc/fr/articles/6565981348764),
  24/04/2026). En 2023 les offres n'existaient que dans l'app ; le code du
  site web d'aujourd'hui confirme (OBS-C ci-dessus) : pas d'offre vendeur sur
  le web.
- Automatisation : CGU illisibles (403) ; « Nos outils modèrent
  automatiquement l'ensemble des annonces » et « il est interdit de
  référencer les mêmes articles plus d'une fois » (DOC,
  [5843157506706](https://sos.beebs.app/hc/fr/articles/5843157506706)).
  Aucune API pour les pros.

### 3.5 Opla

Nico était **déconnecté** d'Opla : rien n'a pu être lu en session. Tout ce qui
suit vient du **code client** d'Opla (OBS-C) et des relevés du 14-16/09
(`docs/OPLA_RELEVE.md`, `docs/opla/observations-brutes.md`).

**Bordereaux et suivi (OBS-C)** :
- la vente (`checkout`) passe par `waiting_for_shipment` (« À expédier ») →
  `label_generated` (« Étiquette créée ») → `shipped` → `delivered` (et
  `shipped_back` pour un retour) ;
- textes du site : « Vous avez **5 jours** pour déposer le colis en point
  relais » (Mondial Relay), « L'étiquette et la livraison sont **payées par
  l'acheteur** », « Génération de votre étiquette… », « Étiquette prête —
  imprimez-la et expédiez le colis », « Ouvrir l'étiquette (PDF) » ;
- transporteurs : Mondial Relay (point relais ou domicile), Colissimo (point
  relais ou domicile) ; drapeau serveur `shippingQrCode: true` (relevé du
  14/09) ;
- Opla a **sa propre liste « Commandes à expédier »** ;
- appels : `/me/checkouts`, `/me/checkouts/<id>`, `…/validate`, `…/pay`,
  retours (`…/return/quote`, `…/return/request`), `/me/pickup-relays`,
  `/me/invoices`.
- ⚠️ La forme exacte d'une vente (où est le lien de l'étiquette, le n° de
  suivi) n'est **pas** observée : Opla n'a jamais eu de vente chez Nico.

**Favoris, offres, messages (OBS-C) — avec Beebs (dans son app), Opla est la
plateforme qui a exactement la fonction demandée, et la seule où elle est
dans le site web** :
- `GET /me/favoriters/summary` et `GET /me/articles/<id>/favoriters` : **qui
  aime mes articles** (titre de l'écran : « Qui aime mes articles ? ») ;
- `POST /me/articles/<id>/favoriters/<userId>/offer` `{offeredPriceCents}` :
  **une offre à une personne qui a mis en favori** ;
- règle affichée par Opla : « **Seules les personnes désirant être
  recontactées apparaissent ici** » ; et si personne : « Aucune annonce n'a de
  favori contactable pour le moment » — l'accord de l'acheteur est donc
  **déjà recueilli par Opla** ;
- rangé dans « Vendre plus vite » sous « **Relance les intéressés** », à côté
  du Boost (3 ou 7 jours), de la mise en avant et de la remise sur le dressing ;
- offre dans une conversation : `POST /me/offers` `{chatId, offeredPriceCents}`,
  remises proposées 5 %, 10 % ou libre, « N propositions restantes pour
  aujourd'hui », « Ton offre ne peut pas être supérieure au prix » ;
- messagerie : `/me/chats`, `/me/chats/<id>/messages`, notifications
  `/me/notifications` (non lues, lu, tout lu) ;
- baisse de prix : `/me/articles/<id>/reduction`, remise dressing
  `/me/dressing-promo`.

**Ce que dit l'aide Opla (DOC) — elle confirme le code :**
- étiquette **automatique** à la vente, dans l'app, par e-mail ou dans la
  conversation ; **QR code sans imprimante** chez Mondial Relay en France
  (app 2.4.0 et plus), « valable jusqu'à la date limite de dépôt » ; dépôt
  dans les **5 jours** suivant l'achat ; frais payés par l'acheteur
  ([aide étiquette](https://help.opla.co/fr/article/une-fois-mon-article-vendu-comment-recois-je-letiquette-dexpedition-9d90fs/),
  10/08/2026) ; à défaut, vente annulée et acheteur remboursé (CGU art. 6,
  version du 01/09/2026) ;
- transporteur : Mondial Relay (France, Belgique, Pays-Bas, Luxembourg),
  Chronopost « en cours d'intégration » (06/09/2026) — le code web mentionne
  déjà Colissimo ;
- favoris : « vous voyez le nombre de personnes ayant ajouté vos articles en
  favoris. Vous pouvez aussi voir **qui** les a ajoutés, à l'exception des
  membres qui ont choisi de rester anonymes »
  ([aide favoris](https://help.opla.co/fr/article/puis-je-savoir-qui-a-mis-mon-article-en-favoris-1ieiiuz/),
  10/06/2026) ;
- « Offres privées à ceux qui ont ajouté votre article en favori » (notes de
  version App Store, v1.0.24) ; offres sans limite de nombre ;
- CGU art. 9 : le vendeur s'engage à « ne pas utiliser des outils automatisés
  non autorisés pour interagir avec la plateforme ».
- À noter : Opla fournit **sa propre extension Chrome** d'import depuis
  Vinted, qui lit les annonces dans la session du navigateur (DOC) — même
  principe que FillSell.

### 3.6 Stoolz

- Marketplace française de seconde main (vêtements, sneakers, vintage), avec
  vente en direct vidéo et enchères, web et apps, France seulement (DOC,
  [à propos](https://www.stoolz.fr/a-propos)) ; environ 2 000 annonces
  actives au 22/09/2026 ; éditeur POPUPMARKET SAS.
- Envoi : Mondial Relay et Colissimo ; « Le bordereau d'envoi se génère **en un
  clic depuis la conversation de la commande** » ; **5 jours ouvrés**, sinon
  annulation et remboursement ([point relais](https://www.stoolz.fr/point-relais)) ;
  offres valables 48 h ([FAQ](https://www.stoolz.fr/faq)).
- **Aucune API, aucun webhook, aucun programme partenaire public** (NON
  TROUVÉ ; `/api` rend 404). L'accès se fera donc sur la base de ce que Stoolz
  vous prépare. Le modèle du § 5 est conçu pour l'accueillir sans écran
  nouveau (§ 5.4).

---

## 4. Ce que FillSell a déjà — et ce qui manque

### 4.1 La détection de vente : trois familles qui ne se parlent pas

| Famille | Ce qu'elle fait | Où |
|---|---|---|
| **Veilleurs d'annonces** (5 plateformes) | lisent l'annonce publiée, posent un drapeau `sale_signal` sur le job ; n'écrivent aucune vente | `background.js:8702-9470`, veilleur eBay serveur `ebay-api-worker/index.ts:1508-1772` |
| **Relevés des ventes** (Vinted, Leboncoin, Opla par l'extension ; eBay par le serveur) | écrivent dans `ventes` par une seule porte, la RPC `enregistrer_ventes_relevees` ; ne déclenchent rien d'autre | `background.js:14290-14704`, `ebay-ventes-sync/index.ts` (cron 4 h 40 UTC) |
| **Synchro du dressing Vinted** | pose le drapeau, ou bascule l'article en `vendu` s'il n'a pas de job | `background.js:16128-16366` |

Le seul chemin « vente + retrait des copies + mail » reste le **bandeau
« Vendue ? »** de l'app → `check-listing-status` → `orchestrateSale`
(`_shared/sale-orchestration.ts`). Le retrait des copies sur les autres
plateformes reste **déclenché par le vendeur** (sauf Beebs sans lien).

### 4.2 Après la vente : RIEN

- **Aucune** table, colonne, fonction ou écran ne porte un transporteur, un
  n° de suivi, un bordereau, un point relais, un QR code, un acheteur ou une
  conversation. Aucune table `commandes`, `expeditions`, `colis`.
- La table `ventes` n'a ni identifiant d'annonce, ni job, ni lien, ni
  acheteur, ni expédition. Elle a en revanche `commande_ref` +
  `plateforme_code` avec un index unique (`20260919160000_ventes_socle_releve.sql`) :
  c'est **le point d'accroche naturel** d'une commande.
- **Les relevés jettent précisément les ventes à expédier** : Vinted ne garde
  que `completed`/`failed` ; Leboncoin n'écrit pas `in_progress` ; Opla
  n'écrit pas `accepted`/`waiting_for_shipment`. Seul eBay écrit la vente
  dès le paiement, sans regarder l'expédition.
- eBay : `ebay-ventes-sync` lit `getOrders` mais **refuse volontairement**
  `fulfillmentStartInstructions` (adresse de livraison) et tout ce qui touche
  l'acheteur (`ebay-ventes-sync/index.ts:40-44`).
- La seule place réservée : un commentaire dans les Réglages, « Les
  BORDEREAUX arriveront dans ce groupe » (`src/reglages/plan.js:100-104`),
  et le groupe « Automatismes » qui annonce la « MESSAGERIE IA » et
  l'« AUTO-NÉGOCIATION (prix plancher, décote acceptée, réponse automatique
  aux offres) » (`plan.js:128-135`).

### 4.3 ⛔ Une règle écrite qu'il faudra rouvrir : « aucune donnée d'acheteur »

La règle est posée à trois endroits, et elle est cohérente avec ce que FillSell
fait aujourd'hui :
- `background.js:14304-14305` : « AUCUNE DONNÉE PERSONNELLE D'ACHETEUR ne
  traverse : ni pseudo, ni nom, ni identifiant d'acheteur » ;
- `ebay-ventes-sync/index.ts:40-44` : « RIEN de tout cela n'est lu,
  transporté ni écrit » (nom, adresse, téléphone, e-mail de l'acheteur) ;
- **les conditions publiques** : `src/pages/Legal.jsx` § 8.1 (« l'extension
  lit et remplit les formulaires de dépôt d'annonce… afin de publier à votre
  place ») et § 8.2 (« ne collecte aucune donnée personnelle
  supplémentaire ») ; et le § 8.5 eBay promet : « Aucun autre accès
  (messagerie, paiements, données d'acheteurs au-delà de la commande) n'est
  demandé » (`docs/EBAY-DOSSIER-09-09.md`).

Le cockpit a besoin, au minimum, d'un **pseudo d'acheteur** (pour
reconnaître une commande, pour les favoris) et touche à des **fichiers qui
contiennent un nom et une adresse** (le bordereau). La messagerie, c'est par
nature de la correspondance privée. **Rien de tout cela ne peut se faire sous
les textes actuels** : il faut une décision de Nico, puis la mise à jour des
conditions, de la fiche Chrome Web Store (rubrique « pratiques de
confidentialité ») et du § 8.5 eBay. C'est la question n° 1 du § 11.

### 4.4 Ce qui est réutilisable tel quel

| Brique | Pour quoi | Où |
|---|---|---|
| Onglet de travail invisible, appels depuis la page (jeton `luat` Leboncoin, CSRF + `anon_id` Vinted, `/api/public` Opla) | lire commandes, étiquettes, notifications, messagerie comme la page le fait | `background.js:4952-5712, 9030-9161, 14340-14354` |
| File de commandes `vinted_sync_runs` (un `kind` par besoin ; `messages` était déjà prévu) | « actualise mes commandes », « relève mes favoris » à la demande | migrations `20260805090000`, `20260917223000` |
| Interrupteurs serveur fermés par défaut (`coin_config`, `profiles.beta_flags`) | ouvrir le cockpit à Nico seul, puis à une liste, puis à tous ; couper à distance | `background.js:12425-12432, 1950-1971` |
| Pause par plateforme (`platform_health.paused`), disjoncteur, retenue serveur des republications | modèle des plafonds côté serveur | `get-pending-jobs/index.ts:334-518, 2041-2168` |
| Compteurs vues/favoris des 5 plateformes, déjà stockés et affichés | l'en-tête de la vue « intéressés » | `annonces_plateforme.vues/favoris`, `inventaire.vinted_*`, `StockTab.jsx:10256-10263` |
| Rattachement annonce ↔ article (moteur `rapprocher_*`, jobs) | relier une commande à l'article | migrations `20260917223000` et suivantes |
| API eBay reliée : `sell.fulfillment` déjà consenti | commandes à expédier + suivi eBay **sans nouveau consentement** | `_shared/ebay-oauth.ts:71-77` |
| Hôtes déjà déclarés dans le manifest (`*.vinted.fr`, `*.leboncoin.fr`, `*.beebs.app`, Opla optionnel) | tous les appels relevés ici sont couverts : **aucun nouvel hôte**, donc pas de réactivation forcée de l'extension | `manifest.json:13-25` |

### 4.5 Ce qui manque

- l'identité des personnes intéressées, sur toutes les plateformes ;
- la messagerie, les offres et les notifications des plateformes ;
- un prix plancher par article (seulement annoncé dans `plan.js`) ;
- une infrastructure de notification push qui marche (`profiles.push_token`
  existe, rien ne l'écrit) — utile pour « à déposer avant demain » ;
- côté eBay, le scope `commerce.message` est **interdit par notre propre
  garde-fou** (`_shared/ebay-oauth.ts:67-70`) ; ajouter un scope oblige
  **chaque** vendeur relié à refaire le consentement.

---

## 5. Modèle de données proposé (livrable 2)

### 5.1 Principes

1. **Un seul modèle pour toutes les plateformes**, alimenté par trois sources :
   l'extension (session du vendeur), une API (eBay aujourd'hui, Stoolz
   demain) ou un webhook (Stoolz). La colonne `source` dit d'où vient chaque
   ligne ; les écrans ne font pas la différence.
2. **La commande est la preuve de vente la plus forte qu'on puisse avoir.**
   Une commande « à expédier » relevée sur la plateforme vaut mieux qu'une
   annonce disparue : elle doit pouvoir **nourrir le bandeau « Vendue ? »**
   (proposer le retrait des copies dès qu'elle apparaît), sans rien déclencher
   seule — la règle actuelle (« un relevé remplit des cases, il ne déclenche
   rien ») reste vraie.
3. **Le minimum de données personnelles** : on garde l'identifiant de la
   personne sur la plateforme (et son pseudo si Nico le décide), **jamais son
   adresse** ; le fichier du bordereau (qui porte nom et adresse) se va
   chercher **à la demande** dans la session du vendeur — le stocker, même
   temporairement, est une décision (question 2).
4. **Rien ne part sans une ligne dans un journal, validée par l'utilisateur,
   et acceptée par un plafond tenu EN BASE.** Leçon du 30/08 : les plafonds
   embarqués dans l'extension ont été retirés ; ceux qui tiennent sont côté
   serveur (retenue des republications).
5. Règles du dépôt appliquées : RLS partout, lecture « own », écriture par
   RPC `SECURITY DEFINER` **avec `REVOKE EXECUTE … FROM anon` nommé** (piège
   du 19/09), `GRANT` à `authenticated` sur toute table neuve (CLAUDE.md),
   et pour un éventuel e-mail la règle `email_logs` (type one-shot dans
   l'index, type récurrent protégé ailleurs).

### 5.2 Tables proposées

**`commandes`** — une ligne par commande d'une plateforme.

| Colonne | Contenu |
|---|---|
| `id` uuid, `user_id` | |
| `platform` | vinted, leboncoin, ebay, beebs, opla, stoolz |
| `commande_ref` | Vinted `transaction_id` · Leboncoin `purchase_id` · eBay `orderId` · Opla id du `checkout` · Beebs/Stoolz : leur id — **la même clé que `ventes.commande_ref`** |
| `conversation_ref` | Vinted `conversation_id` (la page de la commande), sinon NULL |
| `etat` | état **normalisé** : `a_preparer`, `bordereau_pret`, `deposee`, `en_transit`, `livree`, `terminee`, `annulee`, `litige`, `retour` |
| `etat_plateforme` | l'état **brut** (code Vinted, `step` LBC, `orderFulfillmentStatus` eBay, `status` Opla) — jamais réinterprété ailleurs |
| `vendue_le`, `a_expedier_avant` | date de vente, date limite de dépôt |
| `montant`, `devise`, `lot` | prix payé (unité par plateforme : ⛔ LBC en centimes), vente groupée |
| `vente_id` | lien vers `ventes` (la ligne comptable), unique |
| `acheteur_ref`, `acheteur_pseudo` | identifiant plateforme de l'acheteur ; pseudo **seulement si Nico le décide** (question 1) |
| `source`, `vu_le`, `maj_le` | `extension` / `api` / `webhook` ; dernier relevé |
| unicité | `(user_id, platform, commande_ref)` |

**`commande_articles`** — ce que contient la commande (un lot = plusieurs
lignes) : `commande_id`, `inventaire_id` (NULL tant que non rattaché),
`listing_id` (id de l'annonce), `job_id` (le dépôt FillSell, s'il existe),
`titre`, `prix`. Le rattachement réutilise le moteur existant (identifiant
d'abord, puis titre + prix ; jamais de devinette sur un lot).

**`expeditions`** — un colis (une commande peut en avoir plusieurs ; un retour
est un colis de sens `retour`).

| Colonne | Contenu |
|---|---|
| `commande_id`, `sens` | `aller` / `retour` |
| `transporteur`, `transporteur_libelle` | normalisé (`mondial_relay`, `relais_colis`, `chronopost_shop2shop`, `colissimo`, `la_poste_suivi`, `inpost`, `vinted_go`, `ups`, `dpd`, `gls`, `autre`) + le libellé brut |
| `mode_depot` | `point_relais`, `bureau_poste`, `boite_aux_lettres`, `enlevement`, `casier`, `inconnu` |
| `etiquette_type` | `pdf`, `qr`, `code`, `aucune` |
| `etiquette_etat` | `a_generer`, `prete`, `expiree`, `indisponible` |
| `etiquette_ref` | l'identifiant **plateforme** du colis (Vinted `shipment_id`, LBC `parcel_id`, …) — sert à aller chercher le fichier à la demande ; **pas le fichier** |
| `deposer_avant` | date limite propre au colis |
| `numero_suivi`, `suivi_url` | n° et page publique de suivi |
| `suivi_etat`, `suivi_evenements` | normalisé (`attente_depot`, `depose`, `en_transit`, `en_point_relais`, `livre`, `incident`, `retour`) + les derniers événements bruts, sans donnée personnelle |
| `point_depot` | le point où **le vendeur** dépose (s'il est connu) — jamais l'adresse de l'acheteur |

**`interesses`** — une personne intéressée par une annonce.

| Colonne | Contenu |
|---|---|
| `user_id`, `platform`, `listing_id`, `inventaire_id` | l'annonce et l'article |
| `personne_ref`, `personne_pseudo` | identifiant plateforme (+ pseudo selon la question 1) |
| `signal` | `favori`, `conversation`, `offre_recue`, `abonne` |
| `origine` | `notification_vinted` (type 20), `favoris_opla`, `favori_lbc` (a choisi de prévenir), `conversation_lbc`, `webhook`… |
| `contactable`, `canal` | vrai seulement si un canal **légitime** existe : `offre_native` (Opla : la personne a accepté d'être recontactée ; Leboncoin : le favori a choisi de prévenir), `conversation` (elle a déjà écrit) ; sinon `aucun` |
| `premier_signal_le`, `dernier_signal_le` | |
| `statut` | `nouveau`, `offre_envoyee`, `offre_acceptee`, `a_achete`, `ignore` |
| unicité | `(user_id, platform, listing_id, personne_ref, signal)` |

eBay n'entre pas dans `interesses` : ses acheteurs intéressés sont
**anonymes** ; l'offre eBay vise l'annonce, pas une personne. Ses compteurs
restent dans `annonces_plateforme`.

**`actions_sortantes`** — le journal de **tout** ce qui part vers une
plateforme (le cœur des garde-fous).

| Colonne | Contenu |
|---|---|
| `type` | `offre_favori`, `offre_conversation`, `offre_interesses_ebay`, `message`, `baisse_prix`, `generer_bordereau`, `confirmer_envoi` |
| `cible`, `contenu` | qui (commande, annonce, personne, conversation) ; quoi (prix en centimes, texte) |
| `statut` | `a_valider` → `validee` → `en_cours` → `envoyee` / `refusee_plateforme` / `echec` / `bloquee_plafond` / `annulee` |
| `valide_le`, `valide_par` | **obligatoire avant tout envoi** ; `utilisateur` seulement (une valeur `regle_auto` n'existera que le jour où Nico ouvre l'automatique) |
| `voie`, `cle_idempotence` | `extension` ou `api` ; unique — un double clic ne part jamais deux fois |
| `envoye_le`, `reponse` | ce que la plateforme a répondu |

Une fonction `reserver_action_sortante()` **en base** accepte ou refuse chaque
envoi : plafond par compte, par plateforme et par jour ; espacement minimum ;
plateforme en pause (`platform_health`) ; interrupteur général
(`coin_config`) ; compte récemment restreint. Même forme que la retenue des
republications, qui a fait ses preuves.

**Plus tard (IA)** : `conversations` (métadonnées : plateforme, référence,
article, personne, dernier message, non-lus) et `messages` (texte), seulement
si Nico accepte, le jour venu, de stocker de la correspondance privée.

**Pour les plateformes par API (Stoolz)** :
- `connexions_api` : jetons (service_role seulement, comme `ebay_accounts`),
  capacités consenties, secret de webhook, dates de connexion / révocation ;
- `evenements_plateforme` : le journal brut des webhooks reçus (id
  d'événement unique, signature vérifiée oui/non, reçu le, traité le,
  erreur) — rejouable, idempotent.

### 5.3 Ce que le modèle réutilise

| Existant | Rôle dans le cockpit |
|---|---|
| `ventes` (`commande_ref`, `plateforme_code`, index unique) | la ligne comptable ; `commandes.vente_id` s'y accroche par la même clé. ⚠️ eBay y écrit `<orderId>:<lineItemId>` (une ligne par article) : la commande eBay porte `orderId`, ses articles portent les `lineItemId`. |
| `inventaire`, `cross_post_jobs`, `annonces_plateforme` | l'article, ses dépôts, ses annonces relevées ; les compteurs vues/favoris |
| moteur `rapprocher_*` | rattacher une commande sans identifiant d'annonce (Leboncoin) |
| `vinted_sync_runs` | file des demandes : nouveaux `kind` `commandes`, `interesses`, (`messages` plus tard) |
| `coin_config`, `profiles.beta_flags`, `platform_health` | ouverture progressive, coupure à distance, pause par plateforme |
| `ebay_accounts` + `sell.fulfillment` | commandes et suivi eBay sans nouveau consentement |
| `orchestrateSale` | inchangé : c'est toujours le vendeur qui confirme la vente et arme les retraits |

### 5.4 Brancher une plateforme par API (Stoolz) sur le même modèle

Chaque plateforme déclare ses **capacités** (lire les commandes, lire le
bordereau, générer le bordereau, lire le suivi, connaître les favoris, offre
native aux favoris, offre dans une conversation, messagerie) et sa **voie**
(`extension` ou `api`). Les écrans lisent ces capacités pour afficher ou
cacher un bouton ; ils ne connaissent pas la plateforme.

Pour Stoolz :
1. un connecteur serveur (fonction edge) qui lit leurs commandes, favoris,
   vues et conversations et écrit **par les mêmes RPC** que l'extension ;
2. une fonction `stoolz-webhook` — selon la règle du dépôt, `verify_jwt =
   false` **et** vérification de la signature de l'émetteur — qui écrit dans
   `evenements_plateforme` puis applique l'événement ;
3. les envois (offre, message) passent par `actions_sortantes` exactement
   comme les autres, avec `voie = api`.

Ce qu'il faut demander à Stoolz, en plus de ce qui est déjà demandé : un
identifiant d'événement unique et une signature sur chaque webhook, les
**quotas** d'envoi qu'ils appliquent, et **si les favoris ont consenti à être
recontactés** (le modèle d'Opla est le bon).

---

## 6. Écrans du cockpit (livrable 3)

### 6.1 « À expédier » — la liste (le cœur du cockpit)

Un onglet (ou le haut de l'onglet Ventes) qui répond à une seule question :
**qu'est-ce que je dois envoyer, et avant quand ?**

- **En tête** : « 3 colis à déposer — dont 1 avant demain ». Rien d'autre.
- **Une carte par commande**, triée par échéance :
  - photo, titre, logo de la plateforme, prix payé ;
  - **l'échéance en clair** : « À déposer avant jeudi 26/09 » (rouge à moins
    de 24 h) ; et, là où la plateforme demande un geste avant le colis, une
    **première échéance** : « Confirme la disponibilité avant ce soir »
    (Leboncoin), « Accepte la commande avant demain 14 h » (Beebs) ;
  - le transporteur et le mode : « Mondial Relay · point relais · QR code » ;
  - **un seul bouton principal**, qui dit ce qu'il fait :
    - bordereau prêt → « **Afficher le QR code** » ou « **Imprimer le
      bordereau** » (le fichier est pris dans la session, au clic) ;
    - bordereau pas encore là → « **Préparer l'envoi sur Vinted** » (ouvre la
      bonne page de la plateforme ; FillSell ne génère rien dans les premiers
      lots) ;
  - en petit : « Voir la commande sur Vinted », « J'ai déposé le colis ».
- **Quatre onglets** : À préparer · Déposés · En route · Livrés (30 jours).
- **Sur ordinateur** : « Imprimer tous les bordereaux prêts » (un seul PDF,
  une page par étiquette).
- **Sur téléphone** : le QR code en plein écran, luminosité au maximum —
  c'est le moment où le vendeur est au point relais (dépend de la question 2).
- **Le lien avec la vente** : dès qu'une commande apparaît, la carte propose
  « **Vendu sur Vinted — retirer les 3 autres annonces ?** » (même geste que
  le bandeau « Vendue ? », mais sur une preuve certaine). Rien ne part sans ce
  clic.

### 6.2 La fiche article › « Intéressés »

Dans la fiche d'un article du Stock, un bloc qui rassemble les plateformes :

- **Une ligne de compteurs par plateforme** (déjà en base) : 👁 vues · ❤
  favoris · 💬 conversations (Leboncoin).
- **La liste des personnes identifiables**, chacune avec sa plateforme, son
  signal et sa fraîcheur : « Opla · a mis en favori · accepte d'être
  recontacté », « Vinted · a mis en favori il y a 2 jours », « Leboncoin · a
  demandé si c'est toujours disponible ». Statut : nouveau · offre envoyée ·
  offre acceptée · a acheté.
- **Les gestes, par ordre de sûreté** :
  1. « **Baisser le prix pour tout le monde** » — Vinted prévient tous les
     favoris, Opla envoie ses alertes de baisse ; aucun message ;
  2. « **Envoyer une offre aux intéressés eBay** » (quand eBay dit l'annonce
     éligible) — l'offre native d'eBay, anonyme ;
  3. « **Faire une offre** » à côté d'une personne précise (Opla, Leboncoin,
     Vinted) ;
  4. jamais de « tout le monde sur toutes les plateformes » en un clic.

### 6.3 Le formulaire d'offre

- Le **prix proposé** avec trois suggestions (−5 %, −10 %, −15 %), la **marge
  qui reste** si le prix d'achat est connu (règle VIDE ≠ ZÉRO : sinon, on
  n'affiche pas de marge), et le **prix plancher** de l'article en dessous
  duquel le bouton se grise.
- **L'aperçu de ce qui va partir, plateforme par plateforme** : « eBay :
  offre aux acheteurs intéressés (anonymes — leur nombre n'est connu
  qu'après l'envoi), valable 2 jours, remise d'au moins 5 % » ; « Opla :
  offre à @x, qui a accepté d'être recontacté » ; « Leboncoin : offre à @y,
  valable 48 h ».
- **Le plafond restant** : « Encore 4 offres Vinted aujourd'hui ».
- **Un bouton « Envoyer »**, validé par le vendeur ; ensuite, pour chaque
  destinataire, l'état réel : envoyée · refusée par la plateforme · en
  attente (plafond) — lu dans le journal, jamais supposé.

### 6.4 Réglages

- **Expédition › Bordereaux** (l'entrée déjà réservée dans `plan.js`) :
  imprimante A4 ou étiquette, QR code préféré quand c'est possible.
- **Automatismes › Offres** : prix plancher par défaut (en % du prix
  affiché), et rien d'automatique tant que Nico n'a pas ouvert cette porte.

### 6.5 Rappels

Un bandeau dans l'app (et une notification quand le push existera) : « 2
colis à déposer aujourd'hui », « Confirme la disponibilité sur Leboncoin
avant 18 h », « Colis livré ». Un éventuel e-mail de rappel passerait par
`envoyerEmail()` (`_shared/desinscription.ts` : désinscription, journal
`email_logs`, un type récurrent protégé hors de l'index one-shot) — jamais par
une fonction `send-*` dédiée (CLAUDE.md).

---

## 7. Plan en lots (livrable 4)

Ordre : **d'abord ce qui sert le plus et ne risque presque rien** (des
lectures, comme la page les fait), ensuite les gestes natifs encadrés par la
plateforme, en dernier ce qui engage le vendeur. Efforts en **jours de
travail**, hors délai d'examen du Chrome Web Store (chaque lot « extension »
n'atteint le parc qu'au paquet suivant — un push ne déploie pas l'extension).
Tout lot passe derrière un drapeau (`profiles.beta_flags`), Nico d'abord.

| Lot | Contenu | Valeur vendeur | Risque | Effort | Paquet CWS |
|---|---|---|---|---|---|
| **0 — Décisions et preuves** | réponses aux questions du § 11 ; une vraie vente observée sur Vinted, Leboncoin et eBay (§ 9) ; textes CGU / Legal / fiche CWS / § 8.5 eBay rédigés | — (débloque tout) | nul | 1 j + le temps des ventes de test | non |
| **1 — « À expédier » en lecture** | tables `commandes`, `commande_articles`, `expeditions` ; relevé des commandes **en cours** : Vinted (`my_orders` `in_progress` → conversation, transaction, transporteur, échéance), Leboncoin (`step=in_progress` → `prepare-parcel`, `track-and-trace`), eBay par le serveur (`getOrders` : `NOT_STARTED`/`IN_PROGRESS`, `shipByDate` ; notification `ORDER_CONFIRMATION`, déjà consentie, pour le voir tout de suite) ; écran liste + « Préparer l'envoi sur la plateforme » ; proposition de retrait des copies depuis la carte | **très haute** : plus aucune échéance ratée, un seul endroit, et la vente est prouvée tout de suite | **R0-R1** | 6-8 j | oui (eBay : non, il part au push) |
| **2 — Le bordereau en un clic** | « Imprimer / Afficher le QR » pour un bordereau **déjà prêt** : Vinted (`pdf_label`, `label_url`, `digital_label`, code de dépôt), Leboncoin (`label_url` avec le jeton de la page) ; lot d'impression ; téléphone selon la question 2 | haute | R1 (Vinted compte l'ouverture — souhaitable) | 3-4 j | oui |
| **3 — Le suivi jusqu'à la livraison** | Vinted `journey_summary`, Leboncoin `parcels/<id>/status` + état de la transaction (le statut du colis seul ment), eBay `shipping_fulfillment` (n° de suivi posé par un bordereau eBay ou par le vendeur) ; rappels J-1, « livré » | moyenne-haute | R0 | 3 j | oui |
| **4 — L'offre eBay aux intéressés** | `find_eligible_items` puis `send_offer_to_interested_buyers`, **côté serveur**, sur validation du vendeur, journal `actions_sortantes` et plafonds en base ; compteur de suivis par l'API Trading | moyenne | **R1** (natif, anonyme, encadré par eBay) | 2-3 j | **non** |
| **5 — « Intéressés » en lecture** | table `interesses` ; Opla (`/me/articles/<id>/favoriters`), Vinted (notifications type 20, relevé au moins hebdomadaire), Leboncoin (conversations « s'intéresse » + compteurs `Messages`/`Replies` déjà servis) ; bloc « Intéressés » de la fiche article | moyenne | R1 | 4-5 j | oui |
| **6 — L'offre à une personne, validée** | Opla (offre native au favori qui l'accepte), Leboncoin (offre native au favori qui a choisi de prévenir / dans la conversation), Vinted (offre dans une conversation, une par une, jamais plus de 4 destinataires par annonce et par jour) ; même journal, mêmes plafonds | moyenne | **R2** | 5-7 j | oui |
| **7 — Opla et Beebs dans la liste** | après une première vente observée sur chacun (Opla : Nico reconnecté) | selon l'usage réel du parc | R1 | 2-4 j | oui |
| **8 — Générer le bordereau depuis FillSell** | Leboncoin (confirmer la disponibilité, infos Colissimo), Beebs (**accepter la commande**), Vinted (l'étape « commander l'étiquette » si elle existe) ; double confirmation, mêmes choix que la plateforme | moyenne | **R2** (irréversible) | 4-6 j | oui |
| **9 — Stoolz par API** | connecteur + `stoolz-webhook` + mêmes tables | selon Stoolz | R0-R1 | 3-5 j dès leur documentation | non |
| **Plus tard** | messagerie unifiée en lecture (base de l'IA, § 10) | — | R1 + confidentialité | 5-8 j | oui |
| **Jamais** | envoyer en série, sans validation, à des personnes qui n'ont rien demandé | — | R3, et contraire aux CGU de Vinted, Leboncoin, eBay, Opla | — | — |

Remarques :
- Les lots 1, 2 et 3 peuvent partir **dans le même paquet d'extension** (un
  seul examen CWS), en commits séparés — et en **un seul push** (règle du
  dépôt).
- Le lot 4 (eBay) est le seul « envoi » qui peut sortir sans paquet
  d'extension, et le moins risqué : c'est le bon premier test grandeur nature
  du journal et des plafonds.
- Aucun lot n'ajoute d'hôte au manifest : pas de réactivation forcée de
  l'extension chez le parc.

---

## 8. Risques plateforme et garde-fous

### 8.1 Le risque, action par action

| Action | Vinted | Leboncoin | eBay | Beebs | Opla | Pourquoi |
|---|---|---|---|---|---|---|
| Lire la liste des commandes | R0 | R0 | R0 (API) | R0 | R0 | la page fait le même appel |
| Lire une commande, son transporteur, son suivi | R0-R1 | R0-R1 | R0 (API) | R1 | R1 | 2 à 4 appels par commande en cours, rien de plus que le vendeur qui ouvre sa conversation |
| Aller chercher le fichier du bordereau | R1 | R1 | — | R1 | R1 | Vinted compte l'ouverture (souhaitable) ; au clic seulement |
| Lire les notifications / favoris | R1 | R1 | — | — | R1 | un appel par relevé ; Vinted les efface après 7 jours |
| Lire la messagerie | R1 | R1 | décision | R1 | R1 | volume + correspondance privée (RGPD) |
| **Générer** un bordereau | R2 | R2 | — | **R2 (accepte la commande)** | — | irréversible, choix du dépôt ou de l'enlèvement |
| Marquer « expédié » | R2 | R2 | R1 (API) | — | — | déclaration ; Leboncoin pro : perdre l'accès au bon d'envoi |
| Offre à **une** personne qui a un signal | R2 | R2 | — | — | R1-R2 | natif, mais depuis un outil externe |
| Offre eBay aux intéressés | — | — | R1 | — | — | natif, anonyme, eBay borne tout |
| Offres / messages **en série** | **R3** | **R3** | interdit | R2-R3 | R2-R3 | CGU Vinted (≥ 5 destinataires), messagerie LBC bloquée pour messages répétitifs, licence eBay, CGU Opla art. 9 |

### 8.2 Ce que les plateformes écrivent, et qu'on ne doit pas oublier

- **Vinted** interdit les outils logiciels externes, y compris pour mettre des
  favoris, « à moins qu'une telle utilisation ne soit autorisée… par nous »,
  et les messages « de masse à 5 Utilisateurs ou plus ». Le risque
  contractuel **existe déjà** pour la publication et la republication que
  FillSell fait aujourd'hui ; les **lectures** du cockpit ne l'augmentent
  guère (elles font ce que fait la page), les **envois** l'augmentent
  nettement.
- **Leboncoin** bloque la messagerie pour messages répétitifs ; interdit les
  robots (CGU lues en extrait seulement).
- **eBay** interdit les communications non sollicitées (licence § 8.2(d)) et
  n'autorise que l'offre aux intéressés, qu'il encadre.
- **Opla** : « ne pas utiliser des outils automatisés non autorisés » (CGU
  art. 9), barème avertissement → suspension 7 à 30 jours → définitive
  (pour les annonces).
- **Beebs** : CGU illisibles ; la modération est automatique.

### 8.3 Les seuils (proposés — à valider par Nico, à recalibrer sur mesure)

Aucun seuil de plateforme n'est publié. Les chiffres ci-dessous sont des
**propositions** (DÉDUIT), prudentes par construction, tenues **en base** par
`reserver_action_sortante()` et modifiables sans paquet d'extension.

**Lectures**
- Commandes en cours : au plus **un relevé par plateforme et par heure**, et
  seulement s'il y a une vente en cours ou un signal de vente ; sinon, avec le
  relevé quotidien existant. Au bouton : pas plus d'un toutes les 15 min
  (cadence déjà en place pour les relevés).
- Détail : au plus **5 commandes par passage**, 1 à 3 s entre deux appels.
- Notifications Vinted : **au plus une fois par heure**, au moins une fois par
  semaine (fenêtre de 7 jours).
- Fichier de bordereau : **uniquement au clic** du vendeur.
- Jamais depuis le service worker ; toujours depuis l'onglet de travail
  (DataDome).

**Envois** (aucun n'existe avant le lot 4)
- **Toujours validés par le vendeur**, destinataire par destinataire (ou une
  liste nominative affichée et validée d'un geste).
- **Seulement vers quelqu'un qui a donné un signal** : favori récent,
  conversation ouverte, consentement Opla. Jamais vers une personne sans
  signal.
- Vinted : **≤ 4 destinataires différents par annonce et par jour** (sous le
  seuil « 5 utilisateurs » des CGU), **≤ 10 offres par jour et par compte**,
  **≥ 3 min** entre deux envois, jamais plus de 3 dans l'heure.
- Leboncoin : ≤ 10 offres par jour et par compte, ≥ 3 min, et **jamais deux
  fois le même texte** (motif « messages répétitifs »).
- Opla : ≤ 20 offres par jour.
- eBay : les limites d'eBay (une offre par annonce tant qu'elle court).
- **Disjoncteur** : au premier 403, 429, page anti-robot (`CHALLENGE`), page
  de restriction, message « activité automatisée » ou blocage de messagerie :
  **plus aucun envoi sur cette plateforme jusqu'au lendemain**, et le vendeur
  est prévenu. Un compte restreint dans les **7 derniers jours** n'envoie rien.
- **Coupures** : interrupteur général et par plateforme en base
  (`coin_config`, `platform_health`), relus à chaque passage.

### 8.4 Données personnelles

Le cockpit fait entrer dans FillSell des données de **tiers** (acheteurs,
intéressés) : pseudos, identifiants, et — dans le fichier du bordereau —
nom et adresse. Règles proposées :
- ne stocker que l'identifiant et, si Nico le décide, le pseudo ;
- ne jamais stocker d'adresse ;
- le fichier du bordereau : lu à la demande, ou gardé chiffré jusqu'à la
  livraison + 7 jours au plus (question 2) ;
- purge des `interesses` après 30 jours sans signal ;
- mise à jour des conditions (Legal.jsx § 8), de la fiche Chrome Web Store
  (rubrique « pratiques de confidentialité » : la messagerie y est une
  catégorie à part) et du § 8.5 eBay.

---

## 9. Ce qu'il faudrait pour prouver le reste

Tout ce qui est marqué OBS-C, DOC ou DÉDUIT pour une vente **en cours** reste
à voir en vrai. Aucune supposition n'a comblé ces trous. Voici exactement ce
qu'il faudrait, plateforme par plateforme. Dans chaque cas : **c'est Nico qui
fait les gestes qui engagent** (confirmer, générer, expédier) ; Claude ne fait
que des lectures GET, avant et après chaque geste.

| Plateforme | Il faut | Ce qu'on observe alors |
|---|---|---|
| **Vinted** | une vraie vente sur le compte de Nico (un petit article acheté par un proche ou un second compte, transporteur le moins cher) | `my_orders` `in_progress` ; `available_actions` de la transaction ; **le bordereau existe-t-il avant tout geste** (`label_url`, `pdf_label`, `digital_label`) ou faut-il l'étape `shipment/order` ? `label_options` ; la date limite ; `journey_summary` pendant le transport ; le fichier après livraison (expire-t-il ?) |
| **Vinted (favori)** | un second compte met un article de Nico en favori (sans message) | la notification type 20 : `user_id`, `subject_id`, `link` (mène-t-il à `/inbox/want_it` ?) ; délai d'apparition ; regroupement |
| **Leboncoin** | une vraie vente avec paiement sécurisé, Mondial Relay de préférence | `step` avant / après **la confirmation de disponibilité (faite par Nico)** ; `prepare-parcel` avant / après ; le fichier en 200 pendant la vente ; l'e-mail QR ; `parcels/<id>/status` jusqu'à la livraison ; quand le fichier passe en 404 |
| **Leboncoin (favori)** | un second compte met une annonce de Nico en favori en choisissant de prévenir | est-ce bien la conversation « s'intéresse » ? quel identifiant de personne ? le bouton « Faire une offre » vise-t-il ce `buyer_id` ? |
| **eBay** | une vraie commande sur le compte relié (`nelsonthecat`) | les champs de `getOrders` pour une commande non expédiée (`shipByDate`, service choisi par l'acheteur) ; puis, si Nico achète un bordereau dans eBay, l'apparition du suivi dans `shipping_fulfillment` |
| **eBay (offre)** | le GO de Nico pour **une** vraie offre sur **une** des 5 annonces éligibles | la réponse de `send_offer_to_interested_buyers` (nombre de destinataires, durée, erreurs de plafond) — c'est un envoi réel à de vrais acheteurs : **interdit dans cet audit** |
| **Beebs** | une première vente | la page de commande web, les appels à `shipping-api.beebs.app`, l'échéance de 48 h ; la page favoris existe-t-elle sur le web ? |
| **Opla** | **Nico se reconnecte lui-même** (Claude ne se connecte jamais à sa place), puis une première vente | `GET /me/favoriters/summary`, `/me/articles/<id>/favoriters` (forme, anonymes, consentement) ; `/me/checkouts` d'une vente : où sont l'étiquette, le QR, le suivi |
| **Stoolz** | leur documentation et un accès de test | tout |

⚠️ Deux défauts de connaissance à lever en même temps :
- le compte eBay ouvert dans Chrome n'est pas le compte relié à FillSell
  (`nelsonthecat`) : il faudra dire au vendeur **quel compte** le cockpit
  suit, sur toutes les plateformes (on retrouve la question des
  multi-boutiques Vinted) ;
- les ventes en main propre n'apparaissent dans aucune liste de commandes
  (Leboncoin l'écrit ; c'est vrai partout) : elles n'ont rien à expédier et
  restent au bandeau « Vendue ? ».

---

## 10. Pour plus tard : négociation par IA et réponses automatiques

Hors périmètre aujourd'hui. Ce qui les rendrait possibles, dans l'ordre :

1. **Lire et ranger la messagerie** (tables `conversations` et `messages`),
   avec l'accord de Nico sur la conservation de correspondance privée. Les
   appels existent sur Vinted (`/api/v2/inbox`, conversations, réponses),
   Leboncoin (proxy de messagerie), Beebs (`/chats/v3`), Opla (`/me/chats`) ;
   eBay exige l'accès `commerce.message` (reconsentement de chaque vendeur
   relié, et nos conditions à changer).
2. **Lire les offres reçues** : Vinted (notification 121 « offre au
   vendeur »), Leboncoin (`negotiation-front-api` : `show-offer`, accepter,
   refuser), Opla (`/me/offers`), Beebs (contre-offres), eBay (Offre directe
   par la Trading API `GetBestOffers`/`RespondToBestOffer` ; le sujet de
   notification `OFFER_ACTIVITY`, annoncé par eBay, **n'apparaît pas** dans la
   liste réelle des sujets relevée le 24/09 — OBS-R).
3. **Un prix plancher par article** (réglage « Automatismes » déjà annoncé
   dans `plan.js`) et une **marge fiable** : prix d'achat connu, règle
   VIDE ≠ ZÉRO (`src/utils/comptabilite.js`).
4. **Le journal `actions_sortantes`** avec le résultat de chaque offre
   (acceptée, refusée, vendue, rien) : c'est la matière qui permet d'apprendre
   quelle remise marche.
5. **Un mode « proposé par l'IA, validé par toi »** avant tout mode
   automatique ; l'automatique seulement dans des règles écrites par le
   vendeur (remise max, horaires, plateformes).
6. **Le premier pas « auto-négociation » existe déjà chez eBay, sans IA et
   sans risque** : les seuils d'acceptation et de refus automatiques des
   offres directes (`bestOfferTerms.autoAcceptPrice` / `autoDeclinePrice` de
   l'Inventory API, déjà consentie). Rien d'équivalent trouvé sur les autres
   plateformes.
7. **Le cadre** : la licence eBay interdit de verser des données de
   certaines API « restreintes » dans une IA tierce sans accord écrit
   (§ 8.5(b)(i)) ; envoyer des messages d'acheteurs à un modèle d'IA demande
   une base RGPD claire (sous-traitance, minimisation) ; les CGU des
   plateformes visent les « outils automatisés » — une réponse automatique
   est un outil automatisé.
8. **Le temps réel** : Vinted pousse ses messages par websocket
   (`websocket_user_id`, OBS-R) ; Leboncoin et Opla ont des compteurs de
   non-lus ; eBay a `NEW_MESSAGE`/`BUYER_QUESTION` (accès messagerie requis).
   Une réponse automatique « dans la minute » voudrait dire interroger ces
   compteurs souvent : c'est un coût de risque à mesurer avant de le promettre.

---

## 11. Questions à trancher par Nico (livrable 5)

1. **Les acheteurs.** Aujourd'hui FillSell s'interdit toute donnée
   d'acheteur, et nos conditions le promettent. Pour la liste « À expédier »
   et pour les favoris, on garde **le pseudo et l'identifiant** de la
   personne sur la plateforme (et rien d'autre, jamais d'adresse), ou on
   reste **sans aucun nom** ? Sans nom : la carte dira « Vinted — Robe bleue —
   28 € » sans dire pour qui, et **il n'y a plus de liste d'intéressés** (on
   ne peut pas faire d'offre à quelqu'un qu'on n'a pas noté).
2. **Le bordereau sur le téléphone.** Pour montrer le QR code au point relais
   depuis l'app mobile, il faut garder une copie du bordereau chez nous
   quelques jours (il porte le nom et l'adresse de l'acheteur). On la garde
   (effacée 7 jours après la livraison), ou le bordereau ne s'ouvre que sur
   l'ordinateur ?
3. **Les envois.** Une offre ou un message part-il **toujours après ton clic,
   personne par personne** (recommandé), ou veux-tu aussi un bouton
   « envoyer à tous les intéressés » — liste affichée, plafonds tenus ?
4. **Vinted.** Veux-tu qu'on propose les offres aux favoris Vinted depuis
   FillSell, même une par une et validées, sachant que leurs conditions
   interdisent les outils externes et les envois à 5 personnes ou plus, et
   qu'une vague de restrictions « activité automatisée » tourne depuis
   juillet ? Ou, sur Vinted, on s'en tient à **la baisse de prix** (qui
   prévient tous les favoris, sans aucun message) ?
5. **eBay d'abord ?** L'offre aux acheteurs intéressés d'eBay marche avec
   l'accès que les vendeurs ont déjà donné (vérifié sur ton compte : 5
   annonces éligibles). On peut la sortir en premier, côté serveur, sans
   nouvelle version de l'extension. Il faut seulement modifier nos conditions
   (§ 8.5 : on y promet de lire les commandes « pour détecter une vente »).
   D'accord ?
6. **La messagerie eBay.** On garde l'interdiction de l'accès « messagerie »
   (donc pas de messages eBay dans FillSell), ou on l'ajoute un jour — en
   sachant que **chaque vendeur eBay relié devra se reconnecter** ?
7. **Générer les bordereaux depuis FillSell.** On commence par montrer
   seulement ce que les plateformes ont déjà préparé, et on remet à plus tard
   le fait de générer — d'accord ? (Rappel : chez Beebs, générer le bordereau
   = accepter la commande et faire payer l'acheteur.)
8. **Des ventes de test.** Pour prouver la partie « bordereau d'une vente en
   cours », il faut une vraie vente sur Vinted, Leboncoin et eBay (un petit
   article acheté par un proche ou un second compte), et un favori posé par un
   second compte. Tu peux en organiser ?
9. **Opla.** Tu étais déconnecté d'Opla. Peux-tu te reconnecter toi-même, pour
   qu'on regarde « Qui aime mes articles » en lecture ? (Je ne me connecte
   jamais à ta place.)
10. **L'ordre.** Commencer par « À expédier » en lecture (Vinted, Leboncoin,
    eBay), puis le bordereau en un clic, puis le suivi — et l'offre eBay en
    parallèle parce qu'elle ne dépend pas de l'extension. D'accord ?
11. **Stoolz.** En plus de ce qui est demandé, leur réclamer : une signature
    et un identifiant unique sur chaque webhook, leurs plafonds d'envoi, et
    la garantie que les favoris ont accepté d'être recontactés (comme Opla).
12. **Qui voit le cockpit en premier ?** Toi seul, puis une liste — qui ?

*Hors sujet, pour mémoire* : un fichier de migration non suivi
(`supabase/migrations/20260924233000_email_logs_user_id_depuis_adresse.sql`)
était présent dans l'arbre au début de l'audit ; il n'a été ni lu, ni
modifié, ni commité.

---

## Annexe — Appels relevés, par plateforme

« Engage » = le geste change quelque chose chez la plateforme ou pour
l'acheteur. Aucun appel qui engage n'a été fait pendant l'audit.

**Vinted** (`www.vinted.fr/api/v2/…` sauf mention ; `api.vinted.fr` = passerelle)

| Appel | Méthode | Preuve | Engage |
|---|---|---|---|
| `my_orders?type=sold&status=…` (`all`, `in_progress`, `completed`, `cancelled`) | GET | OBS-R | non |
| `conversations/<id>` | GET | OBS-R | non |
| `transactions/<id>` | GET | OBS-R | non |
| `transactions/<id>/shipping_instructions` | GET | OBS-R | non |
| `shipments/<id>` | GET | OBS-R | non |
| `transactions/<id>/shipment/journey_summary` | GET | OBS-R | non |
| `shipments/<id>/label_options` | GET | OBS-C | non |
| `transactions/<id>/shipment/order` | PUT | OBS-C | **oui** |
| `shipments/<id>/label_url` | GET | OBS-C | non (compté comme ouvert) |
| `transactions/<id>/shipment/pdf_label` | GET | OBS-C | non (idem) |
| `transactions/<id>/shipment/digital_label` | GET | OBS-C | non (idem) |
| `transactions/<id>/shipment/parcel_collection_code(_pdf)` | GET | OBS-C | non |
| `shipments/<id>/nearby_drop_off_points`, `collection_dates` | GET | OBS-C | non |
| `transactions/<id>/shipment/mark_as_shipped` | PUT | OBS-C | **oui** |
| `escrow-order-fulfilment/app/v1/escrow_orders/<id>/shipment_journey` | GET | OBS-C | non |
| `escrow-order-fulfilment/app/v1/escrow_orders/<id>/actions` (annuler, prolonger, changer de mode, expédié) | — | OBS-C | **oui** |
| `wardrobe/<user>/items` (vues, favoris) | GET | OBS-R (déjà utilisé) | non |
| `api.vinted.fr/inbox-notifications/v1/notifications` | GET | OBS-R | non |
| `inbox?page&per_page` | GET | OBS-R | non |
| `transactions/<id>/offers/seller_options` | GET | OBS-R | non |
| `transactions/<id>/offers` | POST | OBS-C | **oui** |
| `conversations` (création) | POST | OBS-C | **oui** |
| `conversations/<id>/replies` | POST | OBS-C | **oui** |
| page `/inbox/want_it?receiver_id&item_id` | — | OBS-C | (ouvre un brouillon de conversation) |

**Leboncoin** (`api.leboncoin.fr/api/…`, jeton `luat` de la page)

| Appel | Méthode | Preuve | Engage |
|---|---|---|---|
| `consumergoods/proxy/v3/pages/transactions?…&user_kind=seller` | GET | OBS-R (déjà utilisé) | non |
| `consumergoods/proxy/v1/pages/prepare-parcel/<purchase_id>` | GET | OBS-R | non |
| `shippingproxy/v1/parcels/<id>/label` | GET | OBS-R (404 après la vente) | non |
| `shipping/v1/parcels/<id>/label/url` | GET | OBS-R | non |
| `shipping/v1/parcels/<id>/status` | GET | OBS-R | non |
| `consumergoods/proxy/v1/pages/track-and-trace/<purchase_id>` | GET | OBS-R | non |
| `shippingproxy/v1/pick_up_drop_off_points` | GET | OBS-C | non |
| `shipping/v1/parcels/<id>/sender/colissimo` et `/courriersuivi` | POST | OBS-C | **oui** |
| `consumergoods/proxy/v1/purchases/<id>/confirm-shipment` | POST | OBS-C | **oui** |
| `…/purchases/<id>/action/refund-purchase-delivery-expired` | — | OBS-C | **oui** |
| `dashboard/v1/search` (stats vues, favoris, messages…) | POST (lecture) | OBS-C (déjà utilisé) | non |
| `negotiation-front-api/v1/page/send-offer/ad/<id>` | GET | OBS-R | non |
| `negotiation-front-api/v1/page/send-offer` | POST | OBS-C | **oui** |
| `negotiation-front-api/v1/offers/<id>/seller-accept`, `buyer-accept`, `decline-offer` | PUT | OBS-C | **oui** |
| `followme/v1/follower-targeting/eligibility`, `follower-targeting-api/v1/core-data` | GET | OBS-R | non |
| `follower-targeting-api/v1/messages` | POST | OBS-C | **oui** |
| `messaging/proxy/api/v1/hal/<user>/conversations/<id>/messages` | GET/POST | OBS-C | POST = oui |

**eBay** (`api.ebay.com`, jeton OAuth du compte relié)

| Appel | Méthode | Preuve | Engage |
|---|---|---|---|
| `sell/fulfillment/v1/order` | GET | OBS-R (déjà utilisé) | non |
| `sell/fulfillment/v1/order/<id>/shipping_fulfillment` | GET | DOC | non |
| `sell/fulfillment/v1/order/<id>/shipping_fulfillment` | POST | DOC | **oui** (marque expédié) |
| `sell/negotiation/v1/find_eligible_items` (EBAY_FR) | GET | **OBS-R** | non |
| `sell/negotiation/v1/send_offer_to_interested_buyers` | POST | DOC | **oui** |
| `commerce/notification/v1/topic` | GET | OBS-R | non |
| Trading `GetMyeBaySelling` (nombre de suivis) | POST (lecture) | OBS-R | non |
| `sell/logistics/v1_beta/*` (étiquettes) | — | DOC : US seulement | — |
| `commerce/message/v1/*` | — | DOC : scope non détenu | — |

**Beebs** : `shipping-api.beebs.app`, `chat-api.beebs.app` (`/chats/v3…`),
`marketplace.api.beebs.app` — hôtes et routes de messagerie OBS-C ; parcours
d'envoi non observé.

**Opla** (`www.opla.co/api/public/…`, session requise)

| Appel | Méthode | Preuve | Engage |
|---|---|---|---|
| `me/checkouts`, `me/checkouts/<id>` | GET | OBS-C (déjà codé dans le relevé des ventes) | non |
| `me/favoriters/summary`, `me/articles/<id>/favoriters` | GET | OBS-C | non |
| `me/articles/<id>/favoriters/<userId>/offer` | POST | OBS-C | **oui** |
| `me/offers` (`chatId`, `offeredPriceCents`) | POST | OBS-C | **oui** |
| `me/chats`, `me/chats/<id>/messages` | GET/POST | OBS-C | POST = oui |
| `me/notifications` | GET | OBS-C | non |
| `me/articles/<id>/reduction`, `me/dressing-promo` | — | OBS-C | **oui** |
