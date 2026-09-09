# Dossier eBay — 09/09/2026 (« on ferme le dossier »)

Trois pièces, dans l'ordre demandé. **Rien n'est codé ni publié** : les textes
attendent la validation de Nico, le plan attend un GO, les 11 jobs attendent
un GO. Chaque chiffre ci-dessous a été lu en base le 09/09 vers 18 h 30.

---

## 1. Textes juridiques et mentions du site — À VALIDER

### Ce qui est faux ou incomplet aujourd'hui

| Où | Ce qui est écrit | Pourquoi c'est faux depuis le 05-06/09 |
|---|---|---|
| Legal § 8.2 | « Vos identifiants des plateformes (Vinted, Leboncoin…) ne sont jamais lus ni stockés » | Pour un compte eBay **relié**, FillSell stocke des jetons OAuth eBay (`ebay_accounts.access_token` / `refresh_token`, 18 mois) côté serveur. Ce ne sont pas des identifiants, mais c'est un accès délégué stocké — il faut le dire. |
| Legal § 8 intro, § 8.4 | Tout passe par « l'extension, dans votre navigateur » | Pour un compte relié, publication **et** retrait eBay partent de nos serveurs (ebay-api-worker), sans Chrome. 7 comptes reliés, 18 annonces en ligne par cette voie. |
| Legal § 4.2 | Aucune ligne sur la connexion eBay | Données reçues d'eBay : identifiant vendeur, jetons, état du compte vendeur (politiques, inscription). |
| Legal § 4.6 | Suppression de compte FillSell seulement | eBay nous notifie aussi la suppression d'un compte **eBay** (ebay-account-deletion) et nous effaçons alors la ligne `ebay_accounts`. Engagement pris auprès d'eBay, à écrire noir sur blanc. |
| /extension, étape 3 | « Connecte-toi ensuite à tes comptes Vinted, Leboncoin, Beebs et eBay dans ton navigateur » | eBay se relie depuis l'app (Réglages › Compte eBay) quand on veut publier sans Chrome ; la session ebay.fr ne sert plus qu'à la voie extension. |

Le tableau § 8.3 (host_permissions `*.ebay.fr` / `*.ebay.com`) reste **vrai** :
la voie extension existe toujours pour les comptes non reliés.

### Textes proposés (FR puis EN) — copier tels quels après validation

**§ 4.2 Données collectées — nouvelle puce, après « Données d'authentification tierce »**

> **Connexion eBay (optionnel) :** si vous reliez votre compte eBay à FillSell (Réglages › Compte eBay), eBay nous transmet, avec votre accord explicite sur sa page de consentement, un identifiant de votre compte vendeur et des jetons d'accès (OAuth) qui nous autorisent à publier, mettre à jour et retirer vos annonces eBay, à lire l'état de votre compte vendeur (inscription, conditions de vente, de livraison et de retour) et à lire vos commandes eBay pour détecter vos ventes. FillSell ne reçoit jamais votre mot de passe eBay. Ces jetons sont stockés chiffrés sur nos serveurs, utilisés uniquement pour ces opérations, et supprimés dès que vous déconnectez votre compte eBay ou supprimez votre compte FillSell.

> **eBay connection (optional):** if you link your eBay account to FillSell (Settings › eBay account), eBay sends us — with your explicit consent on its own consent page — an identifier of your seller account and access tokens (OAuth) that allow us to publish, update and withdraw your eBay listings, read the state of your seller account (registration, selling, shipping and return policies) and read your eBay orders to detect your sales. FillSell never receives your eBay password. These tokens are stored encrypted on our servers, used only for those operations, and deleted as soon as you disconnect your eBay account or delete your FillSell account.

*(« stockés chiffrés » : vrai au niveau du disque Supabase (chiffrement au repos), pas d'un chiffrement applicatif en plus. Si tu préfères ne pas t'engager sur ce mot, remplacer par « stockés sur nos serveurs ».)*

**§ 8 intro — remplacer la phrase actuelle**

