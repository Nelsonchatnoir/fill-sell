# Lot 6 — trois études (17/10/2026, 18:30 Paris, lecture seule : code du dépôt + SELECT sur la prod)

## Résumé (10 lignes)

1. **Détection des commandes** : PC allumé, Vinted et Leboncoin sont relus toutes les **10 min ± 90 s** (veille des commandes, comptes payants seulement ; même cadence pour la bêta messagerie sur 3 comptes) ; Beebs et Depop seulement par la bêta (3 comptes). PC éteint : **rien** sur ces 4 plateformes (aucun cron serveur ne les lit). eBay est la seule plateforme lue sans ordinateur : notification `ORDER_CONFIRMATION` **immédiate** (41 commandes valides sur 30 j), `ebay-messagerie` toutes les 20 min (bêta), `ebay-ventes-sync` 1×/jour à 04:40.
2. **Bordereaux** : jamais automatiques. Le fichier n'est pris qu'au clic, par l'extension au poll suivant (≤ 2 min, PC allumé) ; PC éteint, la demande attend **24 h** puis le bouton revient. eBay : jamais par FillSell ; Depop : pas de bordereau en France. Au 17/10 18:30, `plateforme_commandes` et `bordereaux_demandes` sont **vides** (0 ligne) : les relevés tournent (`messagerie_releves` à 18:27) mais aucune commande en cours chez les porteurs.
3. **Paiement échoué (Stripe)** : un seul mail client par facture, envoyé à la première tentative échouée d'un renouvellement ou d'une fin d'essai, ou à l'abandon d'une souscription (23 h) ; 6 mails depuis le 06/10 (5 comptes). Ensuite **aucune relance FillSell**, aucun mail à la perte du palier (`unpaid`/`canceled`) ; Nico reçoit une alerte `ops_paiement_echoue` à chaque événement (18 en 60 j, retries compris). Les Smart Retries et les mails automatiques de Stripe sont des réglages du dashboard **non lus ici** (interdiction de toucher Stripe) : à lire par Nico.
4. **Stores** : aucun mail FillSell sur un échec Apple/Google ; `DID_FAIL_TO_RENEW` est classé « premium off » (à vérifier contre `decisionApple`).
5. **Parrainage** : rien n'existe (ni code, ni table ; `acquisition_*` posé sur 0 profil). Proposition : `profiles.code_parrainage` + table `parrainages` à 5 états, code capté par `?parrain=` (même chemin qu'`acquisition.js`) ou saisi dans Réglages ≤ 14 j après l'inscription ; récompense au **premier paiement réussi du filleul**, posée après une carence de 14 j (remboursements), jamais à l'inscription.
6. **Moyen Stripe** : coupon 100 % `once` sur l'abonnement du parrain (la facture à 0 € déclenche quand même `invoice.paid`, donc les quotas) ; solde client en repli pour cumuler ; **pas** de prolongation de `trial_end` (texte « fin d'essai » faux, quotas gelés). Parrain Apple/Google : Offer Codes Apple / codes promo Play (manuels) ou équivalent en Pépites — décision de Nico.
7. **Dimensionnement** : 3 098 comptes, 280 inscriptions du 1er au 17/10 (846 en sept., 1 450 en août) ; 50 premium dont 27 Stripe, 12 Apple, 1 Google, 12 offerts ; 14 pro. Coût borné : un mois de palier par filleul qui paie.
8. Aucun code n'est à écrire dans ce lot ; chaque proposition nomme la décision attendue de Nico.

---

## ÉTUDE 1 — Fréquence de détection des commandes et des bordereaux (PC allumé / PC éteint)

### Ce qui existe (preuves)

