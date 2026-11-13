# PAY — « Paiements et abonnements : tout doit être parfait et clair » (lot du 13/11, 2e réponse de Nico)

Copie : `scratchpad\wt-pay` (base d73cd9d, LF). **Rien en prod** : aucune écriture en base, aucun déploiement, rien chez
Stripe / App Store Connect / Play Console, aucun mail, aucun compte connecté. Lectures : base `--read-only` (4 requêtes
légères, id8), `functions list`, documentation publique Apple / Google. Heures de Paris.
Deux cartographies en lecture seule ont été faites en parallèle (serveur ; textes des formules classiques, du Cloud seul et
du site) : leurs constats sont repris ci-dessous et vérifiés dans le code quand ils fondent une correction.

---------------------------------------------------------------------------------------------------------------------
## 0. Les écarts (texte ≠ réalité) — corrigés dans ma copie, sauf mention

| # | Écart (avant) | Gravité | État |
|---|---|---|---|
| P1 | **(b) iPhone : « 7 jours gratuits » montré à un identifiant Apple qui n'y a pas droit** (offre d'intro déjà utilisée dans le groupe, ou abonné en cours du groupe) : Apple prélève tout de suite. Même chose pour le Cloud seul (groupe « FillSell Cloud » : 8b457627, 7d22ae91, f0acd3af, c7c382b7 l'ont déjà utilisée). | haute | CORRIGÉ sans binaire : l'historique Apple est LU (§ 2) ; « Pas d'essai : {P} prélevés aujourd'hui » avant la feuille d'Apple. |
| P2 | Web : « Se désabonner » montré à un abonné App Store / Google Play / offert ; le serveur passait `is_premium=false` SUR-LE-CHAMP et l'app disait « Abonnement annulé. Tu gardes l'accès jusqu'à la fin de la période » (rien annulé chez la boutique, accès coupé). Client Stripe sans abonnement vivant : « succès » sans rien annuler. | haute (droits) | CORRIGÉ : `cancel-subscription` 409 `rien_a_resilier` + la phrase vraie (où ça s'arrête), aucune écriture ; bouton caché sans client Stripe. |
| P3 | Formule EN ESSAI résiliée par « Se désabonner » : `cancel_at_period_end`, le webhook l'annulait net, l'accusé promettait « accès jusqu'au {fin d'essai} ». | moyenne | CORRIGÉ : arrêtée tout de suite, rien prélevé, mail d'arrêt d'essai (confirmé par les factures Stripe), plus d'accusé faux. |
| P4 | Montée d'un abonné (Premium → Pro / Business ; X → X + Cloud) : **aucun écran ne disait que la différence est prélevée AUJOURD'HUI** (Stripe `always_invoice`), ni le prix entier aujourd'hui (Apple), ni le prorata (Google). Note « Tu paies la différence au prorata… » sans date. | haute (Nico : « date du 1er prélèvement ») | CORRIGÉ : note par canal (cartes « + Cloud », Réglages, CAS 4 / CAS 5 classiques). |
| P5 | Souscription neuve sans essai : « {P}/mois, sans engagement. » sans dire quand part le prélèvement. | moyenne | CORRIGÉ : « Pas d'essai : {P} prélevés aujourd'hui, puis chaque mois. » |
| P6 | Boutique qui offre sa semaine à un compte dont l'essai FillSell a servi : carte « {P}/mois », question « App Store **peut** t'afficher… » ; Cloud seul : « Le Cloud démarre donc tout de suite » (faux : rien 7 jours, puis 1er paiement). | moyenne | CORRIGÉ : la carte et la question le disent (« va t'afficher… démarre au premier paiement, 7 jours plus tard »). |
| P7 | (c) Abonné App Store / Google Play qui ajoute le Cloud : aucun essai possible, mais le texte ne disait ni « pas d'essai » ni « prélevé aujourd'hui ». | moyenne | CORRIGÉ (texte) — voir § 3 pour l'essai lui-même. |
| P8 | Mentions sous la vue « Avec Cloud » : « le prix affiché est prélevé à la confirmation » sous une carte « 0 € aujourd'hui ». | faible | CORRIGÉ : « … à la confirmation, ou à la fin de l'essai gratuit quand il est annoncé, … » (vues avec essai seulement). |
| P9 | Mail de début d'essai d'une formule : « On te prévient la veille » (retiré du reste le 12/11, décision 5a) ; Apple / Google : « arrêter … dans Réglages → Abonnement » (faux : chez eux). | moyenne | CORRIGÉ |
| P10 | Mail d'arrêt programmé d'une formule Stripe : « Réglages → Abonnement → Garder le Cloud : rien ne sera coupé » — ce geste ne fait rien pour une formule (cancel-subscription ne lève que l'arrêt d'un Cloud seul). | moyenne | CORRIGÉ (phrase retirée ; Apple / Google gardent « remets le renouvellement »). |
| P11 | Facture de prorata d'une montée Stripe → mail « {n} est renouvelée ». | faible | CORRIGÉ : « Ta formule passe à {n} … différence au prorata ». |
| P12 | Arrêt de l'essai du Cloud d'un abonné Stripe : « {n} est arrêtée, sans aucun prélèvement », sans dire que sa formule reste facturée. | moyenne | CORRIGÉ : « Rien n'est prélevé pour le Cloud. Ta formule {palier} continue comme avant. » |
| P13 | Impayé boutique d'une formule : « le Cloud est en pause » (faux : impayé = gratuit, toute la formule). | faible | CORRIGÉ |
| P14 | Bande « géré par Apple / Google » choisie par l'APPAREIL : un abonné Stripe sur iPhone lisait « géré par Apple » ; lien Google = page du produit Founder pour tous. | moyenne | CORRIGÉ : canal qui facture (profil) ; « payé par carte : sur le web » ; lien Google du produit du compte. |
| P15 | « Paiement reçu » après un ESSAI (0 prélevé) ou un achat iPhone en attente d'approbation (« Demander l'achat »). | faible | CORRIGÉ (formules et Cloud seul). |
| P16 | Achat rendu par Google mais non confirmé par le serveur → « Google Play a refusé l'achat (PURCHASE_NOT_CONFIRMED_BY_SERVER) : **rien n'a été débité** » ; iPhone : « ❌ Premium not confirmed by server ». | moyenne | CORRIGÉ : « Ton paiement est passé chez la boutique, mais FillSell ne l'a pas encore confirmé. Ne rachète pas : … Restaurer mes achats … ». |
| P17 | « -50 % … jusqu'au 31 octobre » encore montré le 13/11. | faible | CORRIGÉ (`FIN_OFFRES`). |
| P18 | Parcours d'entrée (Android) : « 0 € » écrit en dur. | faible | CORRIGÉ (`zeroAffiche`). |
| P19 | Cloud seul pris en boutique, essai arrêté par un verrou (compte de plateforme) : « Tu peux prendre le Cloud sans essai » — la boutique prélèvera à la fin de sa semaine. **Aucun cas en prod** (cloud_essai_refus NULL pour les 4 essais App Store ; 8b457627 et 7d22ae91 ont coupé chez Apple, AUTO_RENEW_DISABLED). | moyenne | CORRIGÉ (texte : « ton abonnement App Store continue … arrête-le dans tes abonnements Apple »). |
| **Restent (non corrigés, décision ou lot à part)** | | | |
| R1 | **Android : l'offre choisie à l'achat** — le module prend la 1re offre Google du forfait (essai OU base, ordre non garanti par Google) : « 7 jours gratuits » peut être suivi d'un prélèvement immédiat. Jamais éprouvé (0 achat Google du Cloud ni d'une formule). | haute (à prouver) | § 4 (d). Le texte suit l'éligibilité réelle (Google ne rend l'offre qu'à qui y a droit) ; seul le choix d'offre reste à prouver. |
| R2 | iPhone avec abonnement Stripe / Google qui monte de palier classique : achat Apple = 2e abonnement (aucune garde ; Android en a une). Web : un abonné boutique qui monte au-dessus de son palier passe au Checkout (2e abonnement). | haute (argent) | NON corrigé (logique d'achat, pas un texte) — question Q3. |
| R3 | Serveur (cartographie) : remboursement Stripe non traité ; remboursement Apple du Cloud seul sans alerte ; remboursement Google d'une formule peut laisser le Cloud ouvert (voided avant REVOKED) ; `validate-google-purchase` rouvre les droits en `IN_GRACE_PERIOD` (le webhook les coupe) ; `validate-apple-receipt` écrit `is_premium=false` sans regarder Stripe / Google ; aucun garde serveur contre un achat classique par un abonné formule Stripe ni un 2e Cloud seul. | moyenne | NON corrigé (droits, pas des textes) — liste au § 6, à prioriser par Nico. |
| R4 | Conditions du Cloud (texte versionné) : « un rappel vous est envoyé la veille » (retiré des écrans le 12/11) et « la date de fin … affichée avant l'enregistrement » (pas dans la fenêtre d'offres). `Legal.jsx` : « annulation automatique … Apple/Google » à la suppression du compte (faux). Site : « Disponible … sur Android et sur le web » (iPhone ouvert le 13/11) ; « tu arrêtes le Cloud en un geste ». | moyenne | NON touché : textes juridiques (version des conditions) et site vitrine (terminal marketing, `site:dater`) — Q5. |
| R5 | `VoieSansOrdinateur` / page /extension : « Option FillSell Cloud, {prix du Cloud seul}/mois » alors que le tap mène aux formules (34,99 € et plus) ; « Tu l'arrêtes en un geste » sur mobile sans dire où ; « Carte demandée » sur iPhone / Android. | faible | NON corrigé (textes de Nico à reformuler) — Q5. |

