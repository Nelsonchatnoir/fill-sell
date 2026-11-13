# PAY2 — 3e réponse de Nico du 13/11 : un seul abonnement, remboursement Stripe, grâce Google, impayé, textes, essai des abonnés boutique

Copie : `scratchpad\wt-pay2` (base ae70c45, LF). **Rien en prod** : aucune écriture en base, aucun déploiement, rien écrit
chez Stripe (lectures GET seulement : abonnements, factures, remboursements, point de terminaison, portail), rien sur App
Store Connect / Play Console, aucune annulation, aucun remboursement, aucun mail. Base lue en `--read-only` (requêtes filtrées,
id8). Heures de Paris.

---------------------------------------------------------------------------------------------------------------------
## 0. (a) LES COMPTES QUI ONT AUJOURD'HUI DEUX ABONNEMENTS ACTIFS (lu le 13/11 vers 13:00)

Sources : Stripe (45 abonnements non résiliés : 42 active, 3 trialing — aucun client Stripe n'en a deux), profils (92 comptes
avec un marqueur payant), `stores_notifications_journal` (Apple / Google, fin de période à venir), remboursements Stripe (4).

| id8 | Abonnement 1 | Abonnement 2 | Double prélèvement ? |
|---|---|---|---|
| **785352fe** | **App Store Premium** (`app.fillsell.premium.standard`), renouvelé le 30/10 09:35, période jusqu'au **30/11 18:32**, renouvellement auto **ACTIF** (dernier changement : AUTO_RENEW_ENABLED le 15/10 22:32) | **Stripe Pro 29,99 €/mois** (`sub_1UaISD…`), pris le **10/11 à 18:03** depuis Réglages › Abonnement sur le web (`checkout_open` 18:01:47, facture F4HSPMF0-0117 payée 18:03:45), prochaine échéance 10/12 | **OUI** : Premium Apple (12,99 €, 30/10) + Pro Stripe (29,99 €, 10/11). Un remboursement **partiel de 8,66 €** a déjà été fait sur la facture Stripe le 10/11 à 18:43 (motif « Chevauchement Premium Apple 10/11-30/11 après passage Pro Stripe ») : le chevauchement jusqu'au 30/11 est compensé. ⚠ **Le 30/11 à 18:32, Apple reprélèvera le Premium** si la personne ne l'arrête pas chez Apple → nouveau double prélèvement. Cause : create-checkout-session « montée web … laissée passer » (R2). |
| **c7c382b7** | **Stripe Pro 29,99 €/mois** (`sub_1UWfw4…`, depuis le 31/10 18:19, échéance 30/11) | **App Store FillSell Cloud seul** (`app.fillsell.cloud.sub`), pris sur iPhone le 12/11 18:18, semaine gratuite jusqu'au **19/11 18:18**, renouvellement auto actif → 24,99 € chez Apple | Pas encore (essai). **Le 19/11 à 18:18** : 24,99 € chez Apple en plus du Pro Stripe. Cause : aucune garde côté iPhone. |
| **f0acd3af** | **App Store Pro** (`app.fillsell.pro2.sub`, montée du 24/10, période jusqu'au 24/11 16:50) | **App Store FillSell Cloud seul**, pris le 09/11 19:27, semaine gratuite jusqu'au **16/11 19:27**, renouvellement auto actif | Pas encore. **Le 16/11 à 19:27** : 24,99 € (groupe « FillSell Cloud ») en plus du Pro (groupe « FillSell Plan ») : deux abonnements Apple. |
| 5322fa18 | App Store Pro (Sandbox) | Cloud seul (Sandbox) | Non : compte de test, bac à sable (aucun argent réel). |

Vérifiés et écartés : f44b5917 (Cloud **offert** + is_comped : rien de payé) ; 3f91c02e (Google révoqué et remboursé le 29/10,
Stripe Premium seul aujourd'hui) ; b695d990, d0ac0538, d607ba20 (essai Cloud seul Stripe, rien d'autre) ; 3 Premium Google
(82e64f14, a922068b, dc8fc12a) et 13 abonnés App Store : un seul abonnement chacun. **Rien n'a été annulé ni remboursé.**
Gestes possibles (à ta décision) : 785352fe — lui dire d'arrêter le Premium dans ses abonnements Apple avant le 30/11 (ou le
rembourser) ; c7c382b7 — arrêter le Cloud seul Apple avant le 19/11 et prendre Pro + Cloud sur le web ; f0acd3af — arrêter le
Cloud seul Apple avant le 16/11 et prendre Pro + Cloud dans l'app iPhone (même abonnement Apple).