**L'horloge de l'extension**
- Un seul minuteur qui survit au service worker : l'alarme de poll, `POLL_INTERVAL_MINUTES: 2` (`chrome-extension/config.js:14`, armée `background.js:960-964`). À chaque poll, dans cet ordre (`background.js:3194-3211`) : `veillerCommandes` → `releverMessagerieBeta` → `traiterDemandeBordereauBeta` → `checkPublishedListings`.
- Veille des commandes (05/10, Nico) : `VEILLE_COMMANDES_PLATEFORMES = ["vinted", "leboncoin"]`, `VEILLE_COMMANDES_MS = 10 min`, `ALEA = 90 s`, 1 page de 20 commandes, 3 détails au plus, fenêtre 48 h, coupure 24 h au premier 403/429/anti-robot, droits relus toutes les 30 min, comptes **payants seulement** (`PALIERS_PAYANTS`) (`background.js:20017-20060`). Interrupteur `coin_config.veille_commandes_ouverte = 1` (lu le 17/10). Preuve d'activité : `usage_logs` feature `veille_commandes` = 160 lignes, 35 comptes sur 7 jours, dernière à 17/10 15:17.
- Bêta messagerie + commandes « à expédier » : `PLATEFORMES_COMMANDES = ["vinted","leboncoin","depop","beebs"]`, `CADENCE_MS = 10 min`, `ALEA_MS = 90 s`, 1 liste + 5 détails de conversations + commandes en cours + 5 détails (`chrome-extension/messagerie.js:86-94`) ; réservée aux porteurs de `beta_flags.messages_bordereaux` (`background.js:20394-20417`). Porteurs au 17/10 : **3** (la règle du 16/10 en nomme 2, `docs/regles/messagerie-et-bordereaux.md:99`). Preuve : `messagerie_releves.dernier_le` = leboncoin 18:27, ebay 18:27 (3 comptes), depop 18:23, vinted 18:21, beebs 18:15 (`dernier_motif = session_absente`).
- Détection de vente par annonce (toutes plateformes de l'extension) : 8 annonces par cycle de 2 min, chacune au plus toutes les 2 h (`background.js:10003-10014`) ; dressing Vinted 1×/24 h (`background.js:974-977`).
- Options de bordereau Vinted (`label_options`) relues en lecture 1×/6 h par commande (`docs/regles/messagerie-et-bordereaux.md:134-135`).

**Le bordereau : au clic seulement**
- `bordereau_demander` (session de la personne) → l'extension prend UNE demande à chaque poll (`traiterDemandeBordereauBeta`, `background.js:3204-3208`, `20707-20730`) → dernière marche ouverte une fois → copie 5 jours (`messagerie-et-bordereaux.md:25-37`). Demande non prise : **24 h** (migration 20261017100000, `:32` et `:204-206`). Génération : geste puis fichier 8 s après, puis « suite » toutes les 2 min, 15 essais, 24 h (`:144-145`). Interrupteurs `coin_config.bordereaux_ouverts = 1`, `bordereaux_generation_ouverte = 1` (lus le 17/10). Cron `bordereaux-purge-horaire` (job 61, `23 * * * *`) : purge seulement.
- eBay : étiquette payante achetée sur eBay, Logistics API 403, jamais par FillSell (`:58-59`, `:146`) ; suivi d'une étiquette achetée lu par `ebay-messagerie` v6 (`:201-203`). Depop : pas de bordereau en France (`:147`). Beebs : `sellerConfirmAction`, fichier à prouver à la première vraie vente (`:140-143`, `:198-200`).

**Le serveur (pg_cron, `SELECT … FROM cron.job`, 17/10)**
- eBay : `ebay-api-worker-2min` (job 12) porte la veille Browse, **6 h par annonce** (`supabase/functions/ebay-api-worker/index.ts:2348`) ; `ebay-messagerie-20min` (job 58, `7-59/20`) = commandes `NOT_STARTED|IN_PROGRESS` + suivi, comptes bêta reliés (`ebay-messagerie/index.ts:20-25`) ; `ebay-ventes-sync-daily` (job 15, `40 4 * * *`) = `getOrders`, recouvrement 30 j (`ebay-ventes-sync/index.ts:59-68`) ; `ebay-releve-api-5min` (job 27, en fait `*/10`) = relevé d'annonces.
- `ebay-notifications` (webhook eBay, `ORDER_CONFIRMATION` dès que l'acheteur a payé, `ebay-notifications/index.ts:2-30`) : sur 30 jours, `commande/valide` = 41 (dernier 17/10 17:45), `compte_inconnu` 5, `illisible` 7 ; 58 340 notifications valides d'autres sujets. La notification pose un `sale_signal`, elle **n'écrit pas** `plateforme_commandes`.
- Aucun cron ne lit Vinted, Leboncoin, Beebs ou Depop : `beebs-lien-5min` (job 16) ne fait que rattacher des dépôts (`beebs-lien/index.ts:15-25`) ; `releve-completer` (job 28) lit l'index Beebs/eBay pour compléter des fiches (`releve-completer/index.ts:6-28`) ; `ventes-prouvees-2min` (job 52) ne traite que des preuves déjà déposées par l'extension (`docs/regles/ventes-et-retraits.md:38-54`) ; `push-ventes-1min` (job 34) envoie les mails de notes déjà nées.
- État réel des tables au 17/10 18:30 : `plateforme_commandes` = **0 ligne**, `bordereaux_demandes` = **0 ligne**, `messagerie_conversations` = 28.

### Tableau — plateforme × (commandes, bordereaux) × (PC allumé, PC éteint)

| Plateforme | Commandes — PC allumé | Commandes — PC éteint | Bordereau — PC allumé | Bordereau — PC éteint |
|---|---|---|---|---|
| **Vinted** | Veille 10 min ± 90 s, comptes payants (`background.js:20047-20049`) ; bêta 10 min ± 90 s (`messagerie.js:86-87`) ; vente par annonce ≤ 2 h (`:10003`) ; dressing 24 h (`:975`) | **Jamais** (aucun job Vinted dans `cron.job`) | État « prêt » (220/230/250) lu au passage bêta 10 min ; options 1×/6 h ; fichier au clic, pris ≤ 2 min, puis 8 s + 2 min × 15 (`messagerie-et-bordereaux.md:25-37`, `:144`) | Demande en attente 24 h, puis le bouton revient (`:204-206`) ; rien n'est généré |
| **Leboncoin** | Veille 10 min ± 90 s, payants ; bêta 10 min ± 90 s ; vente par annonce ≤ 2 h | **Jamais** | `available + parcel-label-generated` lu au passage bêta 10 min ; `validate-availability` au clic (`:136-139`, `:194-197`), prise ≤ 2 min | Idem : attente 24 h |
| **eBay** | Notification `ORDER_CONFIRMATION` immédiate (tous comptes reliés abonnés, `ebay-notifications`) ; écran « à expédier » rempli par `ebay-messagerie` **toutes les 20 min** (bêta, job 58) ; veille Browse 6 h/annonce (job 12) ; `getOrders` 1×/jour 04:40 (job 15) | **Identique** (tout est serveur) | Jamais par FillSell (étiquette achetée sur eBay, `:146`) ; suivi relu toutes les 20 min (`:201-203`) | Identique |
| **Beebs** | Bêta seulement : 10 min ± 90 s (page Ventes, `:70-72`) — **pas** dans la veille des commandes ; vente par annonce ≤ 2 h ; `session_absente` = mur dit, 0 lecture (17/10 18:15) | **Jamais** (`beebs-lien` ne lit pas les commandes) | Au clic : `sellerConfirmAction` (`:140-143`), prise ≤ 2 min ; fichier non prouvé (`:198-200`) | Attente 24 h |
| **Depop** | Bêta seulement : 10 min ± 90 s ; formes de commande non prouvées (« État à vérifier », `:88-90`) ; vente par annonce ≤ 2 h | **Jamais** | Aucun (pas de bordereau en France, `:147`) ; l'app ouvre Depop | Aucun |

Lecture : « PC allumé » = Chrome ouvert avec l'extension et une session sur la plateforme ; l'app mobile (Capacitor) n'exécute aucune veille.

### Trous
1. **PC éteint = aveugle sur 4 plateformes sur 5.** Seul eBay a une API et un webhook. Vinted/Leboncoin/Beebs/Depop n'ont ni l'un ni l'autre sans session navigateur : aucun levier serveur n'existe, la doc ne le dit nulle part à la personne (seul le mur « En attente de ton ordinateur… » sur le bordereau, `:204`).
2. **Comptes gratuits** : aucune lecture de commandes (veille = payants) ; leur seule détection est la vente par annonce, ≤ 2 h et 8 par cycle.
3. **Beebs et Depop** : commandes lues pour 3 comptes bêta seulement ; hors bêta, rien.
4. **eBay à 20 min alors que la notification est immédiate** : `ebay-notifications` ne nourrit pas `plateforme_commandes` ; la carte « à expédier » attend le passage de `ebay-messagerie` (≤ 20 min), même PC éteint. 5 notifications `compte_inconnu` sur 30 j (compte relié non reconnu ?) — non enquêté ici.
5. **Aucune preuve de bout en bout en base** : 0 commande, 0 demande de bordereau au 17/10 18:30 (relevés vivants mais rien à relever). La chaîne bordereau n'est prouvée que par les tests du 16/10 (rapport), pas par une ligne survivante.
6. **Porteurs bêta = 3**, règle = 2 (`messagerie-et-bordereaux.md:99-102`) : à vérifier (qui est le troisième ?).
7. **Beebs `session_absente`** sur le compte relevé à 18:15 : les commandes Beebs ne sont pas lues tant que la session manque ; le mur est dit, mais rien ne rappelle de se reconnecter.
8. Règle « aucun temps estimé à l'écran » (`:91-92`) : l'app ne peut pas afficher « relevé toutes les 10 min » ; elle n'affiche pas non plus « dernier relevé à HH:MM », qui serait pourtant un fait.

### Proposition (décisions de Nico)
- **Dire le fait, pas l'estimation** : afficher par plateforme « Dernier relevé : 17/10 18:27 » depuis `messagerie_releves.dernier_le` (et `usage_logs` veille pour les payants), avec « Ton ordinateur doit être allumé avec Chrome et la session ouverte » — conforme à `selftest:aucune-estimation` (une date donnée, pas un délai).
- **eBay immédiat** : faire écrire la commande « à expédier » par `ebay-notifications` à la réception d'`ORDER_CONFIRMATION` (pour les comptes bêta), `ebay-messagerie` ne faisant plus que compléter (suivi, sortie du filtre). Seuls `orderId`/`itemId` traversent aujourd'hui : il faudrait lire `getOrder` depuis la notification (pseudo acheteur, date limite), toujours sans adresse. À décider.
- **Cadence intouchable sans Nico** (anti-robot) : ne pas resserrer les 10 min. Pour l'urgence (« j'ai vendu, je veux le bordereau maintenant »), un bouton « Relever maintenant » borné (1 passage par plateforme / 10 min, même garde serveur `messagerie_releve_autorise`) vaut mieux qu'une cadence plus courte.
- **Ouverture au-delà de la bêta** : la veille des commandes Vinted/Leboncoin (payants) et la lecture Beebs/Depop (bêta) sont deux circuits ; décider si la lecture des commandes « à expédier » s'ouvre aux payants (même garde, même cadence) et quand.
- **Lever les deux inconnues** : identité du 3e porteur ; cause des 5 `compte_inconnu` eBay.

---

## ÉTUDE 2 — Relance après paiement échoué : ce qui existe, ce qui part, ce qui manque

### Ce qui existe (preuves)

**Stripe (réglages du dashboard, NON LUS — interdiction de toucher Stripe ; doc Stripe lue)**
- Smart Retries : réglage Billing › Revenue recovery › Retries ; défaut recommandé **8 tentatives sur 2 semaines** (fenêtre possible 1 semaine à 2 mois) ; `invoice.payment_failed` est renvoyé à **chaque** tentative avec `attempt_count` ; hard declines (`authentication_required`, carte perdue…) : tentatives planifiées mais non exécutées sans nouveau moyen de paiement. Fin des tentatives : l'abonnement passe `canceled` ou `unpaid` selon le réglage (doc « Automate payment retries », « Billing collection methods »). Le commentaire de `stripe-webhook/index.ts:40-45` parle d'« une fenêtre de retry jusqu'à ~1 mois » — un commentaire, pas une lecture.
- Mails automatiques Stripe (« Send emails when card payments fail », rappels 3D Secure, carte qui expire 1 mois avant, portail client) : réglage Settings › Billing › Subscriptions and emails ; **état inconnu ici**. Si activé, le client reçoit un mail Stripe à chaque échec **en plus** du mail FillSell.

**FillSell — la chaîne (un seul chemin)**
1. `stripe-webhook` reçoit `invoice.payment_failed` / `invoice.payment_action_required` (`supabase/functions/stripe-webhook/index.ts:823-890`) : facture et abonnement **relus** chez Stripe (`:855-870`), montée de palier ignorée (`:837-842`), décision `decisionMailEchec` (`_shared/paiement-echoue.js:150-171`) : `subscription_update` → rien ; facture payée → rien ; `subscription_create` → rien (paiement initial en cours, cas Marta 09/10) ; `void` → rien ; sinon **échec acquis**.
2. `signalerEchecAcquis` (`:146-267`) : compte par `stripe_customer_id`, puis `metadata.fillsell_user_id`, puis l'adresse de la facture (`:167-206`) ; cause fine sur le PaymentIntent (`paiement-echoue.js:181-198`) ; faits (`faitsEchec`, `:98-109`) : contexte `souscription | renouvellement | fin_essai`, bouton = `hosted_invoice_url` si facture `open`, `relance_le = next_payment_attempt`, `abonnement_actif` = `active|past_due`.
3. Souscription abandonnée : `customer.subscription.updated` → `incomplete_expired` (23 h sans paiement) → `signalerSouscriptionAbandonnee` (`:277-312`) : même mail si aucun autre abonnement vivant de la même offre et compte pas déjà ouvert.
4. `payment-notify.signalerPaiementEchoue` (`_shared/payment-notify.ts:148-161`) → `email-tunnel` mode `payment_failed` (`supabase/functions/email-tunnel/index.ts:741-854`) : **mail client** (catégorie `support`, jamais plafonné, `dedup: "reservation"` sur `payment_failed:<invoice_id>`, index `email_logs_payment_failed_unique`, migration 20260807190000) + **alerte Nico** `ops_paiement_echoue` (`dedup: "journal"`, toujours, même compte introuvable, `:838-845`).
5. Texte du mail (`paiement-echoue.js:209-282`, fr/en) : cause en clair, bouton « Régler la facture » / « Valider le paiement » (page Stripe) ou « Ouvrir FillSell » (souscription), « Sinon, Stripe retentera le paiement le <jour> » seulement si `next_payment_attempt` et cause `carte_refusee`/`autre`, « Ton abonnement reste actif pour l'instant » seulement au renouvellement `active|past_due`. Preuves : `scripts/paiement-echoue-selftest.mjs` (24 variantes), `scripts/paiement-echoue-acquis-selftest.mjs` (cas réels Marta, romain.knc, nadegemarcelin78, geronimo0550, Lojh).
6. Fin de parcours : `past_due` garde le palier (`stripe-webhook/index.ts:40-45`, vivant = `active|trialing|past_due` `:119-121`) ; `unpaid` / `incomplete_expired` (`:793-797`) et `customer.subscription.deleted` (`:718-733`) → `recomputeStripeFlags` → palier retiré. **Aucun mail** à ce moment (aucun type dans `email_logs`, aucun appel dans le code).
7. Événements cochés sur l'endpoint (commentaire `:577-583`, vérifié le 28/07) : `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.paid` ; `invoice.payment_failed` / `payment_action_required` doivent l'être aussi (`:813-818`) — les 18 alertes prouvent qu'ils arrivent.

**Stores**
- Apple : `PREMIUM_OFF = ["EXPIRED","REFUND","REVOKE","DID_FAIL_TO_RENEW"]` (`apple-iap-webhook/index.ts:45`, appliqué `:485-486`) ; une `decisionApple(type, sousType)` existe (`:188`, `_shared/notifications-stores.js`, non lue ici) — à vérifier que `DID_FAIL_TO_RENEW` + `GRACE_PERIOD` ne retire pas le palier le premier jour. Google : `PREMIUM_OFF_TYPES` = EXPIRED (12) / REVOKED (13) ; types non listés = « Unhandled — skipping » (`google-play-webhook/index.ts:263-265`). Aucun mail FillSell sur un échec store ; Apple et Google ont leurs propres mails.

**Ce que dit `email_logs` (SELECT 17/10)**
- `payment_failed:%` : **6 mails, 5 comptes**, du 06/10 08:56 au 13/10 15:33 (tous temps) ; 1 seul sur les 60 derniers jours hors doublon de type (09/10 01:58, renouvellement refusé).
- `ops_paiement_echoue` : **18** (06/10 → 17/10 14:54) ; `ops_paiement` (paiements aboutis) : 40 ; `resiliation_ar` : 5. Écart 18 / 6 : alertes avant la règle du 09/10 (paiements initiaux en cours), tentatives Stripe suivantes (client « deja_notifie », Nico alerté de nouveau), comptes introuvables.
- Aucun type de relance ultérieure, aucun type « palier perdu », aucun « carte qui expire ».

### Ce qui part aujourd'hui — en clair
| Moment | Au client | À Nico | Combien de fois |
|---|---|---|---|
| Renouvellement ou fin d'essai : 1re tentative échouée | 1 mail (cause, bouton page Stripe, date de la prochaine tentative si Stripe la donne) | 1 alerte | 1 par facture (dédup) |
| Tentatives Stripe suivantes (`invoice.payment_failed` rejoué) | rien (`deja_notifie`) | 1 alerte **par tentative** | jusqu'à 8 (Smart Retries par défaut) |
| Souscription au Checkout en cours (3DS, autre carte) | rien | rien | — |
| Souscription abandonnée (23 h, `incomplete_expired`) | 1 mail (bouton « Ouvrir FillSell ») | 1 alerte | 1 |
| Fin des tentatives : `unpaid` / `canceled` → palier retiré | **rien** | rien (hors ops-digest si section) | — |
| Carte qui expire | rien (Stripe peut, réglage inconnu) | rien | — |
| Échec Apple / Google | rien | rien | — |

### Trous
1. **Une seule relance = le mail J0.** Entre J0 et la fin des Smart Retries (≈ 2 semaines), FillSell se tait ; à la perte du palier, FillSell se tait aussi — la personne découvre la rétrogradation dans l'app.
2. **Réglages Stripe inconnus** (Smart Retries actifs ? combien ? mails Stripe au client activés ?) : impossible de dire si le client reçoit 1 mail ou 1 + 8. À lire dans le dashboard, par Nico.
3. **Bruit côté Nico** : une alerte par tentative Stripe, sans `attempt_count` dans le mail.
4. **Stores** : aucun mail FillSell ; `DID_FAIL_TO_RENEW` dans `PREMIUM_OFF` — risque de rétrograder pendant la période de grâce Apple (à vérifier dans `decisionApple`).
5. **Événements de remboursement/litige** (`charge.refunded`, `charge.dispute.created`) non traités : utiles aussi pour l'étude 3.
6. Le texte promet « Stripe retentera le paiement le … » uniquement si `next_payment_attempt` est présent : avec les automations Stripe, ce champ n'est plus dans `invoice.payment_failed` (doc) — à surveiller si Nico active des automations.

### Proposition (sans code ; tout geste Stripe = ordre explicite de Nico)
1. **Lire d'abord** (Nico, dashboard) : Retries (Smart Retries ? 8/2 sem. ?), « Send emails when card payments fail », « expiring cards », « 3D Secure hosted link ». Noter le résultat dans `docs/regles/mails-paiements-comptabilite.md`.
2. **Choisir un seul relanceur** : soit Stripe (mails + page hébergée, 0 code, mais texte Stripe et doublon avec J0), soit FillSell. Recommandation : garder le mail FillSell J0 (contexte riche), **activer chez Stripe seulement « carte qui expire »** (prévention, 1 mois avant), et ajouter **une** relance FillSell : J+3 après J0 (ou la veille de `next_payment_attempt`) si la facture **relue** est encore `open`, type `payment_failed_relance:<invoice_id>` (index partiel dédié, type récurrent, jamais dans `email_logs_one_shot_unique`), aucune relance pour une souscription abandonnée (un mail suffit). Moteur : `email-tunnel-daily` (job 2, 09:00) qui relit chez Stripe les factures `open` de moins de 21 j des comptes à `stripe_customer_id` — lecture Stripe, à autoriser. Simulation (`p_simulation`) avant tout envoi réel.
3. **Mail « palier retiré »** à `unpaid` / `customer.subscription.deleted` issu d'un dunning épuisé (pas d'une résiliation volontaire — distinguer par `cancel_at_period_end` / `cancellation_details.reason`) : « ton abonnement s'est arrêté faute de paiement, reprends-le ici » → bouton app (`create-checkout-session`). Type `palier_retire_impaye:<subscription_id>`.
4. **Alerte Nico dédupliquée** par facture avec `attempt_count` et date de la prochaine tentative (`:811`), une ligne par tentative dans l'ops-digest plutôt qu'un mail.
5. **Stores** : relire `decisionApple` pour `DID_FAIL_TO_RENEW`/`GRACE_PERIOD` et `google` type 5/6 (on hold, grace) ; décider si un mail FillSell « ton paiement App Store/Play n'est pas passé » se justifie (Apple/Google en envoient déjà un).

