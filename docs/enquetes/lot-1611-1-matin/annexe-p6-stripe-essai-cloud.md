# P6 — Abandons de l'essai Cloud à la page Stripe (diagnostic seul, lu le 16/11/2026 vers 08:00, heure de Paris)

Aucun changement : rien n'a été écrit chez Stripe ni en base, aucun fichier suivi par git n'a été modifié. Lectures Stripe
(MCP, `livemode`, compte `acct_1TIT5gQZRA77vrWJ`) et base (`npx supabase db query --remote --read-only`). Les requêtes et
les extractions sont dans `.tmp-terminal/p6/` (q1…q21, `sessions_p1.json`, `sessions_oct.json`, `subs.json`).

## Résumé
- Les 3 personnes n'ont **rien tenté** sur la page Stripe : aucun SetupIntent ni abonnement chez leurs clients Stripe. Ce
  n'est donc ni un refus de la banque, ni un 3D Secure raté. Elles ont hésité puis quitté la page, souvent en quelques
  secondes (94a8e713 : de retour dans l'app 19 s après).
- **Google Pay est DÉSACTIVÉ** sur le compte (`pmc_1TIT6EQZRA77vrWJ1jlgy4Mo` : `google_pay.preference = off`). 2 des 3
  personnes étaient sur Android (navigateur Xiaomi, Samsung Internet) : elles devaient taper le numéro de leur carte.
- **Un bug a fait échouer 1 des 3 essais** (d4929a4e, iPhone) : quand l'essai d'une formule est demandé pendant le
  parcours d'entrée, la case des conditions s'ouvre DERRIÈRE le parcours. La personne a passé l'étape Cloud, fini le
  parcours, puis s'est retrouvée sur la page Stripe une minute plus tard (`src/entree/ParcoursEntree.jsx:232`).
- La page Stripe d'un essai ne porte **aucun texte de FillSell** (`custom_text` vide), aucun logo, aucune image de produit.
  La page Premium à 12,99 €, elle, a une phrase sous le bouton.
- Le taux réel depuis le 08/11 : **7 essais démarrés sur 15 pages Stripe ouvertes (47 %)**. C'est le même taux que les pages
  payantes sans essai (50 % du 01/10 au 07/11). Avec « 0 € aujourd'hui », la page de l'essai ne fait pas mieux qu'une page
  payante. Formules avec Cloud : 1 sur 4.
- Les 31 min d'expiration ne jouent aucun rôle dans ces abandons : les personnes sont parties bien avant. Ce délai protège
  la place serveur réservée 30 min. L'allonger ne rapporterait rien de mesurable et rouvrirait ce risque.

---

## 6.1 Ce que la personne voit sur la page Stripe d'un essai Cloud sur téléphone

### Les paramètres réels des 3 sessions (lus chez Stripe)
| | d4929a4e (sebinoux73) | 860752fa (djesstayena69) | 94a8e713 (cec3986) |
|---|---|---|---|
| Session | `cs_live_acyfWtjMDiQkG66aG4GnLD…` | `cs_live_aco4RQS4snNucxD4NfSepr…` | `cs_live_ac8UukEQlQizfvHeODpqEZ…` |
| Créée → expirée | 15/11 16:07:17 → 16:38:17 | 16:38:20 → 17:09:20 | 22:02:29 → 22:33:28 |
| Appareil (auth.sessions.user_agent, q5) | iPhone, iOS 27.2, **Chrome iOS** (CriOS 157) | Android 16, Redmi Note 14 Pro, **navigateur Xiaomi** (MiuiBrowser 14.67) | Android 10, **Samsung Internet** 30 |
| Client Stripe | `cus_VdLidpOTWfOkS9` | `cus_VdMDVUeGMNaC4h` | `cus_VdRSj18m9RBPVA` |
| Tentative de paiement | aucune (0 SetupIntent, 0 abonnement) | aucune | aucune |

Ces paramètres sont identiques pour les 3 sessions :
- `mode: subscription`, `ui_mode: hosted_page`, `locale: null` (Stripe suit la langue du navigateur), `currency: eur`.
- Une seule ligne : **« FillSell Premium + Cloud »**, prix `price_1UahzRQZRA77vrWJUC2gXx06` à **34,99 €/mois**. Produit
  `prod_Vbvr01QAVRBgB0`, description affichée sous le nom : « Formule Premium avec FillSell Cloud : un seul abonnement. »,
  aucune image (`images: []`).
- `amount_total: 0`, `payment_method_collection: always`. L'essai est posé par le code (`trial_period_days: 7`, voir plus bas),
  la session ne le renvoie pas.
- `custom_text` : les 4 champs sont `null`. `consent_collection: null`, `after_expiration: null`, `allow_promotion_codes: null`,
  `automatic_tax` désactivé, `billing_address_collection: null` (auto), `phone_number_collection` désactivé.
- `branding_settings` : `display_name: FillSell`, **`logo: null`, `icon: null`**, bouton `#0074d4` (bleu Stripe par défaut).
- `payment_method_options.card.request_three_d_secure: automatic`, `excluded_payment_method_types: ["klarna"]`.
- `payment_method_types` effectifs : **`card`, `link`, `amazon_pay`** (configuration `pmc_1TIT6EQZRA77vrWJ1jlgy4Mo`).
- E-mail prérempli : le client Stripe existe déjà (`customer` passé par `resoudreClient`).

Côté code, la session est construite par `parametresCheckoutFormule` (`supabase/functions/_shared/formules-serveur.js:274-289` :
`expires_at` à +31 min l. 280, `payment_method_collection: 'always'` l. 283, `trial_period_days: ESSAI_JOURS` et
`missing_payment_method: 'cancel'` dans `subscription_data`). Elle est ensuite complétée dans
`supabase/functions/create-checkout-session/index.ts:417-425` : `SANS_KLARNA`, `customer`, `success_url …&essai=1`,
`cancel_url /cancel?session_id=…`. Le seul `custom_text` du fichier est sur le chemin Premium, Pro et Business sans Cloud
(`index.ts:1155-1162`, « Paiement refusé ? Choisis « Carte »… »). Les formules avec Cloud et le Cloud seul n'en ont pas.
L'app appelle cette fonction depuis `src/cloud/achatFormuleCloud.js` (`stripe()`, `window.location.href = lu.url`).

### Les moyens de paiement réellement proposés
Lu dans `GET /v1/payment_method_configurations`. Il n'existe qu'une configuration, celle par défaut.
- **Carte** : oui (numéro, date, CVC, nom, pays et code postal selon le pays). Le 3D Secure peut être demandé au clic.
- **Apple Pay** : activé (`apple_pay: on`). Sur iPhone, le bouton apparaît si une carte est dans Wallet. Stripe Checkout
  hébergé n'a besoin d'aucun réglage de domaine. Pour d4929a4e (Chrome sur iOS 27), Apple Pay était **probablement**
  proposé : les navigateurs tiers d'iOS le permettent depuis iOS 16. C'est une déduction, je ne l'ai pas vu sur la page.
- **Google Pay** : **NON**. `google_pay: { available: false, preference: "off" }` : il est éteint dans les réglages Stripe.
  Aucune décision qui l'explique n'est écrite dans `docs/`. Les deux Android n'avaient pas de paiement en un geste.
  Réserve : même activé, Google Pay s'affiche surtout dans Chrome et les navigateurs Chromium qui l'exposent. Pour le
  navigateur Xiaomi et Samsung Internet, rien n'est garanti.
- **Link** : oui. Stripe propose Link si l'adresse préremplie a un compte Link.
- **Amazon Pay** : oui (bouton).
- **Klarna** : exclu (`excluded_payment_method_types`, `_shared/changement-formule.js:108`). **PayPal**, **Revolut Pay** et
  **SEPA** : indisponibles ou éteints. **Samsung Pay** est « on » dans la configuration, mais la documentation Stripe dit
  « Not supported when using Checkout in subscription mode ». Bancontact, Blik, EPS, MB Way, Pix et les moyens coréens sont
  « on » mais absents de `payment_method_types` : ils ne s'affichent pas.

### Le texte affiché par Stripe pour un essai (déduit, pas vu sur un écran)
Je n'ai pas vu la page : la voir aurait demandé de créer une session, ce qui est interdit. Le rendu ci-dessous est le
rendu standard de Stripe Checkout pour un abonnement avec `trial_period_days`, en français puisque `locale` suit le
navigateur. La documentation Stripe confirme que la page porte l'essai et le montant d'après. Les CGU s'appuient d'ailleurs
dessus (art. 6, version 2026-11-13 : « La page de paiement (Stripe, App Store ou Google Play) affiche, avant que vous
validiez, la date de fin de l'essai et le montant prélevé ensuite »). La formulation mot pour mot reste à confirmer sur un
écran.
- En-tête : « FillSell » en texte (pas de logo), flèche ← vers `cancel_url`.
- Titre : « Essayer FillSell Premium + Cloud », en gros **« 7 jours gratuits »**, puis **« Ensuite 34,99 € par mois à
  compter du 22 novembre 2026 »**. Le premier prélèvement tombe le 22/11/2026 pour les 3 sessions (16:07, 16:38 et 22:02 + 7 j).
- Récapitulatif : FillSell Premium + Cloud, 7 jours gratuits, 34,99 €/mois ensuite. « Total après la période d'essai :
  34,99 € ». **« Montant dû aujourd'hui : 0,00 € »**.
- Boutons express : Apple Pay (iPhone), Link, Amazon Pay. Puis le formulaire de carte. Bouton **« Démarrer l'essai »**,
  sous lequel Stripe ajoute sa mention standard d'autorisation des prélèvements futurs.
- Aucune phrase de FillSell : rien sur « arrête quand tu veux, rien ne sera prélevé », ni sur ce qu'est le Cloud. Aucune
  case CGU : elles ont été acceptées dans l'app juste avant.

### Ce qui s'est passé avant et après (usage_logs, q2 et q18)
- **d4929a4e** (compte créé à 16:04:26) :
  - Il choisit l'essai Premium + Cloud dans le parcours d'entrée à 16:06:12, puis « commencer » à 16:06:16
    (`formule_essai_demande`, `cloud_conditions_vues`).
  - Rien de visible ne se passe. 18 s plus tard (16:06:34), il **passe** l'étape (`passe_cloud`) et finit le parcours à 16:07:09.
  - Il coche les conditions à 16:07:12-13. Il est redirigé vers Stripe à 16:07:17. Plus aucune trace ensuite.
  - **Cause** :
    - le parcours d'entrée est à `zIndex 9980` (`ParcoursEntree.jsx:89`) ;
    - il ne passe à 1240, sous la case des conditions (`ConditionsCloudModale.jsx:78`, `zIndex: 1250`), que si
      `c.cloud?.achat?.etat === 'en_cours'` (`ParcoursEntree.jsx:232`, correctif du 04/11, commit ad26f13). Or
      `c.cloud.achat` désigne l'achat du **Cloud seul** ;
    - l'achat d'une **formule** passe par `c.formules.achat` (`src/entree/useFormulesEntree.js:49`), que ce test ne regarde
      pas. Depuis l'arrivée des formules (11/11), la case s'ouvre derrière le parcours. Elle n'est apparue qu'une fois le
      parcours fermé, et la personne a été envoyée sur Stripe alors qu'elle avait passé le Cloud.
- **860752fa** (compte créé à 16:33:57) :
  - Première annonce générée avec l'objectif, puis le mur de l'extension (`premium_cta_click origine mur_extension`).
  - Fenêtre des offres à 16:38:07, essai Premium + Cloud, conditions acceptées à 16:38:18, Stripe à 16:38:20.
  - Plus rien d'utile ensuite (deux `resolve_categorie_cache` à 16:38:31, restes de la page d'avant).
- **94a8e713** (compte créé à 21:53:20) :
  - Bandeau Cloud du Stock (`stock_annonces_cloud`), essai Premium + Cloud, conditions acceptées à 22:02:27, Stripe à 22:02:29.
  - **De retour dans l'app à 22:02:48** : il demande le mail d'installation de l'extension (`install_extension clic_mail`
    puis `mail_envoye`). Il a préféré la voie ordinateur.
  - Il n'est pas passé par la flèche ← de Stripe : aucune ligne `checkout_abandon` de `/cancel`. Il a fait retour dans le
    navigateur.