---------------------------------------------------------------------------------------------------------------------
## 1. (a) La règle partout : un seul abonnement actif par compte, tous canaux

- **Règle pure, une source** : `supabase/functions/_shared/un-seul-abonnement.js` (serveur + app). Vivant = Stripe active |
  trialing | past_due ; boutique dont la période court (Google relu chez Google quand c'est possible) ; Cloud seul de boutique
  vivant ; jamais l'offert ni is_comped. `decisionAchat({ canal, achat: palier | formule | cloud_seul, vivants })` :
  autre canal → refus **« où faire le changement »** ; même canal : palier ↔ formule passe (même abonnement) ; Cloud seul à
  côté d'une formule → « prends sa version avec Cloud » ; forfait à côté d'un Cloud seul ou d'un impayé Stripe → refus ;
  déjà deux → support. Phrases FR / EN, jamais « ordinateur » ni « Chrome ».
- **Web** — `create-checkout-session` : forfait classique refusé au-dessus de TOUT abonnement de boutique (785352fe) ou à côté
  d'un Cloud seul (boutique ou Stripe) ou d'un impayé ; Cloud seul refusé à côté d'une formule (Stripe ou boutique) ; 409
  `un_seul_abonnement` + `message_fr` / `message_en` (l'app les affiche déjà). Formules avec Cloud : `voieFormuleStripe`
  refusait déjà (inchangé).
- **iPhone / Android** — nouvelle fonction **`garde-abonnement`** (lecture seule : profil, Stripe GET, Google relu ;
  verify_jwt true) appelée AVANT la feuille de la boutique, pour un forfait (`App.jsx handleIAPPurchase`), le Cloud seul
  (`cloud/achatCloud.js`) et une formule avec Cloud (`cloud/achatFormuleCloud.js`). Serveur muet → preuve locale
  (`src/lib/gardeAchat.js` : boutique du profil, client Stripe avec palier payé) ; rien de lisible → l'achat passe (le filet veille).
- **Filet** (webhooks + validate-google-purchase, quand un abonnement S'OUVRE) : `_shared/deux-abonnements.ts` → si deux
  abonnements vivants, alerte **« ⚠️ Deux abonnements »** à support@ (email-tunnel `deux_abonnements`, type
  `ops_deux_abonnements`). ⛔ Lire et prévenir seulement : aucune annulation, aucun remboursement, aucun mail client.
- Exemples de phrases : « Ton abonnement FillSell passe par l'App Store : pour changer de formule ou ajouter le Cloud, ouvre
  l'app FillSell sur ton iPhone, Réglages › Abonnement. Un achat ici serait un second abonnement. Rien n'a été débité. » ·
  « Ton abonnement FillSell est payé par carte, sur le web : pour changer de formule ou ajouter le Cloud, va sur fillsell.app,
  Réglages › Abonnement. … » · « Tu as déjà une formule FillSell : pour ajouter le Cloud, choisis sa version avec Cloud dans
  Réglages › Abonnement (ton abonnement change, sans second abonnement). Rien n'a été débité. » (⚠ textes NEUFS, à valider)
- **Verrou** `selftest:un-seul-abonnement` — ROUGE sur ae70c45 : **0 vert, 21 rouges** (`pay2-a-rouge.txt`) ; VERT : **50/0**
  (`pay2-a-vert.txt`). Les 3 cas réels rejoués à l'instant d'avant leur second achat, + 12 cas de non-régression (même canal).

## 2. (b) Remboursement Stripe = comme chez Apple
- `stripe-webhook` traite **`charge.refunded`** (`_shared/remboursement-stripe.js`, pur) : remboursement **TOTAL** de la facture
  EN COURS d'un abonnement vivant → palier et Cloud de cet abonnement coupés (les autres canaux restent), **durablement** : chaque
  recalcul relit la dernière facture avec sa charge (`annoterRemboursements`, `litAbonnementStripe` : `fillsell_periode_remboursee`
  → rien de payé). Partiel (785352fe 8,66 €, 447d920c 19,80 € le 18/10), période passée, pack → droits gardés. Toujours :
  « ↩️ Remboursement » à support@ (canal stripe, compte, droit, ce qu'il reste à faire) ; aucun mail client ; rien écrit chez
  Stripe — l'alerte dit que l'abonnement reste ACTIF chez Stripe et qu'il faut l'annuler si c'est voulu.
- Apple : le **Cloud SEUL** remboursé (REFUND / REVOKE) alerte maintenant aussi (R3).
- ⚠ **Geste de Nico** : cocher `charge.refunded` sur le point de terminaison Stripe (relu le 13/11 : seuls checkout.session.completed,
  customer.subscription.deleted / updated, invoice.paid / payment_failed / payment_action_required sont cochés). Sans lui, le code ne reçoit rien.
- **Verrou** `selftest:remboursement-stripe` — ROUGE : **1 vert, 10 rouges** ; VERT : **24/0**.

## 3. (c) Grâce Google
- `validate-google-purchase` (achat ET « Restaurer mes achats ») comptait `IN_GRACE_PERIOD` comme actif et ROUVRAIT palier et
  Cloud que google-play-webhook coupe (6 = grâce, 5 = suspension, règle de Nico du 29/10). Désormais `actif =
  abonnementGoogleActif(purchase)` (ACTIVE, ou CANCELED payé jusqu'à une fin à venir) : une seule règle, jeton gardé (la reprise
  RECOVERED arrive dessus).
- La vraie règle de Google (relue le 13/11) : « During a grace period, the user should still have access to their subscription
  entitlement » ; à la suspension (account hold) « they lose entitlement ». **Google recommande donc de garder l'accès pendant la
  grâce** ; FillSell le coupe par ta décision du 29/10 (impayé = gratuit, tous canaux) — question 3.
- **Verrou** `selftest:grace-google-jamais-rouverte` — ROUGE : **11 verts, 2 rouges** ; VERT : **13/0**.

## 4. (d) Mail d'impayé
- Stripe (`paiement-echoue.js`, via stripe-webhook → email-tunnel → emails-fillsell, le nom de la formule passe désormais) :
  AVANT : « Ton abonnement n'a pas pu être renouvelé. » + la facture, rien sur la pause. APRÈS (renouvellement ou fin d'essai,
  abonnement non actif) : « En attendant, ta formule Pro est en pause : ton compte fonctionne comme un compte gratuit. Dès que
  le paiement passe, elle repart toute seule. » ; formule avec Cloud : « En attendant, Pro + Cloud est en pause : FillSell Cloud
  et les avantages de ta formule. Dès que le paiement passe, tout repart tout seul. » ; + « Pour payer avec une autre carte, ou
  changer celle des prochains mois : sur fillsell.app, Réglages › Abonnement › Mes factures. » (portail Stripe :
  `payment_method_update` activé, relu le 13/11). Cloud seul : inchangé (« FillSell Cloud est en pause … repart tout seul »).
- Apple / Google (formule avec Cloud) : AVANT « Pour le relancer, mets à jour ton moyen de paiement chez Apple (…). Dès que le
  paiement passe, FillSell Cloud repart tout seul. » APRÈS « Pour reprendre, mets à jour ton moyen de paiement chez Apple (sur
  l'iPhone : Réglages → ton nom → Paiement et livraison) : Apple retente le prélèvement, et Pro + Cloud repart dès qu'il passe. »
- **Verrou** `selftest:impaye-formule-en-pause` — ROUGE : **31 verts, 42 rouges** ; VERT : **73/0**.

## 5. (e) Textes alignés sur la règle de chaque canal — AVANT → APRÈS (⚠ à valider)
**Conditions du Cloud** (`src/cloud/conditionsCloud.js`, version **2026-11-13** — reformulation, minimales INCHANGÉES : Cloud seul
2026-11-04, formules 2026-11-12 ; ⚠ date à recaler sur le jour réel du push web, `_shared/cloud-conditions.js` REFORMULATION_1311) :
- Art. 6 (Cloud seul) « C'est un abonnement distinct des forfaits : il se prend seul, avec le forfait gratuit, ou en plus d'un
  forfait payant ; résilier un forfait n'arrête pas le Cloud. » → « Il se prend seul, avec le forfait gratuit. Un compte n'a qu'un
  seul abonnement FillSell à la fois, tous canaux confondus : un abonné à un forfait payant ajoute le Cloud en passant à la
  formule avec Cloud de son forfait, sur le canal où il paie, et non par un second abonnement. Pour un Cloud pris à part avant
  les formules avec Cloud, résilier le forfait n'arrête pas le Cloud. »
- Art. 6 « La date de fin de l'essai et le montant prélevé ensuite sont affichés avant l'enregistrement du moyen de paiement. …
  Au plus tard la veille de la fin de l'essai, un rappel vous est envoyé dans l'app et par e-mail. » → « La page de paiement
  (Stripe, App Store ou Google Play) affiche, avant que vous validiez, la date de fin de l'essai et le montant prélevé ensuite. »
  (**rappel supprimé**) ; « Dans l'App Store et Google Play, l'essai est proposé par la boutique, aux conditions qu'elle affiche. »
  → « … selon ses propres règles (chez Apple, une seule semaine gratuite par identifiant Apple pour ce groupe d'abonnements) ; la
  page de paiement de la boutique dit, avant que vous validiez, s'il y a un essai et ce qui est prélevé. »
- Art. 7 « Un abonnement pris dans l'App Store ou Google Play se résilie dans les réglages d'abonnement de la boutique. » → « … :
  arrêté avant la fin de l'essai (chez Apple, au moins 24 heures avant), rien n'est prélevé ; après, il court jusqu'à la fin de
  la période payée. … ; pour un achat dans l'App Store ou Google Play, le remboursement se demande à la boutique. »
- Art. 6 (formules) : rappel de la veille supprimé ; + la page de paiement du canal ; « Un abonné à une formule sans Cloud peut
  passer à sa version avec Cloud ; la différence est facturée au prorata. » → « Un compte n'a qu'un seul abonnement FillSell à la
  fois … : un changement de formule se fait sur le canal où vous payez, sur le même abonnement. … sur le web et dans Google Play,
  la différence au prorata jusqu'à la prochaine échéance, prélevée tout de suite (sur le web, un abonné Premium ou Pro qui n'a
  jamais eu d'essai du Cloud l'essaie d'abord 7 jours …) ; dans l'App Store, le nouveau prix, tout de suite, Apple remboursant
  au prorata la part non utilisée de l'ancienne formule. » (EN traduit à l'identique.)
**CGV art. 7** (`src/cloud/textesLegaux.js`) : « … ou en plus d'un forfait payant » → un seul abonnement (même phrase) ; « La date
de fin … indiquée avant l'enregistrement du moyen de paiement » → « La page de paiement (Stripe, App Store ou Google Play) indique,
avant validation, … (24,99 € par mois) » ; « Au plus tard la veille … un rappel est adressé … » → **supprimé** ; « s'arrête en un
geste (Réglages › Abonnement) » → « s'arrête depuis Réglages › Abonnement » ; boutique : + « arrêtée avant la fin de l'essai (chez
Apple, au moins 24 heures avant), rien n'est prélevé ».
**Legal.jsx** : 4.6 « L'annulation automatique de votre abonnement Premium en cours (Stripe ou Apple/Google selon votre méthode de
paiement) » (faux : delete-account n'annule que Stripe) → « L'arrêt immédiat de votre abonnement payé par carte (Stripe). La
suppression du compte n'arrête pas un abonnement pris dans l'App Store ou Google Play : arrêtez-le d'abord dans les réglages
d'abonnement de la boutique, sinon la boutique continue de le prélever » ; 3.4 + « Un seul abonnement par compte : … » ; 3.5
« … depuis son espace client » → « un abonnement payé par carte sur le web depuis son espace client (Réglages › Abonnement), un
abonnement pris dans l'App Store ou Google Play dans les réglages d'abonnement de la boutique » ; date 6 → **13 novembre 2026**.
**Site** (`npm run site:dater` fait : /, /faq, /tarifs, /en, /en/pricing datés 2026-11-13) : « Disponible en France, sur Android et
sur le web. » → « … sur iPhone, sur Android et sur le web. » (accueil fr/en, tarifs fr/en, faq) ; « (carte demandée, une fois par
personne) ; tu arrêtes le Cloud en un geste. » → « (moyen de paiement demandé, une fois par personne) ; avant que tu valides, la page
de paiement te dit s'il y a un essai, quand il finit et ce qui est prélevé ensuite. Tu l'arrêtes là où tu paies : sur le web, dans
Réglages › Abonnement (pendant l'essai, rien n'est prélevé) ; sur iPhone ou Android, dans les abonnements de ta boutique. » ; + « Sur
iPhone, l'App Store offre la semaine gratuite une fois par identifiant Apple : si la tienne a déjà servi, ou si tu es déjà abonné(e) à
FillSell sur l'App Store, la formule est payée dès la souscription. » ; « se prend avec Premium, Pro ou Business » + « en un seul abonnement ».
- **Verrou** : `selftest:textes-paiement-verite` étendu (§ I conditions / CGV / Legal / site, § J phrases neuves) — ROUGE sur
  ae70c45 : **73 verts, 48 rouges** (les 48 = § I-J) ; VERT : **121/0**.

## 6. (f) Essai des abonnés App Store / Google Play — PRÊT, INACTIF, rien de soumis
- Serveur : `_shared/offre-essai-abonne.js` (signature des **offres promotionnelles Apple** : ECDSA P-256 / SHA-256 sur
  `bundle␣clé␣produit␣offre␣appAccountToken␣nonce␣horodatage` (U+2063), DER base64, avec la clé d'achats intégrés déjà en place
  APPLE_API_PRIVATE_KEY / APPLE_API_KEY_ID ; éligibilité = règle du web : même palier, Premium + Cloud / Pro + Cloud, un seul
  abonnement sur CE canal, essai jamais pris) ; fonction **`signer-offre-boutique`** (verify_jwt true, **fermée** : 409 tant que le
  secret ESSAI_ABONNES_BOUTIQUE ≠ 1, avant toute lecture ; rien n'est écrit). **Non déployée.**
- App : `src/lib/essaiAbonneBoutique.js` (`ESSAI_ABONNE_BINAIRE_MIN` = null iOS et Android → aucun appel) ; `achatFormuleCloud`
  ne la demande que pour un abonné de la boutique ; `iap.js` ne transmet `promotionalOffer` (iOS) / `offerIdentifier` (Android)
  que si une offre existe (jamais aujourd'hui).
- Ce qu'il faudrait (sans le faire) : **ASC** › Abonnements › FillSell Plan › `app.fillsell.premium.cloud` et `app.fillsell.pro.cloud`
  › Offres promotionnelles : une offre `essai-abonne-7j` (1 semaine, type à choisir : gratuite, ou « paiement au fur et à mesure »
  au prix de la formule sans Cloud pour reproduire le web) ; **Play Console** › forfait de base de premium/pro + Cloud › Offres : une
  offre `essai-abonne-7j`, éligibilité « Déterminée par le développeur », phase d'essai 7 jours ; **binaire** : module natif étendu
  (iOS : `Product.PurchaseOption.promotionalOffer(offerID:keyID:nonce:signature:timestamp:)` depuis `promotionalOffer` ; Android :
  `setOfferToken` de l'offre `offerIdentifier` au lieu de la 1re), puis sa version dans ESSAI_ABONNE_BINAIRE_MIN, puis le secret.
- **Verrou** `selftest:essai-abonne-boutique` — ROUGE : **0 vert, 9 rouges** ; VERT : **20/0** (signature vérifiée par une clé jetable).

---------------------------------------------------------------------------------------------------------------------
## 7. Zéro régression
- Selftests relancés : les **128** qui citent un fichier touché (+ aucune-estimation, donnees-clients, imports-jamais-masques,
  store-test-sans-mail, promesse-veille-app, formules-*, cloud-*). 1re passe : 119/128 — les 9 rouges figeaient l'ANCIEN comportement
  changé par ta décision, **mis à jour avec un commentaire « (13/11/2026, décision de Nico — … ) »** : cloud-executant (version
  2026-11-13, ligne de version), cloud-textes-legaux et promesse-veille-app (rappel plus promis), formules-cloud-contrat-app (tête
  de l'historique), plus-de-plafond-par-jour (date de Legal), paiement-echoue (nom de la formule transmis), paiements-non-regression
  (lignes relues : `scripts/fixtures/paiements-lignes-pay2-1311.json`) ; cloud-ecrans (règle « colonnes Cloud lues par useCloudProfil
  seul ») → j'ai retiré le Cloud du repli local de gardeAchat (le serveur le voit) ; cloud-prix-nom → j'ai remis « (24,99 € par mois) »
  dans la CGV. 2e passe : **128/128 verts** (`pay2-suite-2.txt`, sorties `pay2-sortie2-<nom>.txt`).
- `npm run build:essai` : **OK** (`pay2-build.txt`). Lint des fichiers touchés : **0 erreur sur les lignes du lot** (les erreurs restantes de
  App.jsx sont celles de main).
- `deno check` (erreurs base → après) : apple-iap-webhook 0 → 0, google-play-webhook 0 → 0, validate-google-purchase 0 → 0,
  email-tunnel 2 → 2, create-checkout-session 67 → 70, stripe-webhook 57 → 62 (les +3 / +5 = mêmes classes que les existantes :
  SDK Stripe importé en no-check — « Property 'subscriptions'/'invoices'/'charges' does not exist on type 'o' », « Cannot find
  namespace 'Stripe' » — sur mes lignes neuves) ; garde-abonnement 0 ; signer-offre-boutique 2 (les 2 d'`_shared/apple-jwt.ts`, déjà là).

## 8. Ce qui doit être livré (sur ton feu vert)
1. **Fonctions** (prod relue le 13/11 ~13:00, à relire avant / après) : `create-checkout-session` v81 (**true**) ; `stripe-webhook` v80,
   `apple-iap-webhook` v58, `google-play-webhook` v51, `email-tunnel` v94 (**false**, `--no-verify-jwt`) ; `validate-google-purchase`
   v30 (**true**) ; **nouvelle** `garde-abonnement` (**true**, déclarée dans config.toml). Ordre : email-tunnel d'abord (l'alerte
   `deux_abonnements` doit exister avant que les webhooks l'appellent), puis les autres, puis garde-abonnement **avant** l'OTA.
   `signer-offre-boutique` : **ne pas déployer** (inactive, prochain binaire).
2. **Stripe (toi)** : cocher `charge.refunded` sur le point de terminaison `we_1TNHq1…`.
3. **Web + OTA** : App.jsx, achatCloud, achatFormuleCloud, gardeAchat, iap.js, conditions (version 2026-11-13 : la recaler au jour
   réel du push), textesLegaux, Legal, site (dates.lock.json fait).
4. Rien en base, aucune migration, aucun script de données, rien dans `chrome-extension/`.
**Effet attendu** : plus aucun second abonnement par l'app ou le web ; un second abonnement qui passerait quand même → alerte à
support@ ; un remboursement Stripe total coupe les droits (une fois l'événement coché) ; un impayé Google en grâce ne retrouve plus
son palier en ouvrant l'app ; le mail d'impayé dit ce qui est en pause. **Aujourd'hui (§ 0) : 3 comptes à régler à la main.**
**Risques** : garde-abonnement = +1 appel (≤ 8 s) avant la feuille de la boutique (repli local ensuite) ; chaque recalcul Stripe
relit la dernière facture des abonnements actifs (+1 GET par abonnement actif et par événement) ; textes NEUFS non validés.

## 9. Questions pour toi
1. § 0 : que fait-on pour 785352fe (Apple reprélève le 30/11), c7c382b7 (19/11), f0acd3af (16/11) ? Je n'ai rien fait.
2. Un Cloud seul pris AVANT les formules à côté d'une formule (c7c382b7, f0acd3af) : on le laisse vivre (« un abonnement pris à part
   avant les formules ») ou on organise le passage ? Le code refuse désormais d'en créer un nouveau.
3. Grâce Google : on garde ta règle du 29/10 (coupé, comme Stripe et Apple) ou on suit la recommandation de Google (accès gardé pendant
   la grâce, coupé à la suspension) ? Une ligne à changer (`abonnementGoogleActif`).
4. Remboursement PARTIEL Stripe : droits gardés (geste commercial) — d'accord ? Et un litige (`charge.dispute.created`) : alerte seule ?
5. Conditions : je l'ai traité en REFORMULATION (acceptations gardées). Si tu juges que « plus de Cloud seul en plus d'un forfait » ou
   « plus de rappel promis » est un changement de FOND, on relève la minimale en deux temps.
6. ~~« ordinateur » dans le mail du Cloud seul~~ — RÉGLÉ (consigne du coordinateur : règle permanente) : impayé, arrêts, début d'essai et
   ligne des cartes disent la phrase vraie du Cloud ; verrou impaye-formule-en-pause § D (1 202 textes rendus, rouge avant : 2, vert : 76/0).
7. (f) Type d'offre Apple pour l'essai d'abonné : gratuite 1 semaine (Apple rembourse aussi le prorata de l'ancienne formule) ou au
   prix de la formule sans Cloud (comme le web) ?
8. Textes NEUFS à valider : phrases de refus (`un-seul-abonnement.js`), mail d'impayé, conditions / CGV / Legal / site ci-dessus.

## 10. Fichiers modifiés et créés (`git -C scratchpad\wt-pay2 status --short`, tous en LF)
```
 M docs/regles/mails-paiements-comptabilite.md
 M package.json
 M scripts/cloud-executant-selftest.mjs
 M scripts/cloud-textes-legaux-selftest.mjs
 M scripts/formules-cloud-contrat-app-selftest.mjs
 M scripts/paiement-echoue-selftest.mjs
 M scripts/paiements-non-regression-selftest.mjs
 M scripts/plus-de-plafond-par-jour-selftest.mjs
 M scripts/promesse-veille-app-selftest.mjs
 M scripts/textes-paiement-verite-selftest.mjs
 M site/contenu/en/accueil.md
 M site/contenu/en/pricing.md
 M site/contenu/fr/accueil.md
 M site/contenu/fr/faq.md
 M site/contenu/fr/tarifs.md
 M site/dates.lock.json
 M src/App.jsx
 M src/cloud/achatCloud.js
 M src/cloud/achatFormuleCloud.js
 M src/cloud/conditionsCloud.js
 M src/cloud/textesLegaux.js
 M src/lib/iap.js
 M src/pages/Legal.jsx
 M supabase/config.toml
 M supabase/functions/_shared/cloud-conditions.js
 M supabase/functions/_shared/cloud-mails.js
 M supabase/functions/_shared/cloud-option.js
 M supabase/functions/_shared/emails-fillsell.ts
 M supabase/functions/_shared/paiement-echoue.js
 M supabase/functions/_shared/payment-notify.ts
 M supabase/functions/apple-iap-webhook/index.ts
 M supabase/functions/create-checkout-session/index.ts
 M supabase/functions/email-tunnel/index.ts
 M supabase/functions/google-play-webhook/index.ts
 M supabase/functions/stripe-webhook/index.ts
 M supabase/functions/validate-google-purchase/index.ts
?? scripts/essai-abonne-boutique-selftest.mjs
?? scripts/fixtures/paiements-lignes-pay2-1311.json
?? scripts/grace-google-jamais-rouverte-selftest.mjs
?? scripts/impaye-formule-en-pause-selftest.mjs
?? scripts/remboursement-stripe-selftest.mjs
?? scripts/un-seul-abonnement-selftest.mjs
?? src/lib/essaiAbonneBoutique.js
?? src/lib/gardeAchat.js
?? supabase/functions/_shared/deux-abonnements.ts
?? supabase/functions/_shared/offre-essai-abonne.js
?? supabase/functions/_shared/remboursement-stripe.js
?? supabase/functions/_shared/un-seul-abonnement.js
?? supabase/functions/garde-abonnement/
?? supabase/functions/signer-offre-boutique/
```
Aucun fichier de `chrome-extension/`, aucune migration, aucun script de données. Zone Leboncoin (LBC2) non touchée.