---

## ÉTUDE 3 — Parrainage « un mois offert par filleul qui paie » : proposition de mise en place

### Ce qui existe (preuves)
- **Rien n'existe.** `grep parrain|referral` sur `src/`, `supabase/`, `scripts/`, `chrome-extension/` : seuls `src/utils/acquisition.js:86` (`medium = 'referral'` = referrer HTTP) et `scripts/site-routes-app-selftest.mjs:54-56` (route fictive `/parrainage/:code` injectée pour tester le contrôle des rewrites — preuve que toute route React nouvelle exige un rewrite Vercel).
- **Capture d'origine** : `capterSource` lit les paramètres d'URL au premier contact et les garde en `localStorage` (`acquisition.js:59-96`) ; `poserSourceSurProfil` écrit `acquisition_source/medium/campaign/content/fbclid/referrer/captured_at` à la première session, compte ≤ 30 j, capture antérieure au compte, trigger `profiles_acquisition_immuable` (`:138-164`). Mesuré : **0 profil** avec `acquisition_referrer` (SELECT 17/10) ; la doc du 27/09 explique pourquoi (`:120-127` : pas de session au `signUp`, Google/Apple ne passent pas par `signUp`). Le même chemin peut porter `?parrain=CODE`, à condition d'écrire par RPC à la première session.
- **Inscription** : trigger `handle_new_user` sur `auth.users` (migrations `20260617000000_welcome_immediate.sql:2-8`, `20260728220000`) ; welcome one-shot.
- **Abonnement Stripe** : `create-checkout-session` pose `metadata.fillsell_user_id` et `plan_type` (`create-checkout-session/index.ts:660-661`), `allow_promotion_codes: true` (`:654`), code promo d'office via `?promo=` → `discounts` (`:680-741`) ; premier paiement = `checkout.session.completed` (`stripe-webhook/index.ts:341`, pose `is_premium` + `stripe_customer_id`) ; renouvellement = `invoice.paid` → `upgrade_monthly_grant(p_source 'payment', fin de période)` (`:584-716`) ; résiliation = `cancel_at_period_end: true` + `profiles.subscription_period_end` (`cancel-subscription/index.ts:250-262`) ; perte à `deleted`/`unpaid` (`:718-733`, `:793-797`). Pas d'essai sur les paliers (seul Cloud a `cloud_essai_*`).
- **Stores** : `validate-apple-receipt` / `validate-google-purchase` (appel client, JWT) ; webhooks `apple-iap-webhook` (`PREMIUM_ON = SUBSCRIBED|DID_RENEW|RESUBSCRIBE`, `:44`) et `google-play-webhook` ; `upgrade_monthly_grant` avec `expiresDate` / `expiryTime` (`apple:585-592`, `google:449-453`) ; `subscription_period_end` (texte).
- **Premium offert** : `is_comped` (palier.js:28-31 ; `mails-paiements-comptabilite.md:107`), posé à la main, sans date de fin ; `grant_monthly_coins` l'exempte de l'attente d'un paiement (`v_is_comped`, def lue en prod).
- **Quotas** : `grant_monthly_coins` — un compte à canal de paiement (`stripe_customer_id`/Apple/Google non nuls) n'est recrédité que sur événement de paiement ; le sweep (job 3, 04:15) rend `awaiting_payment_event` au-delà de 3 jours de retard (def lue en prod ; `stripe-webhook/index.ts:669-672`). Conséquence : tout moyen « mois offert » qui **supprime** la facture mensuelle gèle les quotas du parrain ; un moyen qui laisse une facture à 0 € les préserve.
- **Colonnes d'abonnement de `profiles`** (information_schema, 17/10) : `stripe_customer_id`, `is_premium`, `is_pro`, `is_business`, `is_comped`, `is_founder`, `subscription_cancel_at_period_end`, `subscription_period_end` (text), `apple_original_transaction_id`, `google_purchase_token`, `google_product_id`, `cloud_*`, `acquisition_referrer`, `created_at`, `lang`, `email`, `beta_flags`.