---------------------------------------------------------------------------------------------------------------------
## 1. Le tableau (a) — situations × canaux

Lecture : **écran** (fichier) · **texte affiché AVANT la feuille de paiement** (après correctif ; ⟵ avant si différent) ·
**ce qui est prélevé, et quand** (la vraie règle, source) · **mails** · **écart**.
Sources des règles : Stripe = `supabase/functions/create-checkout-session/index.ts` (CCS), `_shared/formules-serveur.js`
(FS : `voieFormuleStripe` l. 171, `parametresCheckoutFormule` l. 262, `parametresEssaiCloudAbonne` l. 293),
`cancel-subscription` (CAN), `changer-formule` (CF), `_shared/descente-formule.js` (DF) ; Apple = developer.apple.com
« Implementing introductory offers in your app » + « Handling subscriptions billing » (relus le 13/11) ; Google =
developer.android.com « Integrate » (offres éligibles) + « Subscriptions » (replacement modes). Mails = `_shared/cloud-mails.js` (CM),
`paiement-echoue.js` (PE), `emails-fillsell.ts` (accusé). Écrans : `cloud/OffresAvecCloud.jsx` + `formulesCloud.js`
(cartes), `cloud/BlocFormulesReglages.jsx`, `cloud/BlocCloudReglages.jsx`, `components/ConversionModal.jsx` (CAS 3/4/5),
`reglages/SousPageAbonnement.jsx`, `cloud/achatFormuleCloud.js` / `achatCloud.js` (questions).