- Tous les trois avaient droit à l'essai : `cloud_essai_demandes.essai_permis = true` à 16:07:13, 16:38:18 et 22:02:27 (q17).
  La session a été créée 2 à 4 s après l'acceptation des conditions. Tous les trois étaient des comptes neufs : la carte
  leur a été demandée **3, 4 et 9 min après l'inscription** (q21).

---

## 6.2 Pourquoi l'expiration est à 31 min, et ce qu'on perdrait à l'allonger

### La règle et son origine
- Elle est écrite à `supabase/functions/_shared/formules-serveur.js:267-268` : « 31 min : la place gardée par la préparation
  (cloud_essai_preparer_moi, 30 min) — même règle que le Cloud seul. » Pour le Cloud seul, le commentaire est à
  `_shared/cloud-option.js:339-346`.
- Elle a été introduite par le commit **e1428de** (05/11/2026 21:24), lot « Ouverture du Cloud », point 7 « serveur plein au
  paiement ». Elle a été reprise pour les formules dans **ccb40e0** (12/11 01:06).
- Le motif est écrit dans `docs/enquetes/ouverture-cloud-0511/RAPPORT.md:159-175` :
  - la préparation (`cloud_essai_preparer_moi`, appelée par l'app avant toute carte) réserve une IP et une place serveur
    pendant 30 min (`cloud_param('reservation_min')`) ;
  - sans `expires_at`, la page Stripe restait ouverte 24 h, durée par défaut de Stripe, et pouvait être payée longtemps
    après le départ de la place ;
  - 31 min correspond au minimum de Stripe (30 min après la création) plus une marge d'horloge ;
  - une page expirée se refait depuis l'app, qui repasse par la préparation : la place est relue, et s'il n'y en a plus,
    la personne va sur la liste d'attente sans qu'aucune carte ne soit demandée.
- Le serveur vérifie aussi que la préparation est récente avant de créer ou de rouvrir une page :
  - `create-checkout-session/index.ts:387-392` exige `permis.fraiche` ;
  - `fraiche` est vrai si la préparation date de moins d'1 h et qu'une IP est réservée ou attribuée (définition en prod de
    `cloud_essai_permis`, q14).

### Ce qu'on perdrait à l'allonger (jusqu'à 24 h au plus chez Stripe)
1. **La garantie de place.** Une page payée après la fin de la réservation donne un compte actif sans IP. L'écran dit alors
   « démarre » puis « plus long que prévu », et l'orchestrateur alerte « Capacité atteinte ». Le 16/11, le pool compte
   **3 IP `disponible` (dont 1 réservée à cet instant)**, 5 `attribuee_essai` et 3 `attribuee_client` (q16). La marge est
   faible.
2. **Le contrôle d'éligibilité à l'essai.** Le droit à l'essai est décidé à la création de la page
   (`index.ts:393` `essaiCloudPermis(...) && permis.permis`, puis `essai` l. 404). Une page restée ouverte plusieurs heures
   peut être payée après qu'un essai a été pris ailleurs, par exemple sur l'App Store. Dans ce cas, le webhook ne fait que
   donner l'alerte : « un second abonnement vivant → alerte à support@, rien d'autre » (`stripe-webhook/index.ts:510`). Il
   n'empêche rien.
3. **La récupération de panier de Stripe** (`after_expiration.recovery`) n'impose pas d'allonger : 31 min est au-dessus du
   minimum de 30 min. Mais elle est **incompatible en l'état** avec la règle de place :
   - le lien de récupération reste valable 30 jours et crée une **copie** de la session ;
   - la personne repaierait donc sans repasser par la préparation (ni place, ni verrous d'essai) ;
   - elle demande aussi l'accord promotionnel (`consent_collection.promotions`, une case de plus sur la page), et le
     webhook n'écoute pas `checkout.session.expired` (événements cochés, relus le 13/11 :
     `docs/enquetes/zero-probleme-1211/paiements-1311-suite.md:64-65`). Aucun code ne traite cet événement aujourd'hui
     (recherche dans `supabase/functions/` : 0 occurrence).
4. **Les doublons d'abonnement** sont déjà évités sans délai long : un nouveau clic rouvre la même page si elle est encore
   ouverte, sinon il l'expire et annule les abonnements « incomplete » (`trierSessionsOuvertes` et `remplacerSessions`,
   `index.ts:412-416`, `223-240`).