### Mesures (SELECT bornés, 17/10 18:30 Paris)
- Comptes : **3 098**. Inscriptions `auth.users` : juin 88, juillet 222, **août 1 450**, septembre 846, octobre (1→17) 280.
- Premium : **50** = Stripe 27 (hors offerts) + Apple 12 + Google 1 + offerts (`is_comped`) 12 ; pro 14 ; `stripe_customer_id` 32 ; Apple tx 23 ; Google token 7 ; résiliation programmée 4.
- Dimensionnement : ~40 payants, ~1 à 2 % des inscrits. Coût maximal d'un parrainage = un mois du palier du parrain (12,99 à 29,99 € d'après les factures citées dans les selftests) par filleul qui a réellement payé : le programme s'autofinance par construction. Volume prévisible : quelques récompenses par mois → circuit SQL + webhook, aucun outil tiers.

### Modèle de données (proposition)
- `profiles.code_parrainage text UNIQUE NOT NULL` : 8 caractères sans ambiguïté (sans 0/O/1/I), posé par trigger à la création du profil et rétro-rempli une fois pour les comptes existants ; immuable.
- Table `parrainages` : `id`, `parrain_id uuid → profiles`, `filleul_id uuid UNIQUE → profiles` (un filleul n'a qu'un parrain, à vie), `code text`, `saisi_le`, `canal_saisie` (`lien` | `inscription` | `reglages`), `etat` CHECK IN (`en_attente`, `qualifie`, `recompense`, `annule`, `refuse`), `qualifie_le`, `paiement_ref` (invoice Stripe / transaction store, texte), `paiement_canal` (`stripe` | `apple` | `google`), `recompense_prevue_le` (= `qualifie_le` + carence), `recompense_le`, `recompense_moyen` (`stripe_coupon` | `stripe_solde` | `store_code` | `pepites`), `recompense_ref`, `annule_le`, `annule_motif`, `indices jsonb` (empreintes **hachées** : e-mail normalisé, appareil, IP — jamais en clair), `cree_le`. CHECK `parrain_id <> filleul_id`. Index `(parrain_id, etat)`.
- `profiles.mois_offerts_restants int DEFAULT 0` : file d'attente des mois gagnés non encore appliqués (cumul de plusieurs filleuls, parrain sans abonnement vivant, parrain store).
- RLS : le parrain lit **ses** lignes par une vue qui masque le filleul (« M…e », date, état) ; aucune écriture directe : RPC `parrainage_saisir(p_code)` (session du filleul, SECURITY DEFINER, toutes les gardes dedans), `parrainage_qualifier` / `parrainage_recompenser` / `parrainage_annuler` appelées par les fonctions edge avec la clé de service. Chaque transition tracée dans `usage_logs` (feature `parrainage`).
- Machine d'états : `en_attente` (code saisi) → `qualifie` (premier paiement réussi du filleul) → `recompense` (crédit posé après carence) ; `annule` (remboursement, impayé, compte supprimé) ; `refuse` (abus, plafond). Jamais de retour en arrière sauf `annule` depuis `qualifie`/`recompense`.