### 1.1 Formules « + Cloud » (Premium + Cloud 34,99 · Pro + Cloud 49,99 · Business + Cloud 79,99 €/mois)
| Situation | Web / Stripe | iPhone / Apple | Android / Google |
|---|---|---|---|
| Nouveau client, essai permis | « 7 jours gratuits · Puis {P}/mois… 0 € aujourd'hui » → Checkout `trial_period_days: 7` : **0 € puis {P} à J+7** (FS l. 274). Mails : `cloud_essai_debut` (« Ensuite … {P} par mois, prélevés sur ta carte »), veille, `cloud_paiement`. ✅ | Identifiant Apple vierge / échu sans offre utilisée : idem « 7 jours gratuits » → offre d'intro Apple, **0 € puis {P} à J+7** ✅. ⛔ Identifiant qui a déjà eu la semaine du groupe, ou abonné du groupe : **« Pas d'essai : {P} prélevés aujourd'hui »** ⟵ « 7 jours gratuits » (P1). Historique illisible : « 7 jours gratuits si ton identifiant Apple n'a jamais eu la semaine… ; sinon {P} prélevés aujourd'hui ». Mails : idem, « C'est Apple qui prélève ». | Google rend l'offre `{x}-cloud-trial-7d` (éligible) : « 7 jours gratuits » ; sinon « Pas d'essai : {P} prélevés aujourd'hui ». ⚠ R1 (offre choisie à l'achat). |
| Business + Cloud | « Pas d'essai : 79,99 € prélevés aujourd'hui » ⟵ « 79,99 €/mois, sans engagement » (P5) ; payé au Checkout (FS lève si essai). Mail `cloud_paiement` « a commencé ». | idem ; Apple : aucune offre d'intro (retirée 11/11 22:09) → prélevé aujourd'hui ✅ | idem ; aucune offre Google ✅ |
| Essai FillSell déjà pris (ou verrou) | « Pas d'essai : {P} prélevés aujourd'hui » ; Checkout sans essai (CCS l. 371). | Apple offre sa semaine : carte « Ton essai FillSell a déjà servi : App Store t'affichera « 1 semaine gratuite », mais {n} ne démarre qu'au premier paiement de {P}, 7 jours plus tard » + question « App Store va t'afficher… » ⟵ « peut » (P6) ; serveur : rien avant le 1er paiement (FS l. 398, décision 8). Apple ne l'offre pas : « prélevés aujourd'hui », aucune question ⟵ « peut t'afficher 1 semaine » (P1). | idem selon l'offre rendue par Google. |
| Abonné sur un AUTRE canal | Aucune carte achetable ; note « Le changement se fait dans ton abonnement App Store / Google Play » ; serveur 409 `abonnement_autre_canal` (FS l. 218). Cloud seul de boutique : formules masquées. ✅ | Abonné Stripe : « … payé par carte : le changement se fait sur le web » ✅ | idem ✅ |
| Abonné du même canal qui AJOUTE le Cloud (montée) | Même palier, essai permis : « Essayer le Cloud 7 jours » + « Pendant 7 jours, tu ne paies que ta formule {palier}… la différence … ajoutée à ta facture du {échéance} » → schedule, **rien de plus avant la facture suivante** (FS l. 313 `create_prorations`) ✅. Sinon : « Pas d'essai : la différence au prorata jusqu'au {échéance} est prélevée aujourd'hui sur ta carte, puis {P}/mois » ⟵ sans date (P4) ; `always_invoice` (CCS l. 452). Mail : « Ta formule passe à {n} » ⟵ « est renouvelée » (P11). | « Pas d'essai : … {P} sont prélevés aujourd'hui sur ton compte Apple, puis chaque mois » ⟵ « Le changement se fait dans ton abonnement App Store » seul (P7) ; Apple : montée immédiate, prix entier, prorata de l'ancien rendu par Apple. | « Pas d'essai : … la différence au prorata est prélevée aujourd'hui, puis {P}/mois à ta date habituelle » (P7) ; `replacementMode 2` = CHARGE_PRORATED_PRICE. |
| Montée PENDANT l'essai | Vers une formule avec essai : « Ton essai continue jusqu'au {fin}. Ensuite : {n}, {P}/mois » (`proration_behavior: none`) ✅ ; vers Business + Cloud : « … ton essai s'arrête, 79,99 € sont prélevés aujourd'hui » (`trial_end: now`) ✅ | « Ton essai s'arrête : … {P} sont prélevés aujourd'hui sur ton compte Apple » ⟵ « il **peut** l'arrêter » (P4) | « Ton essai s'arrête : … Google Play prélève aujourd'hui une somme au prorata. Google Play t'affiche le montant avant que tu valides » (Google : « remaining value of the free trial is carried over ») ⚠ à prouver (§ 4) |
| Descente (fin d'essai : Pro + Cloud → Premium + Cloud) | changer-formule `programmer` : pendant l'essai changement immédiat sans prorata, 1er débit au prix choisi ; hors essai, schedule à `current_period_end` (DF l. 81-101). « C'est noté : {n} commence le {date} » ✅. Aucun mail Stripe de descente (écart mineur, R3). | Apple : descente à la prochaine échéance (= fin de l'essai) ✅ | `replacementMode 6` DEFERRED ✅ |
| Arrêt de l'essai | « Arrêter l'essai » → `subscriptions.cancel` immédiat, rien prélevé (CAN l. 229) ; mail « {n} est arrêtée, sans aucun prélèvement » (factures relues à 0) ✅. Essai d'abonné : « Ta formule {palier} continue » ⟵ « est arrêtée, sans aucun prélèvement » (P12). « Se désabonner » pendant l'essai : arrêt immédiat ⟵ accusé faux (P3). | Dans les abonnements Apple ; mail d'arrêt seulement si Apple confirme `autoRenewStatus` 0 ✅. Palier gardé jusqu'à la fin de la semaine (cartographie E13 : le mail dit « arrêtée ») — mineur. | idem Google ✅ |
| Résiliation (payée) | Stripe `cancel_at_period_end` (CAN l. 325) ; accusé `resiliation_ar` « accès jusqu'au {fin} » ✅ ; **aussi** `cloud_arret_programme` du webhook (2 mails, R3) ; « Garder le Cloud » retiré du mail (P10). | Chez Apple ; mail « Apple nous a confirmé… » ✅ | chez Google ✅ |
| Impayé | `past_due` → palier ET Cloud coupés (cloud-option l. 173) ; mail PE « Ton paiement n'a pas abouti … Stripe retentera le {jour} » (n'annonce pas la pause de la formule : omission, R3). | `DID_FAIL_TO_RENEW` → off ; mail « {n} est en pause : le Cloud et les avantages de ta formule » ⟵ « le Cloud est en pause » (P13) | ON_HOLD / GRACE → off (webhook) ; ⚠ validate-google-purchase rouvre en GRACE (R3) |
| Remboursement | **Non traité** (aucun `charge.refunded`) — R3 | REFUND / REVOKE → off + alerte « ↩️ Remboursement » à support@, aucun mail client ✅ (Cloud seul : sans alerte, R3) | voided → alerte ✅ ; Cloud parfois laissé ouvert (R3) |