**Ce que les faits disent** : aucun des 3 n'a atteint la limite de 31 min dans un état utile. Personne n'a tenté de payer, et
94a8e713 est revenu dans l'app 19 s après. Allonger le délai n'aurait sauvé aucun des trois.

---

## 6.3 Le taux réel depuis l'ouverture du Cloud (08/11/2026 00:00 → 16/11 ~08:00)

Source principale : les sessions Checkout chez Stripe (`GET /v1/checkout/sessions created ≥ 1794092400`, 29 sessions,
`has_more: false`). Côté app, `checkout_open` n'est journalisé que pour les forfaits sans Cloud (`App.jsx:3237`, q20 :
aucune ligne `tier` cloud). Le chemin des formules journalise `formule_cloud_issue` (`etat: redirige`) sans l'attendre
(`App.jsx:3763`). **Chez Stripe, une page ouverte = une session créée.** La session de test de Nico est exclue
(`cs_live_acAOZj9puNpEClJRul8c4L`, `nicolas.svobodny+test5`, Pro + Cloud, expirée).

### Total : **15 pages d'essai Cloud ouvertes (15 personnes différentes) → 7 essais démarrés = 47 %** (8 expirées, 0 ouverte)

| Formule (prix après l'essai) | Pages | Essais démarrés | Taux |
|---|---|---|---|
| Cloud seul (24,99 €), du 08/11 au 11/11 | 11 | 6 | 55 % |
| Premium + Cloud (34,99 €), le 15/11 | 3 | 0 | 0 % |
| Pro + Cloud (49,99 €), le 14/11 | 1 | 1 | 100 % |
| Business + Cloud (pas d'essai) | 0 | – | – |

| Canal au moment de la page (auth.sessions.user_agent q7, usage_logs `canal` q6/q8) | Pages | Démarrés | Taux |
|---|---|---|---|
| Web mobile, iPhone | 3 (d607ba20 Chrome iOS ✓, e4a30ec1 Safari ✗, d4929a4e Chrome iOS ✗) | 1 | 33 % |
| Web mobile, Android | 5 (d0ac0538 Chrome ✓, 79bf2d8b Edge ✓, 13e274de Edge ✓, 860752fa Xiaomi ✗, 94a8e713 Samsung ✗) | 3 | 60 % |
| Web ordinateur | 6 (d813639b ✓, b695d990 ✓, 82ed3d4c ✗, 387c8244 ✗, 8ac5bbda ✗, cfdfda6f ✗) | 2 | 33 % |
| Inconnu (ac58107b, compte supprimé depuis) | 1 | 1 | – |

À noter : sur Android, les trois réussites viennent de navigateurs Chromium (Chrome, Edge) et les deux abandons de
navigateurs constructeurs. Avec 5 cas, aucune conclusion n'est possible.

**Comparaison avec les pages payantes sans essai** :
- du 01/10 au 07/11 : 60 sessions, **30 payées (50 %)** (Premium 18/35, Pro 10/20, Business 2/5) ;
- depuis le 08/11 : 13 sessions, 6 payées, 5 expirées, 2 encore ouvertes (pages de 24 h).

**L'app iPhone et Android (sans page Stripe)**, sur `profiles.cloud_essai_debut ≥ 08/11` (q10) :
- **Apple** : 5 essais démarrés (Cloud seul : 8b457627, 7d22ae91, f0acd3af, c7c382b7 ; Pro + Cloud : cdf7007c).
- **Google** : 0.
- On ne connaît pas le nombre de feuilles ouvertes pour le Cloud seul en app (pas de `checkout_open`).
- Formules en app (`formule_cloud_issue`, q11) : iPhone, 3 tentatives (2 `actif`, 1 `annule`) ; Android, 1 `annule`
  (Business + Cloud).

**Ce que sont devenus les 7 essais Stripe** (`GET /v1/subscriptions`, q « subs.json ») :
- **1 payé** : `sub_1UZWtA…`, 24,99 € le 15/11 à 16:17, facture F4HSPMF0-0129 `paid`.
- **1 en essai sans arrêt** : `sub_1UaCf1…`, fin le 17/11 à 11:52.
- **2 en essai avec arrêt demandé** : `sub_1UaCZk…` (le 15/11 à 11:15), `sub_1UbU3y…` (le 15/11 à 02:01).
- **3 annulés 5 à 22 min après le début** : `sub_1UZzon…` (09/11 22:09 → 22:14), `sub_1UaJt8…` (10/11 19:35 → 19:50),
  `sub_1UaKqK…` (10/11 20:36 → 20:58). Ces trois arrêts sont antérieurs à la règle du 13/11, selon laquelle un arrêt
  laisse courir l'essai.

---

## 6.4 Propositions, classées (Nico décide, rien n'est fait)

Le critère est de faire monter les essais démarrés sans faire baisser les payants en fin d'essai.

**1. Corriger la case des conditions cachée derrière le parcours d'entrée (formules).**
- Correctif : baisser le parcours sous la case aussi quand `c.formules?.achat?.etat === 'en_cours'`
  (`ParcoursEntree.jsx:232`), en corrigeant la règle pour tous les achats du parcours.
- Gain : c'est une cause d'abandon prouvée (d4929a4e). Elle touche le chemin `entree_formule_cloud`, celui des comptes neufs.
- Risque : très faible. Le correctif d'origine, du 04/11, existe déjà ; il ne couvre simplement pas les formules.
- Ce qu'il faut : le code, un selftest verrou (rouge avant, vert après), la suite complète, le web et l'OTA. Rien chez Stripe.

**2. Activer Google Pay dans la configuration des moyens de paiement Stripe.**
- Ce qu'il faut : un réglage du tableau de bord, à faire par Nico ; aucun code.
- Gain : le paiement en un geste sur Android Chrome. 5 des 8 pages web mobile étaient sur Android, et 2 des 3 abandons du
  15/11. Le gain est incertain pour le navigateur Xiaomi et Samsung Internet, où le bouton n'est pas garanti. Les pages
  payantes en profitent aussi.
- Risque : faible à moyen, à surveiller au premier prélèvement de fin d'essai. Un portefeuille a déjà été refusé faute
  d'authentification (Apple Pay le 30/09, origine du `custom_text` des forfaits, `index.ts:1149-1162`). Pour un essai,
  l'authentification se fait sur la page au moment de l'enregistrement : le risque est plus bas qu'au premier paiement direct.

**3. Mettre une phrase de FillSell sur la page de l'essai, et la marque.**
- La phrase : `custom_text.submit` sous « Démarrer l'essai », vraie au mot près selon les CGU art. 6/7 et la règle du 13/11.
  Exemple : « 0 € aujourd'hui. Arrête quand tu veux avant le {date} dans Réglages › Abonnement : rien ne sera prélevé. »
  - Gain : les 3 personnes ont hésité sans rien tenter ; la phrase répond à la peur d'être prélevé, que Stripe n'aborde pas.
    La page Premium a déjà sa phrase, celle de l'essai n'en a aucune.
  - Ce qu'il faut : le code dans `parametresCheckoutFormule` (et `parametresCheckoutCloud`), un selftest, le texte validé par
    Nico, puis un essai en mode test de Stripe sur son feu vert.
- La marque : logo et icône (`branding_settings.logo` et `icon` sont `null`) et une image de produit. C'est un réglage
  Stripe, par Nico.
- Risque : faible.

**4. Le retour dans l'app après une page non payée.**
- (a) Un bandeau : « Ton essai n'a pas démarré, rien n'a été prélevé — Reprendre (7 jours gratuits) ». Il s'affiche au
  retour, ou au rechargement, si `fs_checkout_ctx` est récent et qu'aucun essai n'existe. Le bouton repasse par la
  préparation.
  - Gain : il vise exactement le cas de 94a8e713, revenu dans l'app 19 s après. Pas de mail, pas de nouveau réglage Stripe.
  - Risque : faible (insistance), à borner à une fois par tentative.
- (b) **Un bug à corriger à part** : sur `/cancel`, après un refus de carte, « Payer par carte » rouvre le mauvais produit.
  - Le serveur rend `metadata.plan_type` comme formule (`create-checkout-session/index.ts:258`), et `Cancel.jsx:105` repart
    sur `product: diag.plan`.
  - Pour un essai Premium + Cloud, `plan_type` vaut `standard` : le bouton ouvre **Premium à 12,99 € payé tout de suite,
    sans Cloud ni essai**. Pro + Cloud ouvrirait Pro.
  - Aucun des 3 cas n'était concerné (pas de tentative), mais la règle est fausse.

**5. Mesurer avant de toucher au reste.**
- Côté code : journaliser `checkout_open` (attendu) pour le Cloud et les formules, comme pour les forfaits.
- Côté Stripe, par Nico : cocher `checkout.session.expired` sur le point de terminaison du webhook, pour compter les pages
  expirées côté serveur.
- Aucun gain direct, mais aujourd'hui le tunnel du Cloud ne se lit qu'en croisant Stripe et usage_logs à la main.

**6. Une relance après expiration, avec accord.**
- Ce qu'il faut : mail = ordre explicite de Nico + `envoyer_mail_ponctuel` + accord ; push = app native seulement (les
  personnes du web mobile n'ont pas de push).
- Gain : faible au volume actuel (3 pages expirées le 15/11). La proposition 4a couvre déjà le retour immédiat.
- La récupération native de Stripe (`after_expiration.recovery`) est déconseillée telle quelle : elle copie la session sans
  repasser par la place ni par les verrous d'essai (voir 6.2.3).

**7. La durée d'expiration : garder 31 min.**
- Aucun gain mesuré (voir 6.2).
- Risques de l'allonger : la capacité (3 IP libres), une double souscription que le webhook signale sans l'empêcher.
- À reconsidérer seulement si la réservation de place est allongée du même délai.

**8. Ne plus exiger la carte** (`payment_method_collection: if_required`, `missing_payment_method: cancel`).
- Gain : c'est le plus fort levier sur les essais démarrés, puisqu'il supprime la friction principale, surtout sans Google Pay.
- Risques :
  - les payants en fin d'essai baisseront, car payer demandera un geste. Avec la carte déjà, sur 7 essais : 1 payé, 1 en
    attente, 5 arrêtés ;
  - chaque essai prend une place serveur et une IP, et il n'en reste que 3 ;
  - l'abus : la documentation Stripe met en garde contre les inscriptions de robots ;
  - il faudrait réécrire l'art. 6 des CGU et rétablir un rappel de fin d'essai pour demander la carte, alors que le rappel
    a été supprimé le 13/11.
- Ce qu'il faut : une décision de Nico, les CGU, le webhook, les mails et la capacité. **Non recommandé maintenant.**

**À trancher par Nico, hors Stripe** : les trois abandons du 15/11 sont des comptes créés 3 à 9 min plus tôt. La carte
leur est demandée avant toute valeur vue (parcours d'entrée, premier mur). Proposer l'essai plus tard, par exemple après
le premier relevé ou la première publication, est une question de produit, pas de page de paiement.

---

## Sources
- Stripe (lecture seule) :
  - sessions `cs_live_acyfWtjMDiQkG66aG4GnLD…`, `cs_live_aco4RQS4snNucxD4NfSepr…`, `cs_live_ac8UukEQlQizfvHeODpqEZ…` et
    leurs `line_items` ;
  - configuration `pmc_1TIT6EQZRA77vrWJ1jlgy4Mo` (seule existante) ;
  - SetupIntents et abonnements des clients `cus_VdLidpOTWfOkS9`, `cus_VdMDVUeGMNaC4h`, `cus_VdRSj18m9RBPVA` : listes vides ;
  - 29 sessions depuis le 08/11 et 60 du 01/10 au 07/11, 13 abonnements créés depuis le 08/11, factures de `sub_1UZWtA…` ;
  - documentation Stripe : *abandoned-carts* (minimum `expires_at` 30 min, lien de récupération 30 j, copie de session),
    *free-trials*, *payment-method-support* (Samsung Pay hors mode abonnement), *apple-pay* (Checkout hébergé sans
    réglage), *manage-trial-compliance*.
- Base (lecture seule, fichiers SQL dans `.tmp-terminal/p6/`) :
  - q1 (liste des `feature` du tunnel), q2 et q18 (chronologies des 3 personnes), q5 et q7 (`auth.sessions.user_agent`),
    q6 et q8 (canal), q10 (essais par canal) ;
  - q11 et q12 (issues des formules et clics), q14 et q15 (`pg_get_functiondef` de `cloud_essai_permis` et
    `cloud_essai_preparer_moi`), q16 (pool d'IP), q17 (préparations), q20 (`checkout_open/abandon/issue`), q21 (âge des
    comptes).
- Code :
  - `supabase/functions/_shared/formules-serveur.js:267-289`, `_shared/cloud-option.js:339-363`,
    `_shared/changement-formule.js:108` ;
  - `create-checkout-session/index.ts:258, 387-428, 1155-1162`, `stripe-webhook/index.ts:510` ;
  - `src/cloud/achatFormuleCloud.js` (`stripe()`), `src/App.jsx:3237, 3761-3763, 10559-10560` ;
  - `src/entree/ParcoursEntree.jsx:86-90, 232`, `src/entree/useFormulesEntree.js:49`, `src/entree/EtapesFormules.jsx:166-175`,
    `src/cloud/ConditionsCloudModale.jsx:78`, `src/pages/Cancel.jsx:41, 105`.
- Historique : commits e1428de (05/11, expiration 31 min) et ccb40e0 (12/11, formules), `docs/enquetes/ouverture-cloud-0511/RAPPORT.md:159-175`.