### Parcours utilisateur
- **Parrain** : Réglages › Abonnement › « Parrainage » : son code, le lien `https://fillsell.app/?parrain=CODE` (paramètre d'URL sur la page d'accueil, capté par `capterSource` : aucune route nouvelle, aucun rewrite Vercel), bouton « Copier/Partager » (Web Share sur mobile). Dessous : la liste de ses filleuls (pseudo masqué, date, état en clair : « En attente de son premier paiement », « Mois offert appliqué le 03/11 », « Annulé : remboursement »), le compteur « mois offerts gagnés / appliqués / en réserve ». Jamais le montant payé ni l'e-mail du filleul.
- **Filleul** : (a) arrive par le lien → le code est gardé avec la source d'acquisition → à la **première session** (`App.jsx`, `onAuthStateChange`, même endroit que `poserSourceSurProfil`) l'app appelle `parrainage_saisir` ; (b) sinon, champ « J'ai un code de parrainage » dans Réglages › Abonnement, saisissable **≤ 14 jours** après la création du compte et **avant tout paiement** ; (c) jamais sur la page Stripe (confusion avec le code promo). Ce que gagne le filleul : à décider (rien, ou un code promo Stripe existant type FILLSELL50 passé en `?promo=` — mécanique déjà là, `create-checkout-session/index.ts:680-741`) ; un avantage filleul coûte une 2e fois, à chiffrer.
- **Écran de refus** : code inconnu, propre code, compte trop ancien, déjà parrainé, déjà payant → message exact, aucune liste de codes valides.