### 1.2 Cloud seul (24,99 €/mois ; vendu là où les formules ne le sont pas : Android vc37, comptes masqués)
| Situation | Web / Stripe | iPhone / Apple | Android / Google |
|---|---|---|---|
| Nouveau, essai permis | Checkout `trial_period_days 7` : 0 € puis 24,99 € à J+7 ✅ (compte gratuit : droits Pro pendant l'essai) | Semaine annoncée SEULEMENT si l'historique Apple le permet ; sinon question « … ta boutique ne propose pas d'essai gratuit à ce compte. Le Cloud démarre donc tout de suite : 24,99 € prélevés aujourd'hui » ⟵ « à 24,99 €/mois » (P1, P5) ; inconnu : « Apple te dit dans sa fenêtre … sinon 24,99 € prélevés aujourd'hui ». Réglages : « Essayer 7 jours gratuits » seulement si 'oui' ⟵ toujours. | offre `cloud-trial-3d` rendue ou non ✅ (R1) |
| Essai déjà pris | « … Le Cloud démarre donc tout de suite : 24,99 € prélevés aujourd'hui » ✅ | Apple offre sa semaine : « … va t'afficher « 1 semaine gratuite » : cette semaine-là, le Cloud ne tourne pas ; il démarre au premier paiement de 24,99 €, 7 jours plus tard » ⟵ « démarre tout de suite » + toast après coup (P6) | idem |
| Verrou après l'achat (boutique) | — | « … ton abonnement App Store continue. Sans geste, App Store prélèvera … Pour ne rien payer, arrête-le dans tes abonnements Apple » ⟵ « Tu peux prendre le Cloud sans essai » (P19) | idem Google |
| Arrêt essai / résiliation / impayé | immédiat, rien prélevé / fin de période / « FillSell Cloud est en pause » ✅ | chez Apple, mail sur confirmation ✅ | chez Google ✅ |
| Achat en attente / essai lent | — | « Achat en attente d'approbation … Rien n'est prélevé avant » / « C'est parti : ton essai gratuit démarre » ⟵ « Paiement reçu » (P15) | idem |

### 1.3 Formules classiques (Premium 12,99 · Pro 29,99 · Business 59,99 €/mois, sans essai sur aucun canal)
| Situation | Web / Stripe | iPhone / Apple | Android / Google |
|---|---|---|---|
| Nouveau | carte « {P}/mois · Passer X » + mentions « prélevé … à la confirmation » ; Checkout plein prix au paiement ✅ ; aucun mail client (alerte support@) | idem, feuille Apple (INITIAL_BUY 30-31 j, prod : 9bcc16d0, 82ae95fe, 010ff35b, 8a7f95d5, 229c7b07) ✅ | idem ✅ |
| Montée (CAS 4 / CAS 5) | « Pas d'essai : la différence au prorata jusqu'à ta prochaine échéance est prélevée aujourd'hui sur ta carte, puis le prix de la nouvelle formule chaque mois » ⟵ rien (P4) ; `always_invoice` (CCS l. 932) | « … le prix de la nouvelle formule est prélevé aujourd'hui sur ton compte Apple » ⟵ rien (P4) ; ⚠ abonné Stripe/Google sur iPhone = 2e abonnement (R2) | « … Google Play prélève aujourd'hui la différence au prorata… » ⟵ rien ; mode 2 |
| Abonné sur un autre canal | Premium ≤ palier boutique : 409 `deja_abonne` « Tu as déjà cet abonnement par … : rien n'a été débité » ✅ ; montée au-dessus : laissée passer (R2) | aucune garde (R2) | garde Stripe → web (App.jsx l. 3296) ✅ |
| Résiliation | « Se désabonner » (client Stripe seulement) ; « Tu gardes ton accès jusqu'à la fin de la période » ✅ ; accusé `resiliation_ar` ✅. Abonné boutique / offert : phrase du serveur (où arrêter) ⟵ « Abonnement annulé » + accès coupé (P2) | bande « géré par Apple » (canal qui facture) ⟵ appareil (P14) | bande « géré par Google Play », lien de SON produit (P14) |
| Impayé / remboursement | `past_due` = gratuit ; mail PE ✅ / non traité (R3) | DID_FAIL_TO_RENEW off ✅ / REFUND alerte ✅ | ON_HOLD off ✅ / voided alerte ✅ |
| Achat non confirmé | — | « Ton paiement est passé chez la boutique, mais FillSell ne l'a pas encore confirmé. Ne rachète pas… » ⟵ « ❌ Premium not confirmed by server » (P16) | idem ⟵ « … rien n'a été débité » (faux, P16) |

Lignes réelles (lecture seule, 13/11) : aucun achat de formule « + Cloud » chez Apple ni Google depuis l'ouverture
(stores_notifications_journal, produits `*.cloud` depuis le 12/11 : seulement le Cloud seul c7c382b7 et le renouvellement
Sandbox de 5322fa18) ; essais en cours : Stripe d607ba20 (→ 15/11), b695d990, d0ac0538 (→ 17/11) ; Apple f0acd3af (→ 16/11),
c7c382b7 (→ 19/11) ; 8b457627 et 7d22ae91 ont coupé chez Apple le 08/11 (AUTO_RENEW_DISABLED) ; aucun `cloud_essai_refus`.

---------------------------------------------------------------------------------------------------------------------
## 2. (b) La semaine d'Apple : lue, sans binaire neuf

- **Ce que le binaire en vente sait déjà faire** : `@capgo/native-purchases` 8.3.3 n'expose ni `introductoryPrice` ni
  `isEligibleForIntroOffer` (`Product+CapacitorPurchasesPlugin.swift`), MAIS `getPurchases()` = `Transaction.all` de StoreKit 2
  (`TransactionHelpers.collectAllPurchases`) : « all the customer's transactions for your app … Auto-renewable subscriptions,
  including all renewals » (doc Apple), pour l'identifiant Apple connecté (celui qui paiera), avec `jwsRepresentation`
  (transaction signée, vérifiée par StoreKit) dont la charge porte `offerType` (1 = offre d'introduction), et
  `expirationDate` / `isActive` / `subscriptionState`. Déjà appelé par « Restaurer les achats ».
- **La règle appliquée** (`src/lib/eligibiliteApple.js`, pure) : par groupe — « FillSell Plan » (Founder, Standard, Pro,
  Pro 2, Business, les trois « + Cloud ») et « FillSell Cloud » (cloud.sub) : abonnement en cours → non ; offre d'intro déjà
  utilisée → non ; sinon oui. ⚠ Correction de NA : un Apple ID qui a déjà eu un abonnement du groupe n'est PAS forcément
  inéligible — un ex-abonné échu SANS offre utilisée y a droit (doc Apple) ; or aucune formule classique n'a jamais eu d'offre
  (INITIAL_BUY à 30-31 j en prod) : tous les anciens abonnés App Store échus auront la semaine des « + Cloud ».
- **Lecture** : `chargerPrixBoutique.js` lit l'historique à chaque lecture des prix sur iPhone, borné à 8 s ; échec → null
  (« inconnu ») ; `etatEssaiBoutique` → 'oui' | 'non' | 'inconnu' ; un binaire futur qui rendrait `introductoryPrice` l'emporte.
- **Quand on ne peut pas savoir** (lecture échouée) : jamais « 7 jours gratuits » affirmé ; la carte dit les deux issues,
  la question avant la feuille aussi si l'essai FillSell est refusé.
- **Ce qu'un binaire neuf apporterait** (non fait) : `Product.SubscriptionInfo.isEligibleForIntroOffer` /
  `subscription.introductoryOffer` (réponse d'Apple elle-même, sans dépendre de l'historique local ni du compte App Store
  connecté), et la feuille StoreKit `subscriptionStoreView` ; plus les offres promotionnelles (§ 3).
- Limite : téléphone non connecté à l'App Store (historique vide → « oui ») ; si la personne se connecte à la feuille avec un
  autre identifiant, Apple montre ses vraies conditions dans la feuille. Partage familial : compté comme le sien (prudent).

## 3. (c) Essai pour les abonnés App Store / Google Play

- **Le web** : un abonné Stripe a « Essayer le Cloud 7 jours » (essai d'abonné : il ne paie que sa formule 7 jours, puis
  bascule automatique, différence sur la facture suivante).
- **Apple** : un abonné du groupe n'a JAMAIS l'offre d'introduction (« Existing subscribers are not eligible … upgrading »).
  Le seul outil : les **offres promotionnelles** (signées par le serveur avec la clé d'achats intégrés) — `purchaseProduct`
  du module 8.3.3 ne passe que `quantity` et `appAccountToken` (NativePurchasesPlugin.swift) : **binaire neuf + création des
  offres dans ASC** (Nico). Les **offer codes** (lien `apps.apple.com/redeem`) se passent de binaire mais exigent ASC, sortent de
  l'app (pas d'`appAccountToken`) et pour un abonné en cours prennent effet comme un changement de produit : non retenu.
- **Google** : un abonné qui monte ne reçoit pas l'offre « nouveaux clients » ; une offre « déterminée par le développeur »
  existe, mais le module choisit l'offre par le forfait seulement (NativePurchasesPlugin.java l. 561-571) : **binaire neuf**.
- **Sans binaire, possible** : les « 7 jours de Cloud OFFERTS » (create-checkout-session `essai_offert`, décision 6 du 11/11 :
  serveur et mail de veille prêts, aucun écran) — ce n'est pas la même règle que le web : rien ne bascule seul à J+7 (la
  boutique ne peut pas être débitée par FillSell) ; la personne passe ensuite à la formule dans sa boutique (payée ce
  jour-là). Les écrans (bouton, fin des 7 jours, Réglages avec `cloud_canal = 'offert'`, arrêt) sont à construire : Q1.
- **En attendant (fait)** : le texte dit clairement « Pas d'essai : … prélevés aujourd'hui » (Apple : prix entier ; Google :
  prorata), avant la feuille.

## 4. (d) Essai Android en vrai

- **Sur ce PC** : Android SDK (platform-tools adb 37, build-tools 35-37, émulateur 36.6.11), accélération WHPX utilisable
  (Hyper-V actif). **Absents** : toute image système (il faut `system-images;android-35;google_apis_playstore;x86_64`), tout
  AVD, `cmdline-tools` (sdkmanager). Rien installé, rien téléchargé (≈ 1,5 Go ; à faire sur accord).
- **Sans Nico : impossible** — un achat de testeur exige un compte Google connecté au Play Store de l'appareil (je ne me
  connecte à aucun compte) et ce compte déclaré testeur de licence dans la Play Console.