> FillSell propose une **extension Chrome** optionnelle qui publie les annonces générées dans FillSell sur les plateformes de vente (Vinted, Leboncoin, eBay, Beebs), vérifie leur statut et peut les retirer après confirmation d'une vente (voir 8.4). Son installation et son utilisation sont entièrement facultatives. **Pour eBay, une seconde voie existe : si vous reliez votre compte eBay à FillSell (voir 8.5), la publication et le retrait s'exécutent depuis nos serveurs, sans passer par l'extension.**

> FillSell offers an optional **Chrome extension** that publishes the listings you generate in FillSell onto the marketplaces where you sell (Vinted, Leboncoin, eBay, Beebs), checks their status, and can withdraw them after you confirm a sale (see 8.4). Installing and using it is entirely optional. **For eBay, a second path exists: if you link your eBay account to FillSell (see 8.5), publishing and withdrawal run from our servers, without going through the extension.**

**§ 8.2, deuxième puce — remplacer**

> Vos identifiants des plateformes (Vinted, Leboncoin, Beebs, eBay) ne sont jamais lus ni stockés : l'extension agit dans la session que vous avez déjà ouverte dans votre navigateur. Seul un compte eBay **relié** (8.5) donne lieu à un accès délégué stocké côté serveur — des jetons OAuth, jamais votre mot de passe.

> Your marketplace credentials (Vinted, Leboncoin, Beebs, eBay) are never read or stored: the extension acts within the session you have already opened in your browser. Only a **linked** eBay account (8.5) involves a delegated access stored server-side — OAuth tokens, never your password.

**§ 8.4 Retrait automatisé — phrase à ajouter en fin de paragraphe**

> Pour un compte eBay relié (8.5), ce retrait est exécuté depuis nos serveurs par l'API eBay, avec la même règle : jamais sans votre confirmation de la vente dans l'application.

> For a linked eBay account (8.5), this withdrawal is performed from our servers through the eBay API, under the same rule: never without your confirmation of the sale in the app.

**§ 8.5 — nouvelle sous-section, avant le paragraphe « Vous pouvez retirer l'extension… »**

> **8.5 Compte eBay relié (API eBay)**
>
> Vous pouvez relier votre compte eBay à FillSell depuis Réglages › Compte eBay. La connexion se fait sur la page de consentement d'eBay (OAuth 2.0) : vous y voyez la liste exacte des accès demandés et pouvez refuser. FillSell ne voit jamais votre mot de passe eBay.
>
> **Accès demandés et finalités.** Publier, mettre à jour et retirer vos annonces (inventaire et offres eBay) ; lire l'état de votre compte vendeur et vos conditions de vente, de livraison et de retour, pour vérifier que votre compte peut publier ; lire vos commandes, pour détecter une vente et vous proposer le retrait des annonces jumelles sur les autres plateformes ; recevoir les notifications eBay relatives à votre compte. Aucun autre accès (messagerie, paiements, données d'acheteurs au-delà de la commande) n'est demandé.
>
> **Ce qui s'exécute côté serveur.** Pour un compte relié, la publication et le retrait de vos annonces eBay sont exécutés par les serveurs de FillSell, sans l'extension et sans que votre ordinateur soit allumé. Chaque opération correspond à une action que vous avez déclenchée dans l'application (publier, confirmer une vente).
>
> **Jetons stockés.** Les jetons d'accès remis par eBay sont stockés sur nos serveurs (hébergés dans l'Union européenne), avec la liste des accès consentis et l'état de votre compte vendeur. Ils ne sont ni vendus ni partagés, et ne servent à aucune autre finalité.
>
> **Déconnexion et effacement.** Vous pouvez déconnecter votre compte eBay à tout moment depuis Réglages › Compte eBay : les jetons sont supprimés immédiatement de nos serveurs et FillSell perd tout accès à votre compte eBay. Vous pouvez aussi révoquer l'accès depuis votre compte eBay (Paramètres du compte › Applications tierces). La suppression de votre compte FillSell (4.6) efface ces jetons avec le reste de vos données.
>
> **Suppression de votre compte eBay.** FillSell est abonné aux notifications de suppression de compte d'eBay : si vous supprimez votre compte eBay, eBay nous en informe et nous effaçons alors automatiquement les données de connexion eBay associées, sans action de votre part. Vos annonces, ventes et articles restent dans FillSell.