### Moment de la récompense — au PREMIER paiement réussi du filleul, jamais à l'inscription
- **Stripe** : `checkout.session.completed` du filleul (`stripe-webhook/index.ts:341`) avec `amount_total > 0` (une souscription à 100 % de remise ne qualifie pas) ; ou, si un jour un essai est ajouté, la première `invoice.paid` à `amount_paid > 0` (`estFinEssai`, `paiement-echoue.js:56-64`). Paiement initial en cours (3DS) ou abandonné (`incomplete_expired`) → rien.
- **Apple / Google** : première transaction **payée** validée par `validate-apple-receipt` / `validate-google-purchase` ou webhook `SUBSCRIBED` / type 4 — en excluant essai et offre (`offerType`, `isTrialPeriod`, `paymentState`) ; `paiement_ref` = `originalTransactionId` / `purchaseToken`.
- **Carence** : `recompense_prevue_le = qualifie_le + 14 j` (fenêtre où un remboursement Stripe/Apple est le plus probable) ; un cron quotidien (`parrainages-tick`, à côté de `coins-monthly-sweep`) pose la récompense si l'état est toujours `qualifie` et le filleul toujours payant (`palier_de(filleul) <> 'free'`, abonnement Stripe relu `active|past_due`). Sans carence, retirer un coupon déjà consommé est impossible : la carence est la règle, pas une option.