- **Le minimum pour Nico** :
  1. Play Console › Paramètres › **Tests de licence** : ajouter un compte Gmail de test (le sien ou un dédié), réponse
     « RESPOND_NORMALLY » ;
  2. ce compte dans la piste **Tests internes** où se trouve la vc38 (2.9.176), lien d'acceptation ouvert une fois ;
  3. un appareil Android (son téléphone, fuseau Europe/Paris) — ou l'émulateur Google Play que je prépare sur feu vert —
     avec ce compte connecté au Play Store ; installer la vc38 depuis la piste interne ;
  4. se connecter dans l'app à un compte FillSell de test sans essai pris (ex. un compte neuf), formules Android ouvertes
     (`cloud_formules_google` = 1, déjà) ; « Avec Cloud » › Pro + Cloud › « Essayer 7 jours gratuits » ;
  5. la feuille Google doit dire « Essai gratuit de 7 jours » puis le prix. Moi ensuite (lecture seule) : journal
     `stores_notifications_journal` (google, `pro.cloud`, test), subscriptionsv2 lu par validate-google-purchase (phase
     gratuite `offerPhase.freeTrial`), `profiles.cloud_essai_*`, aucun mail client (achat de test : 4a), alerte « [TEST] ».
     Les testeurs ont des durées raccourcies (essai ≈ quelques minutes) : le 1er renouvellement arrive vite.
  Si la feuille montre le prix sans essai : R1 confirmé → patch natif `offerId` (vc39) et, d'ici là, ne plus annoncer
  l'essai sur Android (une ligne : `etatEssaiBoutique` Google 'inconnu').