> **8.5 Linked eBay account (eBay API)**
>
> You can link your eBay account to FillSell from Settings › eBay account. The connection happens on eBay's own consent page (OAuth 2.0): it lists the exact accesses requested and you can decline. FillSell never sees your eBay password.
>
> **Accesses requested and purposes.** Publish, update and withdraw your listings (eBay inventory and offers); read the state of your seller account and your selling, shipping and return policies, to check that your account can publish; read your orders, to detect a sale and offer to withdraw the twin listings on the other marketplaces; receive eBay notifications about your account. No other access (messages, payments, buyer data beyond the order) is requested.
>
> **What runs server-side.** For a linked account, publishing and withdrawing your eBay listings are performed by FillSell's servers, without the extension and without your computer being on. Each operation matches an action you triggered in the app (publish, confirm a sale).
>
> **Stored tokens.** The access tokens issued by eBay are stored on our servers (hosted in the European Union), together with the list of consented accesses and the state of your seller account. They are neither sold nor shared, and serve no other purpose.
>
> **Disconnection and erasure.** You can disconnect your eBay account at any time from Settings › eBay account: the tokens are deleted from our servers immediately and FillSell loses all access to your eBay account. You can also revoke the access from your eBay account (Account settings › Third-party apps). Deleting your FillSell account (4.6) erases these tokens with the rest of your data.
>
> **Deletion of your eBay account.** FillSell subscribes to eBay's account-deletion notifications: if you delete your eBay account, eBay informs us and we then automatically erase the associated eBay connection data, with no action on your part. Your listings, sales and items remain in FillSell.

*Vérifié dans le code avant d'écrire : `ebay-account` (déconnexion) supprime la ligne `ebay_accounts` et remet `profiles.ebay_voie_api = false` ; `ebay-account-deletion` répond au défi SHA-256 d'eBay et supprime la ligne par `ebay_eias_token` ou `ebay_user_id`, verdict journalisé dans `ebay_notification_verdicts`. La révocation côté eBay (Applications tierces) n'est pas encore détectée avant le prochain appel (401 → compte marqué « à reconnecter ») — le texte ne promet rien de plus.*

**/extension, étape 3 « Connecte-toi » — remplacer la 2e phrase**

> Connecte-toi ensuite à tes comptes Vinted, Leboncoin et Beebs dans ton navigateur, comme d'habitude — l'extension utilise ces sessions actives pour publier à ta place. Pour eBay, relie ton compte depuis l'app (Réglages › Compte eBay) : tes annonces eBay partent alors de nos serveurs, même ordinateur éteint.

> Then log in to your Vinted, Leboncoin and Beebs accounts in your browser as usual — the extension uses these active sessions to list on your behalf. For eBay, link your account from the app (Settings › eBay account): your eBay listings then go out from our servers, even with your computer off.

**Landing / écran d'accroche extension** — « FillSell publie sur Vinted, Leboncoin, eBay et Beebs avec tes comptes » reste vrai (avec tes comptes, relié ou en session). Je ne propose pas d'y toucher.

---

## 2. Détection des ventes eBay par l'API — PLAN (rien codé)

### État réel (lu en base le 09/09)

| Fait | Valeur |
|---|---|
| Annonces eBay en ligne par la voie API | 18 (Ornella 12, Nico 4, Micka 2), toutes avec `platform_fields.ebay_api.offer_id` et `platform_listing_id` |
| Annonces eBay en ligne par la voie extension | 88 — détectées par l'extension (poll de la page), **hors périmètre** |
| Ventes eBay déjà détectées (historique, voie extension) | 10 jobs `sold` |
| Scope `sell.fulfillment` consenti | **OUI, par les 7 comptes reliés** (SCOPES_DEMANDES l'inclut depuis le lot 0) → aucun re-consentement à demander |
| Orchestration existante | `_shared/sale-orchestration.ts` `orchestrateSale(admin, userId, jobId, {priceOverride})` — idempotente, annule les frères, arme `pending_removal`, email |
| Cadence serveur existante | cron 12 `ebay-api-worker-2min` |

### Deux sources possibles, une recommandation

| Source | Ce qu'elle donne | Ce qu'elle ne donne pas |
|---|---|---|
| Inventory API `GET /sell/inventory/v1/offer/{offerId}` → `listing.listingStatus`, `listing.soldQuantity` | vendu oui/non, 1 appel par annonce | le prix réel, l'état du paiement, une annulation d'achat |
| **Fulfillment API `GET /sell/fulfillment/v1/order?filter=creationdate:[T..]`** → 1 appel par compte, commandes avec `lineItems[].legacyItemId`, `lineItems[].total`, `orderPaymentStatus`, `cancelStatus` | **la vente au sens commande payée**, le prix réel (priceOverride), l'annulation | rien d'utile en moins |

**Recommandation : Fulfillment, par compte.** Une commande payée est la seule
définition honnête d'une vente (une annonce peut afficher `soldQuantity=1` sur
un achat annulé ou impayé). Le prix réel nourrit `ventes.prix_vente` sans que
l'utilisateur corrige. 1 appel par compte relié et par passe.