### Moyen technique du « mois offert » — comparatif (Stripe)
| Moyen | Geste Stripe | Effet chez FillSell (`stripe-webhook`) | Cumul (N filleuls) | Pièges |
|---|---|---|---|---|
| **A. Coupon 100 % `once`** appliqué à l'abonnement du parrain (`subscriptions.update(sub, { coupon })`, SDK épinglé 2023-10-16) | 1 coupon `PARRAINAGE_1_MOIS` créé une fois dans le dashboard | La prochaine facture est à 0 € mais **existe** : `invoice.paid` arrive (facture sans paiement = `paid`, doc « Subscription invoices ») → `upgrade_monthly_grant` crédite les quotas, `next_grant_at` posé ; `palierDeFacture` lit le prix (remise ≠ prix) ; `notifierPaiement` alerte Nico « 0,00 EUR » (à prévoir dans le texte) | Un seul coupon actif par abonnement : les suivants attendent dans `mois_offerts_restants` et sont posés à l'`invoice.paid` qui consomme le précédent | Montée de palier pendant le mois offert : la facture de différence (`subscription_update`) est aussi remisée à 100 % — acceptable ou à exclure (`applies_to` sur le coupon) ; mail « paiement échoué » impossible sur une facture à 0 € (bien) |
| **B. Solde client** (`customers.createBalanceTransaction(amount: -prix_du_palier)`) | Aucune création préalable | Idem A : facture 0 € payée par le solde → `invoice.paid` | Naturel : N × prix | Montant en € et non « un mois » (changement de palier = couverture partielle) ; une facture de **proration** d'upgrade consomme le solde en premier ; le solde survit à la résiliation (reste au client) |
| **C. Prolonger `trial_end`** d'un mois (`subscriptions.update({ trial_end, proration_behavior: 'none' })`) | Aucun | Statut `trialing` (vivant pour `drapeauxDepuisStripe`) ; facture 0 € à la pose puis **rien** à l'échéance décalée → `next_grant_at` poussé à la fin de l'essai : **quotas du mois offert jamais recrédités** ; la prochaine facture échouée serait classée « fin d'essai » par `estFinEssai` (texte faux) ; mails « trial ending » Stripe possibles | Oui (ajouter des jours) | Le pire ajustement avec le code actuel |
| **D. Prolonger la période par `billing_cycle_anchor`** | Aucun | Mêmes gels de quotas que C, prorations à maîtriser | — | Non retenu |