## 5. (e) Le verrou

`npm run selftest:textes-paiement-verite` (`scripts/textes-paiement-verite-selftest.mjs`, inscrit dans package.json). L'oracle
(la règle de chaque canal) est ÉCRIT dans le test, jamais importé de l'app jugée : Stripe = `voieFormuleStripe` du serveur +
`always_invoice` relu dans create-checkout-session ; Apple = la règle documentée appliquée à des historiques
`Transaction.all` construits sur les cas réels ; Google = l'offre rendue. Il rend les VRAIES cartes (react-dom/server), les
notes, les questions posées avant la feuille (achats formule et Cloud seul exécutés avec des doubles), les mentions, les mails
(début d'essai, arrêt programmé, prorata, arrêt d'essai d'abonné, impayé), les réponses de cancel-subscription et de l'app.
- **ROUGE sur d73cd9d : 13 verts, 55 rouges** (`lot1311b\pay-verrou-rouge.txt`) — dont les deux cas (b), la montée sans date,
  « Garder le Cloud », « On te prévient la veille », « rien n'a été débité » après un achat rendu.
- **VERT après : 69 verts, 0 rouge** (`lot1311b\pay-verrou-vert.txt`).

**Selftests existants mis à jour (13/11, décision de Nico — commentés dans chaque fichier)** : `prix-boutique` (repli iPhone :
essai « inconnu » sans historique), `cloud-achat` (« 24,99 € prélevés aujourd'hui »), `formules-cloud-offres` (lignes
'aujourdhui', texte du prorata, carte Business), `formules-cloud-ferme` (note de montée retirée de l'empreinte, lien Google
normalisé : le reste à l'octet), `formules-cloud-contrat-app` (3 chemins `cloud_formule: null`), `formules-ouverture-partout`
(éligibilité posée ; « va t'afficher »), `paiements-non-regression` (lignes relues : `scripts/fixtures/paiements-lignes-audit-1311.json`).

**Zéro régression** : les 106 selftests qui citent les fichiers touchés (+ aucune-estimation, donnees-clients,
imports-jamais-masques, store-test-sans-mail, promesse-veille-app, formules-essai-changement, formules-canal-ferme,
cloud-mails-canaux, cloud-resiliation-mails…) : 1re passe 98/106 (les 8 ci-dessus, mis à jour) ; 2e passe **105/106**, le seul rouge = ce verrou (une assertion à suivre après le changement « bouton caché dès la lecture ») → relancé : **106/106** (`lot1311bpay-suite-apres.txt`, `pay-verrou-vert.txt`).
`npm run build:essai` : OK. `deno check` (erreurs avant → après) : cancel-subscription 37 → 41 (+2 « user possibly null »,
+2 propriétés de `stripe` importé en no-check : mêmes types que les 37, sur mes lignes neuves), stripe-webhook 57 → 57,
create-checkout-session 67 → 67, email-tunnel 2 → 2, apple-iap-webhook 0, google-play-webhook 0, validate-google-purchase 0.
Lint des fichiers touchés : seule l'erreur déjà sur main (ConversionModal `COIN_CONFIG_FALLBACK`).

---------------------------------------------------------------------------------------------------------------------
## 6. Ce qui doit être livré (sur feu vert de Nico)

1. **Fonctions** (depuis l'archive du commit ; versions et verify_jwt lus le 13/11, à relire avant / après) :
   `cancel-subscription` v62 (**true**) ; `stripe-webhook` v79, `apple-iap-webhook` v57, `google-play-webhook` v50
   (**false**, `--no-verify-jwt`) ; `create-checkout-session` v80 (**true** : son mail de début d'essai d'abonné). Elles
   importent `_shared/cloud-mails.js` (textes des mails de formule). email-tunnel / validate-google-purchase : comportement
   inchangé, pas de redéploiement nécessaire.
2. **Web + OTA** (app) : toutes les corrections d'écran (JS seul ; iPhone : la lecture de l'historique Apple marche sur le
   binaire 2.9.164 en vente). OTA comme les précédentes (module natif remis à l'état du canal pour l'envoi, puis restauré).
3. Rien en base, aucune migration, aucun script de données, rien dans `chrome-extension/`.

**Effet attendu** : iPhone — « 7 jours gratuits » seulement aux identifiants Apple qui l'auront vraiment ; les autres lisent
le prix et « prélevés aujourd'hui » avant la feuille ; les anciens abonnés App Store échus (sans offre utilisée) gardent la
semaine. Partout — chaque carte et chaque montée dit quand part le prélèvement. Web — un abonné App Store / Google Play ne
voit plus « Se désabonner » ; s'il l'avait encore (lecture en cours), il lit où arrêter et garde son accès.
**Risques** : la lecture `Transaction.all` (reçu joint à chaque transaction) peut être lente sur un historique très long (compte
Sandbox) → au pire « inconnu » (texte prudent) après 8 s ; textes NEUFS non validés par Nico (§ 7).

## 7. Questions pour Nico
1. (c) Brancher « 7 jours de Cloud OFFERTS » aux abonnés App Store / Google Play (serveur prêt, écrans à faire), ou attendre
   un binaire avec offres promotionnelles (Apple) / offre développeur (Google) pour la même règle que le web ?
2. (d) Les 5 gestes du § 4 (testeur de licence + piste interne + appareil) — et j'installe l'émulateur Google Play ici ?
3. R2 : bloquer côté app (iPhone) et serveur (web) la montée classique d'un abonné d'un autre canal (2e abonnement) ?
4. R3 : ordre de correction des écarts de droits serveur (remboursement Stripe, grâce Google, `validate-apple-receipt`) ?
5. Textes NEUFS à valider (tous marqués « ⚠ texte NEUF » dans le code) : lignes de prix (`textesFormules.js`), notes de montée
   (`utils/texteMontee.js`, `boutiqueMontee`), questions Cloud seul (`textesConnexion.js`), « payé par carte » (Réglages),
   message `rien_a_resilier`, achat non confirmé (`issueAchat.js`), verrou boutique. Et R4/R5 : conditions du Cloud (« rappel
   la veille »), `Legal.jsx` (suppression du compte), site vitrine, « Option FillSell Cloud, 24,99 €/mois ».

## 8. Fichiers modifiés et créés (`git -C scratchpad\wt-pay status --short`, tous en LF)
```
 M docs/regles/mails-paiements-comptabilite.md
 M package.json
 M scripts/cloud-achat-selftest.mjs
 M scripts/formules-cloud-contrat-app-selftest.mjs
 M scripts/formules-cloud-ferme-selftest.mjs
 M scripts/formules-cloud-offres-selftest.mjs
 M scripts/formules-ouverture-partout-selftest.mjs
 M scripts/paiements-non-regression-selftest.mjs
 M scripts/prix-boutique-selftest.mjs
 M src/App.jsx
 M src/cloud/BlocCloudReglages.jsx
 M src/cloud/BlocFormulesReglages.jsx
 M src/cloud/OffresAvecCloud.jsx
 M src/cloud/achatCloud.js
 M src/cloud/achatFormuleCloud.js
 M src/cloud/formulesCloud.js
 M src/cloud/textesConnexion.js
 M src/cloud/textesFormules.js
 M src/components/ConversionModal.jsx
 M src/components/MentionsAbonnement.jsx
 M src/entree/EtapeCloud.jsx
 M src/entree/EtapesFormules.jsx
 M src/entree/textes.js
 M src/lib/chargerPrixBoutique.js
 M src/lib/issueAchat.js
 M src/lib/offreMail.js
 M src/lib/prixBoutique.js
 M src/reglages/SousPageAbonnement.jsx
 M src/reglages/textes.js
 M src/utils/mentionsAbonnement.js
 M supabase/functions/_shared/cloud-mails.js
 M supabase/functions/cancel-subscription/index.ts
?? scripts/fixtures/paiements-lignes-audit-1311.json
?? scripts/textes-paiement-verite-selftest.mjs
?? src/lib/eligibiliteApple.js
?? src/utils/texteMontee.js
```
Aucun fichier de `chrome-extension/`, aucune migration, aucun script de données. Zones des autres agents non touchées.