### Périmètre ÉTROIT (ce qu'il fait, et seulement ça)

1. Comptes : `ebay_accounts` non révoqués, avec le scope `sell.fulfillment`
   (vérifié dans `scopes`, sinon compte sauté et compté « scope manquant »).
2. Jobs candidats : `platform='ebay' AND voie='api' AND status='published' AND platform_listing_id IS NOT NULL`. **Jamais** un job voie extension (l'extension les détecte déjà), jamais un job `deleted`/`sold`.
3. Appariement : `lineItems[].legacyItemId = platform_listing_id` du même `user_id`. Pas d'appariement par titre, jamais.
4. Conditions pour dire « vendu » : `orderPaymentStatus = 'PAID'` **et** `cancelStatus.cancelState = 'NONE_REQUESTED'`. Sinon : rien (on relira la commande à la passe suivante).
5. Action : `orchestrateSale(admin, userId, jobId, { priceOverride: lineItem.total.value })` si `currency = 'EUR'`, sans priceOverride sinon. Idempotente : un job déjà `sold` ne refait rien.
6. Trace : `platform_fields.ebay_api.vente = { order_id, line_item_id, detectee_le, prix, statut_paiement }` **avant** l'orchestration (si elle échoue, on ne redétecte pas en boucle : la passe suivante saute un job qui porte déjà `vente.order_id`).
7. Fenêtre : `creationdate:[max(dernier_passage - 2 h, now - 30 j)..]` par compte, curseur `ebay_accounts.ventes_lues_jusqua` (nouvelle colonne, NULL = 30 jours). Pagination `limit=50`, `offset` jusqu'à `total`.
8. Cadence : dans le worker existant, une passe « ventes » toutes les **10 minutes** (le worker tourne toutes les 2 min ; on garde un horodatage `coin_config.ebay_ventes_dernier_passage`).
9. Quota : 7 comptes × 144 passes/jour ≈ **1 000 appels/jour**, pour une limite Fulfillment de 2 500 000/jour par application — négligeable. Un 429 → la passe s'arrête, reprise 10 min plus tard.
10. Interrupteur (fail-safe) : `coin_config.ebay_ventes_api_actif` (0 = passe inactive, **valeur de départ**). Clé absente ou illisible = inactif. Une passe qui lève une exception journalise et ne bloque pas les publications du même tick.
11. Erreurs de compte : 401 après refresh → `seller_state` marqué « à reconnecter » (mécanisme existant), compte sauté ; jamais un job touché sur une erreur de compte.

### Ce que ça ne fait PAS (volontairement)

- Pas de retrait automatique sur les autres plateformes : `pending_removal` + bandeau semi-auto, comme aujourd'hui (règle « Vendre n'arme aucun retrait »).
- Pas de détection des annonces **terminées sans vente** (fin de durée, retrait par eBay) — sujet séparé, à mesurer avant.
- Pas de webhook eBay (l'API Notification n'a pas de sujet « vente » fiable ; `commerce.notification.subscription` sert à la suppression de compte).
- Pas de Vinted, pas de voie extension.

### Ordre de livraison proposé