Recommandation : **A** (coupon 100 % once) comme règle, **B** en repli pour un cumul ou un palier changé, **jamais C/D**. Un seul endroit pose le crédit (`parrainage_recompenser`, côté serveur), ligne `parrainages.recompense_ref` = id du discount ou de la balance transaction. Tout ceci = écriture Stripe : **ordre explicite de Nico** (création du coupon, premier essai sur le compte de Nico ou d'Ornella).

### Parrain abonné Apple ou Google (aucun crédit Stripe possible)
- **Option 1 — codes des stores** : Apple « Offer Codes » (App Store Connect : offre « gratuit 1 mois » sur l'abonnement, codes à usage unique, rachat par `apps.apple.com/redeem?code=` ou la feuille de rachat) ; Google Play « codes promotionnels » d'abonnement (Play Console, usage unique). Avantage : la facturation du store est **réellement** décalée d'un mois (le vrai « mois offert »). Coût : stock de codes créé et expédié à la main par Nico (mail `envoyer_mail_ponctuel`), revue Apple de l'offre, le rachat dépend de la personne. Trace : `recompense_moyen = store_code`, `recompense_ref` = code masqué.
- **Option 2 — équivalent en Pépites** : crédit immédiat de `coin_config.monthly_grant_<palier>` (ligne `coin_ledger` kind `parrainage`, `purchased_balance` pour ne pas être remplacé au mois suivant). Sans store, sans geste manuel ; mais ce n'est pas un mois : le dire tel quel (« l'équivalent d'un mois de Pépites »).
- **Option 3 — mois en réserve** : `mois_offerts_restants` gardé, appliqué si la personne passe un jour sur Stripe (web) ; faible.
- **À ne pas faire** : `is_comped` ou une colonne « palier gardé jusqu'au » — le store continuerait de prélever : ce n'est pas un mois offert.
- Décision Nico : 1 (exact, manuel) ou 2 (automatique, approximatif) ; 1 pour Apple (12 abonnés) et 2 pour Google (1 abonné) est aussi défendable.

### Prévention des abus (toutes les gardes dans la RPC et la fonction edge, jamais côté client)
- **Auto-parrainage** : `parrain_id <> filleul_id` (CHECK) ; e-mail normalisé identique (minuscules, `+alias` et points Gmail retirés) → `refuse` ; même `stripe_customer_id` ou même empreinte de carte (`payment_method.card.fingerprint`, lecture Stripe à la qualification) → `refuse` ; même appareil (identifiant local posé par l'app, haché) ou même IP hachée à l'inscription (`x-forwarded-for` lu par une fonction edge, jamais par le client) → `en_attente` bloqué + question à Nico plutôt que refus automatique (IP partagées : famille, bureau).
- **Filleul remboursé, impayé, résilié tôt** : `charge.refunded`, `charge.dispute.created` (événements **à cocher** sur l'endpoint Stripe), `invoice.payment_failed` de sa 1re facture, `incomplete_expired`, Apple `REFUND`/`REVOKE`, Google `REVOKED` (13) → `annule` ; avant la pose (carence 14 j) rien n'est dû ; après la pose, coupon retiré s'il n'est pas consommé, sinon `mois_offerts_restants` − 1 (dette, jamais négative au-delà de −1) et ligne tracée.
- **Plafonds** : 3 récompenses par parrain et par mois civil, 12 à vie (valeurs à décider par Nico) ; au-delà → `refuse` « plafond », visible par le parrain.
- **Délais** : code saisissable ≤ 14 j après `profiles.created_at` du filleul et avant tout paiement ; aucun filleul rétroactif (compte créé après la date de lancement, `coin_config.parrainage_depuis`) ; parrain sans abonnement vivant au moment de la pose → mois en réserve, appliqué à sa prochaine souscription.
- **Comptes supprimés** : FK `ON DELETE SET NULL`, filleul supprimé avant qualification → `annule` ; parrain supprimé → ligne figée, aucune récompense.
- **Boucles A↔B** : refus si `filleul_id` est déjà le parrain de `parrain_id` (contrôle dans `parrainage_saisir`) ; chaînes plus longues tolérées (chaque maillon a payé) mais comptées dans les plafonds.
- **Interrupteur** : `coin_config.parrainage_ouvert` (0 = tout fermé, fail-closed) ; une `refuse` ou un plafond atteint se dit dans l'ops-digest.

### Mails à prévoir (aucun à envoyer maintenant ; tous par `envoyerEmail()` de la porte, types à poser dans `email_logs`)
1. Parrain — « Un mois offert : ton filleul vient de s'abonner » : à la **pose** de la récompense (pas à la qualification), `support`, type `parrainage_recompense:<parrainage_id>` (récurrent par parrainage → index partiel dédié, pas `one_shot_unique`).
2. Parrain — « Ton code de parrainage » : à la demande depuis l'app (ou ajouté au welcome existant : décision, le welcome est one-shot et déjà parti pour 1 516 comptes).
3. Filleul — « Ton code est enregistré » : one-shot `parrainage_filleul_enregistre` → à ajouter à `email_logs_one_shot_unique` le jour même (règle `mails-paiements-comptabilite.md:72-75`).
4. Parrain store — « Ton code App Store / Play » : par `envoyer_mail_ponctuel`, à la main, pièce = code (option 1).
5. Nico — `ops_parrainage` : une ligne par pose, annulation, refus ; en plus dans l'ops-digest de 08:50.
Aucun mail marketing ; tout est `support`, donc hors plafond 2/24 h.

### Trous à lever avant de coder
- Les réglages et le coupon Stripe exigent un ordre explicite (création du coupon, événements `charge.refunded`/`charge.dispute.created` à cocher sur l'endpoint).
- La capture d'origine n'écrit rien depuis le 13/09 (`acquisition.js:120-127`) : le code de parrainage doit suivre le chemin **réparé** (RPC à la première session), sinon il sera perdu comme `acquisition_*`.
- Un filleul qui paie **via le store** et un parrain **Stripe** (ou l'inverse) : la récompense est posée selon le canal du **parrain**, la qualification selon le canal du **filleul** — les deux axes sont indépendants, à écrire noir sur blanc dans la règle.
- Avantage éventuel pour le filleul : à décider (coût doublé).
- Valeurs des plafonds et de la carence : à fixer par Nico.

### Proposition de découpage (après feu vert)
1. **Phase 1, base + app, sans Stripe** : colonnes, table `parrainages`, trigger du code, RPC `parrainage_saisir`, écran Réglages, capture `?parrain=` à la première session, interrupteur fermé par défaut, selftest des règles pures (états, refus, plafonds).
2. **Phase 2, qualification** : `checkout.session.completed` / `invoice.paid` (Stripe), `validate-*` et webhooks stores → `parrainage_qualifier` ; cron quotidien de carence ; annulations sur remboursement/impayé ; ops-digest.
3. **Phase 3, pose du crédit** (ordre Stripe) : coupon `PARRAINAGE_1_MOIS`, `parrainage_recompenser` (A, repli B), file `mois_offerts_restants` consommée à `invoice.paid` ; stores selon la décision (codes manuels ou Pépites) ; mails 1 et 3 en simulation sur la boîte de Nico d'abord.