| Étape | Contenu | Écrit en base ? |
|---|---|---|
| 0 — mesure | action `mesure_ventes` du worker (secret cron) : pour les 3 comptes qui ont des annonces API, lire les commandes des 30 derniers jours, apparier aux 18 jobs + aux 10 `sold` historiques, rendre un tableau (commande, item, job, prix, payée ?, annulée ?). | **Non** |
| 1 — passe réelle sous interrupteur | colonne `ventes_lues_jusqua`, clé `ebay_ventes_api_actif = 0`, passe toutes les 10 min, trace `ebay_api.vente`, appel `orchestrateSale`. Test sur MON compte (Nico) avec une vente réelle ou simulée en sandbox avant d'allumer pour les autres. | Oui, interrupteur à 0 |
| 2 — allumage | `ebay_ventes_api_actif = 1`, contrôle à J+1 : ventes détectées vs ventes réelles chez Ornella (12 annonces). | Oui |

Estimation : étape 0 = ~80 lignes dans le worker ; étape 1 = ~150 lignes +
1 migration (colonne + clé). Aucune modification de l'app ni de l'extension.

---

## 3. Les 11 jobs eBay « voie extension » qui pourrissent — PROPOSITION (rien fait)

13 jobs `pending`/`needs_user` voie extension antérieurs au 09/09 (les « 11 »
d'hier + les 2 d'Ornella, à traiter avec). Réservations de Pépites relues :
une annulation passe par le trigger `cross_post_jobs_settle_reservation`, qui
**libère** la réservation encore `held` — rien à créditer à la main.

| Groupe | Jobs | Compte | Constat | Pépites | Proposition |
|---|---|---|---|---|---|
| A | 4c809f60, 35192aff, c5b5f4a1, 203799c4, aafd5969 | vintedclaire972 (non relié) | `pending` depuis le 21/08 – 01/09, `bfcache_rearms` 2-3, « onglet suspendu » / « listener » ; extension 94d4104 (31/08) ; aucun poll récent visible | 5 réservations **déjà `released`** | **Annuler** les 5, error = « Publication eBay abandonnée : l'onglet eBay a été suspendu par Chrome à plusieurs reprises. Rien n'a été débité — relance depuis l'app quand tu veux. » |
| B | 721790a6, 54f0be18, 967bd76d, 1f296a25 | cerseitarly, yassine7848, serena89500, s.dafri74 (non reliés) | `REAUTH VENTE eBay` : mur de reconnexion eBay `/sl/list` que la voie extension ne peut pas franchir (mémoire « mur signin NON TRANCHÉ ») ; `needsUserAttempts` 1-4 | 721790a6 : réservation **`held` de 2 Pépites pour 2 jobs** (lot du 02/09) → vérifier le jumeau avant d'annuler ; les 3 autres : aucune réservation | **Annuler** les 4, error = « eBay demande une reconnexion de sécurité que l'extension ne peut pas faire à ta place. Relie ton compte eBay dans l'app (Réglages › Compte eBay) : tes annonces eBay partiront de nos serveurs, sans ce mur. » + **email** aux 4 comptes (même texte, lien /app). Rien débité. |
| C | 04b142a5, b63f26dc | geronimo0550 (non relié) | `needs_user` : taille « 25 » non traduite — point 4 du dossier | aucune | **Ne rien faire** : ils attendent le correctif taille 25 ; le job reste actionnable par l'utilisateur. |
| D | de7a8613, ae41dc57 | ornellaracano (**relié, voie API depuis le 07/09**) | `needs_user` voie extension du 06/09 (avant sa bascule) : « connexion eBay requise » (sans objet aujourd'hui) et « Numéro de pièce fabricant » (l'API le pose seule) | aucune | **Annuler** les 2, error = « Sans objet : ton compte eBay est maintenant relié — republie l'article depuis l'app, il partira par nos serveurs. » |

Ordre d'exécution après GO : sauvegarde `sauvegarde_ebay_ext_13_20260909`
(RLS + REVOKE, comme les précédentes) → contrôle du jumeau de la réservation
8167074c → 11 `UPDATE … SET status='cancelled', error=…` un par un → relecture
des réservations (`held` → `released`) → emails B via email-tunnel (type
récurrent, **pas** dans l'index one-shot). ⛔ Aucune republication automatique.

---

## 4. Taille « 25 » (voie extension) — plus tard, décision Nico

Le refus est côté extension (`ebay.js`, appariement contre la liste relevée) :
« 25 » n'existe ni en lettres ni en pointure FR pour la catégorie visée. À
traiter avec le prochain paquet d'extension, pas avant.
