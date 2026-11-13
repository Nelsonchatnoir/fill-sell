# Mails, abonnements (palier, Apple), prix d'achat

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- ⛔ Envoyer un mail — une seule ligne, jamais une fonction (ex-L801-884)
- Premium detection (palier unique) (ex-L942-949)
- apple-iap-webhook (ex-L950-953)
- email_logs — type one-shot dans l'index (ex-L961-986)
- Prix d'achat : vide ≠ zéro (ex-L987-1008)

<!-- ex-CLAUDE.md L801-884 : ⛔ Envoyer un mail — une seule ligne, jamais une fonction -->
## ⛔ ENVOYER UN MAIL — UNE SEULE LIGNE, JAMAIS UNE FONCTION

**Claude ne déploie plus JAMAIS de fonction edge pour envoyer un mail.**
Le 23/09, les portes d'envoi étaient passées de 19 à **35** en trois jours :
une fonction `send-<prénom>-<date>` par mail, destinataire en dur,
`verify_jwt = false`, jeton maison (`fs2026batch`), jamais commitée, jamais
supprimée. **Trente et une ont été supprimées ce jour-là** après vérification
(0 cron, 0 fonction SQL, 0 trigger, 0 ligne de code ne les nommait).

LA LIGNE, à exécuter en SQL — c'est tout :

```sql
select public.envoyer_mail_ponctuel(
  p_destinataires := '[{"email":"qui@exemple.fr","user_id":"<uuid ou null>","variables":{"prenom":"Marie"}}]'::jsonb,
  p_sujet         := 'Bonjour {{prenom}}',
  p_html          := '<p>Le texte, en HTML.</p>',
  p_type          := 'un_type_parlant',     -- obligatoire, il atterrit dans email_logs
  p_categorie     := 'support',             -- 'support' (réponse à quelqu'un) | 'marketing' (campagne)
  p_simulation    := true                   -- true = rien ne part, on lit le verdict
);
-- puis, TOUT DE SUITE (net._http_response se purge) :
select status_code, content from net._http_response where id = <l'id rendu ci-dessus>;
```

`p_destinataires` accepte une liste : un envoi ou mille, même chemin, même
journal. `{{cle}}` est remplacé par `variables` **par personne**.

**Toujours lancer en `p_simulation := true` d'abord**, lire le verdict, puis
relancer à `false`. Et commencer par SON adresse.

**Pièce jointe** (26/09, envoi-ponctuel v3) : clé optionnelle DANS le
destinataire, jamais au niveau de l'appel —
`{"email":"…","pieces_jointes":[{"nom":"ventes.pdf","base64":"…"}]}`.
`support` seulement ; pdf, csv, png, jpg ; 3 pièces et 5 Mo au plus par
personne. Une pièce illisible REFUSE le mail (jamais un mail parti sans sa
pièce) ; la simulation rend le nom et le poids. Un gros base64 se met dans un
fichier `.sql` lancé par `npx supabase db query --linked -f`, jamais collé à la
main. Un export porte des données personnelles : `build/exports/` (ignoré par
git), JAMAIS un bucket Storage (les deux existants sont PUBLICS). PDF des
ventes d'un compte : `node scripts/emails/export-ventes-pdf.mjs --user <uuid>`.

CE QUE LA PORTE GARANTIT, et qu'aucune des 31 ne garantissait :
- clé de service exigée (lue dans le **vault**, secret `service_role_key`,
  jamais écrite en clair) — **aucun jeton en dur nulle part** ;
- `verify_jwt = true` ET garde maison : un JWT d'utilisateur ordinaire est
  signé par le projet, il ne suffit donc pas — seule la clé de service passe ;
- passage obligé par `envoyerEmail()` (`_shared/desinscription.ts`) :
  désinscription respectée, ligne `email_logs`, échecs dans
  `email_log_echecs`, en-tête List-Unsubscribe One-Click sur tout marketing ;
- `type` et `categorie` **obligatoires, sans défaut** ;
- **plafond de 2 mails par personne et par 24 h** sur le `marketing`. Il compte
  toutes les lignes `email_logs` de la personne sur 24 h glissantes, quel que
  soit le type : « deux mails par jour » se juge depuis SA boîte de réception,
  pas depuis nos catégories. Un `support` n'est **jamais** plafonné.
  ⛔ **(29/10, thecloset72000) SAUF les mails déclenchés par une vente** (`vente:<id>`, `ventes_du_jour` —
  liste FERMÉE, `_shared/plafond-mails.js`, `npm run selftest:plafond-mails`) : 4 mails de vente + 1 campagne
  faisaient « deja: 5 » et retenaient tout mail de notre initiative chez nos meilleurs vendeurs.

⛔ **UN TYPE ONE-SHOT ENTRE DANS L'INDEX, LE JOUR MÊME.** Un type envoyé une
fois par personne et absent de `email_logs_one_shot_unique` repartira en
doublon sans que rien ne le signale (bug du welcome, 03/08). Cf. la section
`email_logs` plus bas.

Les fonctions `send-*` qui RESTENT, et pourquoi : `send-extension-link`
(appelée par l'app, `verify_jwt` true), `send-bug-report` (idem). Plus rien
d'autre au 01/10 (`send-batch-notifications` n'existe plus en prod). Le
compte vivant se lit par le geste, jamais ici :
`npx supabase functions list | grep -o '"slug":"send-[^"]*"' | wc -l`.

⚠️ **DEUX ÉCARTS CONNUS, NON CORRIGÉS — à trancher, pas à patcher en passant :**
- `update-job-status` et `check-listing-status` portent dans leur propre
  en-tête « verify_jwt reste à true / peut rester au défaut : l'appel porte
  toujours un JWT user » — et tournent pourtant en **false**. Le code et la
  prod ne disent pas la même chose. Les deux font leur garde maison, donc rien
  n'est ouvert ; mais l'un des deux textes est faux.
- `tiktok-event` était listé ici et **n'existe plus** parmi les 57 fonctions
  actives. Retiré de la liste le 18/09.

(`send-merine-reply` a été supprimée en prod le 28/07/2026 — un one-shot en
`verify_jwt = false` que plus rien n'appelait.)

**Numéros de version** : ne JAMAIS écrire un numéro de version de fonction
(rapport, STATUS.md, commentaire, commit) sans l'avoir lu dans
`npx supabase functions list`. Les compteurs ne se suivent pas d'une fonction
à l'autre (voice-transcribe v36 quand voice-intent est v148) — un numéro
« déduit » est faux.


<!-- ex-CLAUDE.md L942-949 : Premium detection (palier unique) -->
## Premium detection

Règle métier (2026-07-25) : **résilié/expiré = plus premium, partout**. Depuis le 05/10, UN SEUL calcul du palier : `supabase/functions/_shared/palier.js` (l'app : `src/utils/palier.js` le ré-exporte ; les fonctions edge l'importent) et, en SQL, `palier_de(uuid)` / `palier_au_moins(uuid, text)`. Ordre : business, puis pro, puis premium (`is_premium OR is_comped`), sinon free ; les paliers s'emboîtent (business ⇒ pro ⇒ premium). ⛔ Jamais un drapeau seul (`is_pro !== true`) : un Business offert sans is_pro (ornellaracano) se voyait refuser la republication auto.
- ⛔ **(29/10, Romain Colson) Impayé = gratuit, sur tous les canaux.** Le palier ne tient que sur une période PAYÉE
  (ou un essai) ; il revient tout seul au paiement. Stripe : seul `active | trialing` porte un palier
  (`litAbonnementStripe.paye`, `_shared/cloud-option.js`) — `past_due` n'en porte plus (remplace la règle du 25/07,
  cas Mériné : la relance Stripe durait 13-14 j puis supprimait l'abonnement, palier gardé tout du long) ; le
  recalcul suit CHAQUE changement de statut (`customer.subscription.updated`). Apple : `DID_FAIL_TO_RENEW` → off,
  `DID_RENEW / BILLING_RECOVERY` → on (inchangé). Google : `ON_HOLD`, `PAUSED`, `REVOKED`, `EXPIRED` → off,
  `RECOVERED` → on (inchangé ; `IN_GRACE_PERIOD` reste « aucun effet » : à trancher). L'option Cloud garde sa règle.
- `is_premium`/`is_pro` = source de vérité, maintenus par les 4 flux de paiement (stripe-webhook/recomputeStripeFlags, apple-iap-webhook, validate-apple-receipt, google-play-webhook).
- `is_comped` = premium offert sans abonnement actif (décision explicite, posé à la main).
- Ne JAMAIS traiter `is_founder` ni la présence d'`apple_original_transaction_id`/`google_purchase_token` comme signal premium : ces marqueurs survivent à la résiliation (bug « premium fantôme » corrigé le 25/07). `is_founder` reste un marqueur de prix legacy (9,99 €) pour l'affichage tarifaire uniquement.
- Pour tout statut d'abonnement, vérifier la SOURCE (dashboard/API Stripe, Apple, Google) — jamais les colonnes locales seules.


<!-- ex-CLAUDE.md L950-953 : apple-iap-webhook -->
## apple-iap-webhook

Les users promus manuellement sans passer par le flow IAP n'auront jamais d'`apple_original_transaction_id` tant qu'ils ne renouvellent pas via l'app. Sans `appAccountToken` dans le payload Apple, impossible d'identifier l'utilisateur.

## ⛔ (29/10, boncoin59300) Un remboursement n'est jamais un « paiement non enregistré »
- Google `voidedPurchaseNotification` (abonnement ou pack, total ou partiel) et Apple `REFUND` / `REVOKE` partent
  en alerte « ↩️ Remboursement » (`signalerRemboursementStore`, `_shared/payment-notify.ts` → email-tunnel
  `store_remboursement`, type `ops_remboursement`), jamais en « 🚨 PAIEMENT NON ENREGISTRÉ ».
- Le compte se retrouve par le jeton d'achat (Google : `profiles.google_purchase_token`, sinon l'empreinte
  `jeton_empreinte` du journal) ou la transaction d'origine (Apple : `apple_original_transaction_id`).
- Rien n'est appliqué par le remboursement lui-même : le droit d'un abonnement tombe par REVOKED / EXPIRED (Google)
  ou REFUND (Apple, table : off) ; les Pépites d'un pack remboursé restent créditées — décision humaine.


<!-- ex-CLAUDE.md L961-986 : email_logs — type one-shot dans l'index -->
## email_logs — tout nouveau type one-shot DOIT entrer dans l'index

L'unicité de `email_logs` est portée par l'index PARTIEL
`email_logs_one_shot_unique` sur `(user_id, email_type)`, limité à une liste
FERMÉE de types nommés : `welcome`, `how_it_works`, `blast_relaunch_aout`,
`blast_founder`, `founder_plan`, `voice_conversion`.

Règle à respecter AVANT d'ajouter un type d'email :
- **Type one-shot** (un seul envoi par utilisateur, à vie) → l'ajouter au
  `WHERE ... IN (...)` de l'index par migration idempotente, SINON il
  repartira en doublon comme le welcome (bug du 03/08) et rien ne le
  signalera à l'écriture.
- **Type récurrent** (plusieurs lignes légitimes par utilisateur, ex.
  `job_pending_relaunch` et son cooldown 72 h) → ne PAS l'ajouter à l'index ;
  sa protection anti-doublon doit vivre ailleurs (réservation dédiée type
  `job_relaunch_log`, jamais une dédup lue-puis-écrite).
- Toute lecture d'`email_logs` côté fonction doit être PAGINÉE
  (`.order().range()`) : la table dépasse le millier de lignes et PostgREST
  tronque à 1000 sans prévenir.
- Les échecs d'insert sont journalisés dans la table `email_log_echecs` et
  remontés dans l'**ops-digest de 8h50** du lendemain (en plus de `log_echecs`
  dans la réponse et des logs, qui n'ont pas de lecteur quotidien). Deux
  gravités dans le digest : `23505` = un doublon d'envoi vient de partir
  (type one-shot oublié dans l'index — enquêter le jour même) ; autre code =
  ligne de dédup perdue (l'utilisateur reste renvoyable, reposer la ligne).


<!-- ex-CLAUDE.md L987-1008 : Prix d'achat : vide ≠ zéro -->
## Prix d'achat : VIDE ≠ ZÉRO (règle posée le 03/08)
- **(29/10, Nico — remplace la règle du 16/10)** Prix d'achat à 0 € = GRATUIT = prix CONNU : bénéfice ET marge en %,
  dans toutes les moyennes (Tableau, Stats, Ventes, IA). « Prix d'achat manquants » ne se dit que des ventes au
  prix INCONNU (NULL, « je ne sais plus »). `src/utils/ventesStats.js` (`margePctVente`, `margeMoyenne`).
- **(29/10)** Tout prix d'achat écrit EN LOT depuis l'onglet Ventes (« prix commun », « C'était gratuit (0 €) »,
  « Je ne sais plus ») laisse une trace `usage_logs` feature `ventes_prix_achat_lot` : `created_at` = quand,
  `metadata` = { mode: prix | gratuit | inconnu, ventes (réellement écrites), lignes, lignes_demandees, prix_achat
  (mode prix), interrompu }. Origine d'un changement de masse : lire cette trace avant toute enquête.

`inventaire.prix_achat` **NULL = inconnu** → l'article n'entre dans **AUCUN**
calcul de marge, de bénéfice, de total investi ni de moyenne.
`prix_achat = 0` = **article gratuit assumé** (don, lot offert) → il compte
normalement. Ne JAMAIS écrire 0 pour dire « je ne sais pas » : ça produit une
marge de 100 % sur du vent, indétectable ensuite.

- Source unique : `src/utils/comptabilite.js` (prixAchatConnu, comptabilisables,
  totalInvesti, totalMarge, margeUnitaire). Tout nouveau calcul passe par là.
- Ne jamais réintroduire `parseFloat(x) || 0`, `?? 0` ou `Number(x ?? 0)` sur un
  prix d'achat.
- ⚠️ Piège JS : `isNaN(null) === false`. Un `.filter(x => !isNaN(x))` laisse
  donc passer les valeurs nulles comme des zéros — filtrer explicitement.
- `prix_achat_inconnu = true` (bouton « je ne sais plus ») vaut un prix absent :
  exclu des calculs, mais on ne repose plus la question.
- Le **chiffre d'affaires** ne se filtre jamais : il est vrai même sans prix
  d'achat.
- Les 346 lignes historiques à `prix_achat = 0` sont ambiguës et n'ont pas été
  converties. Les 3 dénominateurs divergents de « marge % » (prix de vente,
  prix d'achat, COGS) sont une dette connue, à ne pas unifier sans décision.


## ⛔ 25/10 nuit — revenus : la date de fin Apple s'écrit, chaque appel de Google se journalise (point 4 ; rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 4)
- apple-iap-webhook (code prêt, **NON déployé** le 25/10 : esm.sh ne construisait plus `@peculiar/x509` ; la v37 tourne) :
  à chaque notification qui ouvre ou prolonge (achat, renouvellement, reprise), la date de fin VÉRIFIÉE (JWS) est écrite
  dans `subscription_period_end`, jamais en arrière ; `autoRenewStatus` → `subscription_cancel_at_period_end` ; les refus
  400/403 sont journalisés. validate-apple-receipt (v33) écrit la date de fin et le renouvellement auto du reçu.
- google-play-webhook (v30) : UNE ligne de journal par appel AVANT tout décodage (illisibles compris, `connu` NULL),
  complétée à la sortie (code HTTP, motif, compte, échéance, état) ; le jeton d'achat est haché (sha256), jamais en clair,
  ni en base ni dans les journaux ; le jeton OIDC de Pub/Sub est vérifié en mode « observer » (rien n'est refusé) —
  `GOOGLE_PUBSUB_AUTH=exiger` seulement après l'activation de l'authentification sur l'abonnement push (geste de Nico).
- `stores_notifications_journal` : colonnes d'appel et d'échéance, droits serveur seulement (migration `20261025020000`,
  appliquée le 25/10 à 01:32). Sans elles, payment-notify écrit la forme du 12/10 (aucune ligne perdue) ; ⛔ l'écriture du
  journal ne retient jamais un paiement (bornée à 2 s, issue à 1 s).
- Rattrapage des abonnés Apple actifs sans date (depuis `coin_wallets.next_grant_at`, sans appel Apple) :
  `scripts/reparations/20261025_fin_periode_apple_rattrapage.sql` (sauvegarde + inverse), à lancer APRÈS le déploiement
  d'apple-iap-webhook. Aucune fonction SQL ne lit `subscription_period_end` (relu le 25/10) : la date ne retire jamais
  un abonnement à elle seule.

## 25/10 matin — apple-iap-webhook v39 déployé, échéances Apple rattrapées
- apple-iap-webhook **v39** (verify_jwt false avant et après ; import npm de `@peculiar/x509`, voir
  `base-supabase-et-fonctions.md` § 25/10 matin) : la date de fin s'écrit à chaque notification vérifiée.
- `20261025_fin_periode_apple_rattrapage.sql` lancé à 08:54:23 (essai à blanc d'abord) : 8 abonnés Apple datés (27/10 →
  24/11), sauvegarde `_backup_2510_fin_periode_apple`, inverse prêt. 0 mail.

## 29/10 (lot C partie 5) — jamais deux abonnements au même palier
- Cas boncoin59300 : Premium par Google Play le 26/10 (09:54), puis Premium par Stripe le 29/10 (18:14, payé 18:15:20) :
  deux abonnements actifs. `create-checkout-session` ne refusait que les montées Stripe (Pro, Business).
- Règle (`_shared/paiement-stripe.js`, `refusDoubleAbonnement`) : un abonnement Google Play / Apple vivant (jeton,
  drapeau payant, fin à venir) ferme le paiement web d'un palier égal ou inférieur ; un abonnement Stripe vivant aussi
  (Premium compris). Réponse 409 `deja_abonne` + la phrase (« Tu as déjà cet abonnement par Google Play
  (renouvellement le 26/11) : rien n'a été débité. ») ; rien n'est créé chez Stripe. Une montée au-dessus d'un
  abonnement des stores n'est pas fermée ici (journalisée) : décision de Nico. Selftest `paiement-stripe`.
## ⛔ 30/10 (lot D point 2) — un canal qui s'arrête ne retire que SON droit (rapport `docs/enquetes/lot-d-3010/RAPPORT.md`)
- **Fait rectifié** : BONCOIN (3f91c02e) ne payait PAS deux fois (lot C faux) — Google REVOKED + EXPIRED + remboursé le
  29/10 à 10:04 (`stores_notifications_journal`), Premium Stripe pris à 18:14 = un réabonnement. Le profil gardait
  pourtant jeton, produit et fin Google (26/11).
- **Règle** (`_shared/droits-canaux.js`, `selftest:droits-canaux`) : à l'arrêt d'un canal, les drapeaux = le plus haut
  des AUTRES canaux vivants (Stripe relu en LECTURE par `_shared/stripe-rang-vivant.ts`, Apple = drapeaux + fin à venir) ;
  un arrêt Google TERMINAL (12 REVOKED, 13 EXPIRED, remboursement d'abonnement sur le jeton courant) EFFACE le canal
  (jeton, produit, fin) ; un arrêt passager (5, 6, 10) coupe le droit Google mais garde le jeton (la reprise arrive
  dessus). OFF et CANCELED sur un jeton ABSENT ou remplacé : ignorés. La fin d'un abonnement Stripe ne descend jamais
  sous un store vivant (`drapeauxStripeAvecStores`). Fonctions : google-play-webhook v32, validate-google-purchase v12,
  stripe-webhook v61.
- **La garde « jamais deux abonnements »** (create-checkout-session v61) relit l'abonnement chez Google
  (subscriptionsv2, lecture seule) : actif → refus ; tout autre état → libre ; Google injoignable → preuve locale
  (jeton + produit + fin À VENIR + drapeaux). Apple : fin à venir exigée (13/13 abonnés Apple en ont une). Jamais sur
  la seule présence d'un jeton.
- **MRR** : `abonnements-stores-audit` v2 (x-cron-secret, lecture seule) rend `mrr` par canal, actifs SEULEMENT
  (Stripe « active » ; Apple transaction en cours hors essai gratuit ; Google ACTIVE ou résilié encore payé, jamais la
  période de grâce) — `_shared/mrr.js`. Relevé du 30/10 ~10:35 : Stripe 33 · 837,67 € ; Apple 13 · 236,87 € ;
  Google 1 · 12,99 € ; total 47 · 1 087,53 € TTC/mois. Appel : `select net.http_post(url := '…/abonnements-stores-audit',
  headers := jsonb_build_object('x-cron-secret', public.cron_secret()))` puis `net._http_response`.
- Jetons Google morts restants (drapeaux à 0, API « EXPIRED » ou 410) : 6 profils — non nettoyés (pas demandé) ;
  la garde ne les croit plus. BONCOIN nettoyé : `scripts/reparations/20261030_boncoin_canal_google_mort{,_INVERSE}.sql`.

## 31/10 soir (lot I point 7) — Google Play : l'abandon nommé, l'abonnement confirmé par le serveur
- « Purchase is not purchased » (Android) = feuille Google revenue sans achat : `issue: 'abandon_ou_refus'`, code
  `GOOGLE_NON_ACHETE`, `checkout_abandon` motif `google_non_achete`, toast « Achat non finalisé : rien n'a été débité ».
  Les 6 lignes du 16 au 31/10 : aucun jeton, aucune notification Google, durées d'abandon (5 à 17 s ; chaouidz a payé par
  Stripe feuille ouverte).
- Un abonnement Google « ACKNOWLEDGEMENT_STATE_PENDING » est confirmé par le serveur après l'écriture du droit
  (`_shared/google-accuse-abonnement.js` : validate-google-purchase, filet google-play-webhook sur chaque « on »). Sans
  confirmation Google rembourse à 72 h (BONCOIN 26/10 → remboursée le 29/10 10:04 ; Malena 28/09) : le module Android
  confirmait seul, en asynchrone, puis fermait sa connexion aussitôt.

## ⛔ (03/11, décision de Nico) Un paiement du même palier ouvre TOUJOURS un cycle neuf (cas nadegemarcelin78)
- Le cycle des quotas part du dernier grant (`debut_cycle_quotas`). `upgrade_monthly_grant`, sur un paiement du MÊME
  palier reçu plus de 2 jours avant l'échéance interne, ne créditait rien et reportait l'échéance à la fin de la nouvelle
  période, sans ligne au grand livre : nadegemarcelin78 (Premium, Stripe) payée le 16/10 (échéance interne 20/10), cycle
  29/09 → 16/11 (48 j), bloquée à 1 500 remontées le 29/10.
- Règle (migration `20261103233000`) : un `payment` du même palier dont la fin de période PROLONGE l'échéance de plus de
  2 jours = grant plein à la date du paiement (par `grant_monthly_coins`), compteurs à zéro. Proration, rejeu, RESTARTED
  sans paiement, second appel du même paiement : ne prolongent rien, ne créditent rien. Le reste : inchangé.
- Le recalcul a suivi la même règle (une ligne `grant_monthly` datée du paiement, delta 0, `metadata.rattrapage`) :
  nadegemarcelin78 (cycle au 16/10) et boncoin59300 (29/10, son paiement Stripe ; le cycle partait du paiement Google
  remboursé du 26/10). Preuve jetable `scripts/quotas/preuve-cycle-remontees.mjs`, selftest `cycle-et-remontees`.

## ⛔ (04/11, décision de Nico) Les quotas se lisent par les aides de la grille à 3 jauges, jamais par une clé brute
- Annonces : `jauge_annonces_plafond(compte, palier)` ; remontées : `quota_remontees_plafond(palier)` ; publications :
  `jauge_publications_plafond(palier)` ; Lens du Business : `jauge_lens_plafond(palier)` ; garde-fou du jour :
  `garde_fou_jour(compte, jauge, ajout)`. NULL = pas de compteur (illimité). Interrupteur `coin_config.grille_trois_jauges`
  (0 = règles d'avant, à l'identique). Une fonction neuve qui lit un quota passe par ces aides.
- Les publications comptent comme les remontées : faites ou en cours (`publications_du_cycle`) ; jamais une synchro, un
  import, un retrait, une annulée jamais publiée, une tâche hors quota. Un appel de l'app ne pose jamais « hors quota ».
- Garde-fous par jour (heure de Paris) : publications 2 000, remontées 2 000, annonces 800 ; message de pause honnête,
  jamais une offre ; aucun plafond mensuel caché. Retouches IA et voix : hors des 3 jauges.
- Preuve : `PREUVE_PG=embarque node scripts/quotas/preuve-trois-jauges.mjs` ; selftest `trois-jauges`.

## ⛔ (07/11 soir, essai bac à sable Apple de Nico) Mails FillSell Cloud : prix LU À LA SOURCE, texte PAR CANAL, un seul nom
- Aucun montant écrit en dur dans un mail du Cloud. Le rappel de la veille (`cloud_essai_veille`, email-tunnel) lit le
  prix de la prochaine échéance chez le canal qui prélève, juste avant l'envoi (`_shared/cloud-prix.js`, branché par
  `_shared/cloud-prix-source.ts`) : Stripe = l'abonnement `cloud_ref` (prix de ses éléments, mensuel, sans remise) ;
  Apple = Get All Subscription Statuses, **renouvellement signé** (`renewalPrice` + `currency`) — jamais le prix de la
  transaction d'essai, qui vaut 0 ; Google = `subscriptionsv2.lineItems[].autoRenewingPlan.recurringPrice`. Source
  muette (panne, délai de 5 s, remise, changement de prix, offre à l'échéance) → phrase SANS montant. Source qui dit
  « ne renouvelle pas » → aucun rappel. Lectures bornées : 20 appels et 60 s par passage, fin la plus proche d'abord.
- Le texte dépend du canal : « la carte que tu as enregistrée » et l'arrêt dans Réglages → Abonnement = Stripe SEUL ;
  Apple / Google Play prélèvent sur le moyen de paiement de leur compte, et la résiliation se fait chez eux (bouton direct :
  `https://apps.apple.com/account/subscriptions`, `https://play.google.com/store/account/subscriptions?sku=app.fillsell.cloud.sub&package=app.fillsell.app`).
  ⛔ Jamais « rien n'est facturé » : FillSell ne peut pas le promettre pour une boutique.
- Un seul nom : « FillSell Cloud » (ni « option », ni « add-on », ni « Sans ordinateur »), dans chaque sujet et corps.
- ⛔ (08/11, Nico) Jamais « on publie pour toi », « on te fait ça », ni aucun « on » qui exécute à la place de la
  personne : c'est FillSell Cloud (ou l'extension) qui publie — « FillSell Cloud publie et republie tes annonces ».
  Jamais « tes annonces repassent par l'extension » ni « comme avant » : un client Cloud n'a peut-être aucun
  ordinateur. La phrase vraie pour tous : « Sans FillSell Cloud, tes publications passent par l'extension FillSell, sur
  ton ordinateur. » Vaut pour tous les mails Cloud et tous les textes Cloud de l'app (selftest:cloud-resiliation-mails).
- Le paiement échoué du Cloud n'existe que pour Stripe (Apple et Google relancent eux-mêmes) ; jamais « reste actif »
  pour le Cloud. ~~Aucun mail aujourd'hui pour : début d'essai, arrêt (Stripe : pas d'accusé), renouvellement réussi.~~
  **Remplacé le 08/11 (ordre de Nico, actif au jour J étape 1)** : six mails Cloud — début d'essai, veille, paiement fait,
  arrêt pendant l'essai, arrêt programmé, impayé (Stripe : `paiement-echoue.js`, qui dit « en pause, repart tout seul » ;
  Apple DID_FAIL_TO_RENEW et Google ON_HOLD / IN_GRACE_PERIOD : `_shared/cloud-mails.js`). UN mail par événement : la clé
  (compte, événement, abonnement + facture / transaction / date) est réservée dans `public.cloud_mails` AVANT l'envoi ;
  registre illisible = aucun mail. « Aucun prélèvement » SEULEMENT quand la boutique l'a confirmé (Stripe : annulé avant
  la fin de l'essai et factures à 0 ; Apple : `autoRenewStatus` 0 sur la transaction d'essai ; Google : renouvellement
  coupé en phase d'essai). Stripe : les mails d'arrêt servent d'accusé de réception (L215-1-1). Le montant d'un paiement
  est celui PAYÉ (facture Stripe, transaction Apple, prix récurrent Google hors remise), jamais un prix écrit.
- Preuves : `npm run selftest:cloud-mails-canaux` (mail × canal, rendus par le vrai code), `selftest:cloud-prix-nom`
  (nom étendu aux mails et au serveur Cloud) ; aperçus : `node scripts/apercu/mails-cloud.mjs <dossier>` ; aperçu
  envoyé à l'adresse de test SEULEMENT : email-tunnel `test_template: "cloud_veille"` (+ `test_user_id` = prix lu).
- **(08/11, jour J, ajout de Nico) L'ALERTE À NICO À CHAQUE ÉVÉNEMENT D'ARGENT DU CLOUD** — essai, paiement (1er mois et
  renouvellements), arrêt pendant l'essai (confirmé), arrêt programmé, sur les trois canaux : `_shared/cloud-alerte-nico.js`,
  appelée par `mailsCloud` APRÈS les mails clients (qui ne changent pas). Compte, canal, palier (palier.js), montant lu à
  la source (rien si elle se tait), date de Paris. Destinataire `ALERTE_CLOUD_DESTINATAIRE` = **support@fillsell.app**,
  la même adresse que l'alerte des IP en pause (orchestrateur, `ALERTES_DESTINATAIRE`). Un mail par événement : même
  registre `cloud_mails`, clé « alerte: » + la clé de l'événement ; jamais bloquante. email_logs `cloud_alerte_<événement>`
  (user_id null). Envoi de test : email-tunnel `{ "alerte_cloud_test": true }` (x-cron-secret). selftest:cloud-alerte-nico.

## ⛔ (11/11/2026, point C1 du méga lot de Nico) Conditions de FillSell Cloud : une reformulation garde valables les acceptations précédentes
- Où : texte et case dans `src/cloud/conditionsCloud.js` (le français fait foi, l'anglais pour information) ; écran
  `src/cloud/ConditionsCloudModale.jsx` (case OBLIGATOIRE, bouton grisé, acceptation ENREGISTRÉE par la rpc
  `cloud_cgu_accepter_moi` : version montrée + `now()`, AVANT la préparation et toute carte, Stripe comme boutique) ;
  la version (`CGU_CLOUD_HISTORIQUE`, la plus récente en tête : `CGU_CLOUD_VERSION`), la version MINIMALE
  (`CGU_CLOUD_VERSION_MINIMALE`) et la règle (`versionCguValable`, `conditionsCloudAcceptees`) ont UNE source,
  `supabase/functions/_shared/cloud-conditions.js`, que `src/config/cloudOffer.js` ré-exporte sans rien redéfinir.
- Règle : une acceptation VAUT si sa version est une date AAAA-MM-JJ réelle ET ≥ la version MINIMALE (aujourd'hui
  `2026-11-04`, le dernier changement de fond : le prix). Refusées : vide, format faux, date impossible, < minimale
  (`2026-10-30`, l'ancien prix). Ni liste exacte ni égalité : une app plus récente que le serveur (date changée après le
  déploiement de la fonction, ou web parti avant elle) et une ancienne app (`2026-11-04`) paient sans refus.
- Une REFORMULATION sans changement de fond (ex. les articles 4 et 9 et la case du 11/11/2026) = une version neuve en tête de
  `CGU_CLOUD_HISTORIQUE`, minimale inchangée ; aucun redéploiement synchronisé (la fonction accepte déjà toute date
  ≥ minimale ; la redéployer pour rester à jour, dans n'importe quel ordre). La ligne de version le dit (table
  `NOTES_DE_VERSION` de `conditionsCloud.js`, choisie par le `changement` de la version), ce qui tient l'article 9.
- Un changement de FOND (prix, droits, données…) relève la minimale, EN DEUX TEMPS : (1) la version neuve dans
  `CGU_CLOUD_HISTORIQUE`, minimale INCHANGÉE → déployer `create-checkout-session`, puis le web, puis l'OTA (ancienne et
  neuve passent) ; (2) l'OTA partie, `CGU_CLOUD_VERSION_MINIMALE` = la version neuve → redéployer
  `create-checkout-session` (et livrer l'app) : l'ancienne acceptation est alors redemandée avant tout paiement Stripe.
- La date de la version neuve = la date RÉELLE du push web (heure de Paris) ; elle ne s'écrit qu'à UN endroit du code
  (`CGU_CLOUD_HISTORIQUE[0].version`), plus `VERSION_LIVREE` de `scripts/cloud-executant-selftest.mjs` qui l'épingle.
- Seule lecture de la version : `create-checkout-session` (paiement Stripe web, 409 `conditions_a_accepter`), par
  `conditionsCloudAcceptees` importée de `_shared` (jamais redéfinie, aucune comparaison locale). Rien d'autre ne la lit
  (service du Cloud, Apple / Google, politiques, crons) : le Cloud en service n'est jamais coupé pour une version.
- Mesure de l'étape (`usage_logs` par `tracerCloud`, jamais attendue) : `cloud_conditions_vues`, `cloud_conditions_cochees`,
  `cloud_conditions_annulees` (`coche` : cochée ou non), `cloud_conditions_acceptees` (= « continué », après
  l'enregistrement), `cloud_conditions_echec` (`raison`) ; chaque ligne porte `version`, `lang`, `plateforme`.
  `usage_logs` est écrivable par la personne : c'est une mesure, pas la preuve de l'acceptation (la preuve =
  `profiles.cloud_cgu_version` / `cloud_cgu_acceptee_le`, écrasés à chaque acceptation ; un historique = une migration).
- Verrou : `selftest:cloud-executant` § 3 bis (case, fond de l'article 4 en fr et en, obligation avant toute préparation,
  une seule source, date ≥ minimale exécutée côté app et serveur, date écrite une fois, aucune autre lecture, règle
  écrite) et § 3 ter (la modale exécutée : rendu serveur, « vues » une fois, aucune trace attendue) ; `selftest:cloud-prix-nom`.
- Comptage à OTA + 48 h (date absolue de Paris fixée au départ de l'OTA ; `npx supabase db query --linked --read-only`,
  une requête à la fois, une lecture, jamais en boucle). Seuls comptent les comptes qui ont au moins une trace
  `cloud_conditions_*` dans la fenêtre : un ancien paquet OTA ne trace rien, ses clics ne sont pas une perte de la case.
  Point de comparaison avant C1 (08/11 13:29:50 → 11/11) : 23 clics → 16 acceptations → 8 essais ; population
  minuscule, ne pas conclure sur un écart d'une ou deux unités.
  ```sql
  -- 1. Les événements de l'étape, sur les comptes qui tracent (paquet à jour)
  with traces as (select distinct user_id from usage_logs
                   where feature like 'cloud\_conditions\_%'
                     and created_at >= timestamptz '<OTA> Europe/Paris' and created_at < timestamptz '<OTA> Europe/Paris' + interval '48 hours')
  select feature, count(*) as n, count(distinct user_id) as comptes
    from usage_logs
   where created_at >= timestamptz '<OTA> Europe/Paris' and created_at < timestamptz '<OTA> Europe/Paris' + interval '48 hours'
     and (feature like 'cloud\_conditions\_%' or feature = 'cloud_cta_click')
     and user_id in (select user_id from traces)
   group by 1 order by 1;
  -- 2. Le parcours par compte qui trace (vues → cochées → acceptées / annulées / rien)
  with v as (select user_id,
                    bool_or(feature = 'cloud_conditions_vues') as vu,
                    bool_or(feature = 'cloud_conditions_cochees') as c,
                    bool_or(feature = 'cloud_conditions_acceptees') as a,
                    bool_or(feature = 'cloud_conditions_annulees') as x
               from usage_logs
              where feature like 'cloud\_conditions\_%'
                and created_at >= timestamptz '<OTA> Europe/Paris' and created_at < timestamptz '<OTA> Europe/Paris' + interval '48 hours'
              group by 1)
  select count(*) as comptes, count(*) filter (where vu) as vues, count(*) filter (where c) as cochees,
         count(*) filter (where a) as acceptees, count(*) filter (where x and not a) as annulees,
         count(*) filter (where not a and not x) as sans_issue from v;
  -- 3. Les versions enregistrées depuis l'OTA (la neuve ; quelques 2026-11-04 = anciens paquets)
  select cloud_cgu_version, count(*) from profiles where cloud_cgu_acceptee_le >= timestamptz '<OTA> Europe/Paris' group by 1;
  ```

## ⛔ 11/11/2026 nuit — un essai du Cloud SEUL en cours sur un compte GRATUIT = droits Pro jusqu'à la fin de l'essai (décision 1 de Nico)
- Une RÈGLE dans le temps, pas un drapeau (stripe-webhook réécrit is_pro depuis Stripe) : `palier_de` (SQL) et
  `palierDesDroits` (`_shared/palier.js`) rendent « pro » pour un compte sans palier payé dont l'essai du Cloud seul est
  commencé, pas fini, pas arrêté, pas payé, jamais l'offert. Suivent : quotas (`quotas_etat`, `spend_coins_for_generate`,
  `spend_coins_for_lens`), republication automatique et planifiée, bordereaux. NE suivent PAS (palier PAYÉ, drapeaux) :
  crédit mensuel (`upgrade_monthly_grant`, paresseux ou balayage), `coins_awaiting_payment`, `cloud_etat.avecFormule`.
  À la fin ou à l'arrêt de l'essai, ou au premier paiement du Cloud seul (qui garde les quotas Free, décision 2), le compte
  redevient Free sans rien écrire.
- Migration **20261111230000** (appliquée le 11/11 à 23:19, après banc sur base jetable 56/56, sauvegarde
  `_backup_1111_essai_cloud_droits_pro_*`, lecture avant/après : `scripts/reparations/20261111_essai_cloud_droits_pro_PREUVE.sql`,
  à jouer en postgres, pas `--read-only`). Inverse : `supabase/rollbacks/20261111230000_essai_cloud_seul_droits_pro_INVERSE.sql`
  puis `migration repair --status reverted 20261111230000`. Verrou `npm run selftest:essai-cloud-droits-pro`.

## ⛔ 12/11/2026 nuit — FORMULES AVEC CLOUD (Premium + Cloud, Pro + Cloud, Business + Cloud) : livrées FERMÉES
- UN abonnement par compte, sur son canal, dans le même groupe (Apple « FillSell Plan », Google, Stripe) ; jamais deux
  abonnements. Contrat partagé serveur + app : `supabase/functions/_shared/formules-cloud.js` (formules, essai, supplément,
  produits des boutiques, interrupteurs) ; serveur : `_shared/formules-serveur.js` (prix Stripe en UN endroit,
  `formuleDuProduit` des 3 canaux) ; app : `src/cloud/formulesCloud.js`, `OffresAvecCloud.jsx`, `achatFormuleCloud.js`.
- ⛔ ESSAI de 7 jours SEULEMENT sur Premium + Cloud et Pro + Cloud, une fois par personne (les 4 verrous de l'essai
  Cloud). Business + Cloud : payé dès le premier jour, partout, y compris un abonné Business qui ajoute le Cloud
  (correction de Nico du 11/11, 21:45). Aucune offre d'introduction Apple ni offre Google sur business_cloud.
- Pendant un essai : aucun crédit mensuel (`upgrade_monthly_grant` fixe le début du cycle des quotas : jamais pendant la
  semaine gratuite). ⛔ En SQL aussi (question 9, migration 20261112100000) : `grant_monthly_coins` refuse les appels
  'sweep' (balayage `grant_monthly_coins_sweep`) et 'lazy' (crédit paresseux des spend_coins_*) d'un compte dont une
  formule est en essai (`cloud_formule` + essai en cours, jamais l'offert) → `essai_formule_en_cours`, rien d'écrit ; seul
  'payment' crédite ; `coins_awaiting_payment` (ops-digest) porte la même condition. Verrou essai-formule-credit.
- `profiles.cloud_formule` (migration 20261112000000) : la formule active ou en essai, posée/remise à NULL par les
  fonctions des 3 canaux ; lue par l'app (lecture de SA ligne, aucune écriture client).
- Conditions : deux textes en vigueur, chacun avec SA version — le Cloud seul (2026-11-11, montré à tous, inchangé) et
  les formules (2026-11-12, article 6 neuf, montré SEULEMENT dans l'achat d'une formule et sur la page publique quand
  `cloud_formules_stripe` = 1). Une formule exige une acceptation ≥ 2026-11-12 ; la minimale du Cloud seul ne bouge pas.
- OUVERTURE = interrupteurs `coin_config` `cloud_formules_stripe` / `cloud_formules_apple` / `cloud_formules_google`
  (absent ou ≠ 1 = FERMÉ : app, web, onboarding exactement comme avant) ; témoins = `profiles.beta_flags.cloud`
  (Nico f44b5917, démo du relecteur Apple d6a9e726). Le site vitrine lit `cloud_formules_stripe` sans session :
  `GET /rest/v1/coin_config?key=in.(cloud_formules_stripe)` avec la clé anon. Ordre : web (Stripe) d'abord, iPhone après
  l'accord d'Apple sur les 3 abonnements, Android à la vc37.
- Verrous : formules-cloud-business-sans-essai, -stripe, -boutiques, -comptage-mails, -contrat-app, -ferme, -offres ;
  cloud-executant (deux versions de conditions), paiements-non-regression (lignes nommées dans
  `scripts/fixtures/paiements-lignes-formules-1111.json`).
- ⛔ 12/11/2026 (décision de Nico) — un mail MARKETING porte toujours un lien de désinscription VISIBLE et PERSONNEL :
  envoi-ponctuel remplace `{{lien_desinscription}}` par `lienDesinscription(email, user_id)` (jeton ?t= exigé par
  /desinscription) ; gabarit sans la variable → pied « Se désinscrire » ajouté ; lien incalculable → personne non servie ;
  simulation sans jeton (`_shared/lien-desinscription-visible.js`, verrou `selftest:lien-desinscription-visible`).
  L'en-tête List-Unsubscribe One-Click de la porte reste. Mail d'annonce des formules : type one-shot
  `annonce_formules_cloud` entré dans `email_logs_one_shot_unique` (migration 20261112120000, forme CONCURRENTLY en prod,
  banc `scripts/essais/20261112120000_banc.mjs` écrit par le terminal marketing).

## ⛔ 12/11/2026 (point 7 de Nico, terminal « Problèmes ») — un achat Google Play qui échoue dit POURQUOI
- Cas : 18 premiers achats Google sur 20 revenus « Purchase is not purchased » du 16/10 au 12/11 (8 comptes), feuille
  ouverte, aucune commande chez Google : le module natif jetait la réponse de Google. Rapport
  `docs/enquetes/terminal-problemes-1211/RAPPORT.md` § 7.
- **Le module** (`patches/@capgo+native-purchases+8.3.3.patch`, binaire Android vc38 et suivants) rejette avec le code de
  Google `GOOGLE_<NOM>` (BillingResponseCode : USER_CANCELED, ITEM_ALREADY_OWNED, ITEM_UNAVAILABLE, BILLING_UNAVAILABLE,
  DEVELOPER_ERROR, ERROR, NETWORK_ERROR, SERVICE_*…) et son message de débogage ; une feuille que Google refuse d'ouvrir
  est rejetée (jamais une promesse sans fin). ⛔ Une mise à jour du module refait ce patch, sinon l'app redevient aveugle.
- **L'app** (`src/lib/issueAchat.js`, une source) : chaque code a son issue (annule, deja_abonne, indisponible, reseau,
  erreur) et sa phrase au client (la cause, quoi faire, « rien n'a été débité ») ; un binaire sans code (vc37 et avant)
  garde `abandon_ou_refus` / GOOGLE_NON_ACHETE. `checkout_issue` porte le code, le message de Google, la durée de la
  feuille (`duree_feuille_ms`) et le binaire.
- **Le forfait de base** demandé à Google est `identifier` du produit (le forfait), jamais `planIdentifier` (que le module
  remplit avec l'identifiant du PRODUIT) — `forfaitDeBaseGoogle`.
- Verrou `npm run selftest:achats-google-code`.

## ⛔ 12/11/2026 soir (lot « zéro problème », point 4a de Nico) — un ACHAT DE TEST n'envoie jamais de mail à un client
Rapport : `docs/enquetes/zero-probleme-1211/RAPPORT.md` § 4a. Cas : le compte de test 5322fa18 a reçu un vrai mail
« paiement FillSell Cloud 24,99 € » chaque soir à 18:50 du 08 au 12/11 — chaque fois un DID_RENEW Apple de l'environnement
« Sandbox » (TestFlight renouvelle tous les jours) ; apple-iap-webhook lisait l'environnement pour son journal seulement.
- **Une règle** : `_shared/environnement-store.js` — `notificationDeTest({ canal, environnement, achat, testNotification,
  livemode })` : Apple `data.environment` ≠ « Production » (Sandbox, Xcode, LocalTesting) ; Google `testPurchase` présent,
  `purchaseType === 0` ou notification de test ; Stripe `livemode === false`. Environnement absent ou inconnu = PAS un test
  (un vrai client ne perd jamais un mail par doute). `environnementDeTest(v)` lit une valeur du journal ou du lecteur de prix.
- **Décisions de Nico (12/11)** : aucun mail CLIENT ; l'alerte à support@ est GARDÉE, marquée « [TEST] » (sujet + mention
  « Achat de TEST … ») ; les DROITS sont gardés (le relecteur d'Apple achète dans le bac à sable : il doit voir l'achat marcher).
- **Où** : `mailsCloud({ …, test })` (`_shared/cloud-mails-envoi.ts`) ne réserve ni n'envoie de mail client, l'alerte part
  « [TEST] » ; `notifierPaiement` / `alerterPaiementNonCredite({ …, test })` → sujet « [TEST] » (email-tunnel, payment_alert).
  apple-iap-webhook (14 appels, `enTest` lu sur `data.environment`, planApple compris), google-play-webhook (10 appels) et
  validate-google-purchase (8 appels) passent le drapeau (`deTest(purchase)`). Le rappel de la veille (email-tunnel) écarte un
  essai dont l'abonnement LU À LA SOURCE est de test (le lecteur de prix rend `environnement` pour les 3 canaux).
- **Stripe** : un événement du mode test n'est JAMAIS appliqué en production (rien ne peut y correspondre : clients et
  abonnements du mode test n'existent pas en prod ; la session Cloud cherche aussi par e-mail) : 200 « mode_test », une
  alerte « [TEST] » à support@, rien écrit. Seul écart à « droits gardés », sans effet réel (aucun relecteur Stripe).
- Verrou : `npm run selftest:store-test-sans-mail` (rejoue la ligne 70 du journal sur le vrai module d'envoi : 19 rouges
  sur 881c2b9, vert après) ; lignes relues dans `scripts/fixtures/paiements-lignes-test-1211.json`
  (`selftest:paiements-non-regression`).

## ⛔ 12/11/2026 soir (lot « zéro problème », points 4c, 4d, 4b de Nico) — l'offre suit le CANAL QUI FACTURE ; pendant l'essai, chaque texte dit ce que fait le serveur ; aucune promesse non prouvée
Rapport : `docs/enquetes/zero-probleme-1211/RAPPORT.md` § 4c, 4d, 4b.
- **4c — le canal qui facture, pas l'appareil** : `voieFormulesDuCompte({ canalApp, canalFacture, canalOuvert })`
  (`src/cloud/formulesCloud.js`) → `ici` | `carte_sur_mobile` | `boutique` | `boutique_bientot`. `canalFacture` = le canal de
  l'abonnement (`canalAbonnementDuProfil`) ou, sans formule, celui du Cloud SEUL vivant (`canalDuCloudSeul` :
  `profiles.cloud_canal`, essai ou payé). `canalOuvert` = l'interrupteur `cloud_formules_<canal>` DU CANAL QUI FACTURE.
  Autre canal → aucune carte achetable (jamais deux abonnements) ; boutique fermée (Apple tant qu'il valide) → le texte de
  Nico « Ton abonnement passe par l'App Store. Les formules avec Cloud y arrivent bientôt : Apple est en train de les
  valider… Rien n'a changé, rien n'a été débité. », AUCUN bouton (avant : boutons → conditions → refus 409, ou renvoi vers
  l'iPhone où rien n'existe). Réglages : le client du Cloud seul d'une boutique n'a plus « Voir les formules avec Cloud ».
  Serveur : `messageVoieFormule({ …, ferme })` dit « bientôt » ; create-checkout-session lit l'interrupteur du canal qui
  facture avant de répondre. Une seule source du texte d'une note : `texteNoteCarte` (fenêtre d'offres ET Réglages).
- **4d — pendant un essai** (`essaiEnCours` = lecture Cloud `etat === 'essai'`) : web, montée vers une formule avec essai →
  « Ton essai continue jusqu'au {fin}. Ensuite : {formule}, {prix}/mois. » (le serveur : sans prorata) ; vers Business + Cloud
  → « Business + Cloud n'a pas d'essai : ton essai s'arrête, 79,99 € sont prélevés aujourd'hui. » (le serveur : finEssai) ;
  boutique → « … pendant ton essai, il peut l'arrêter … {boutique} t'affiche le montant avant que tu valides. ». La descente
  du web (feuille de la veille) passe par changer-formule `programmer` (branche « pendant l'essai » : changement immédiat,
  sans prorata), jamais create-checkout-session. Réglages, formule avec Cloud EN ESSAI sur le web : « Arrêter l'essai »
  (cancel-subscription `{ option: "cloud" }`, rien prélevé pour l'essai ; `formule_continue` du serveur), plus « Retirer le
  Cloud ». C4 (« Voir les autres formules ») caché pendant un essai (`blocDescenteVisible({ …, enEssai })`). iPhone / Android :
  essai FillSell déjà pris mais la boutique offre sa semaine gratuite (Apple : Cloud seul et formules dans deux groupes) →
  la question `essaiDejaPrisBoutique` AVANT la feuille de la boutique (la semaine n'active rien, décision 8) ; refusée = rien.
- **4b** — « On te prévient la veille » retiré des 12 textes d'écran (FR / EN : fenêtre d'offres, carte du Cloud seul,
  frises de l'essai, parcours d'entrée) comme du site et du mail (décision 5a) ; les CONDITIONS restent (le rappel est codé
  et part) ; la phrase revient quand email_logs montre un `cloud_essai_veille` RÉEL Stripe ET Apple.
- Verrous : `npm run selftest:formules-canal-ferme` (31), `selftest:formules-essai-changement` (24),
  `selftest:promesse-veille-app` (12 textes attrapés sur 881c2b9) — tous rouges sur 881c2b9, verts après.

## ⛔ 13/11/2026 (Apple a validé les 3 abonnements « + Cloud », envoi 3e203db9 — « on ouvre partout ») — l'ouverture par canal, plus aucun « bientôt »
- **Ouvrir un canal = son interrupteur seul** (`coin_config.cloud_formules_<stripe|apple|google>` = 1) : ni OTA, ni binaire.
  iPhone : le binaire en vente (2.9.164) porte l'achat (le JS de l'OTA demande `app.fillsell.{premium,pro,business}.cloud`).
- **Android : les FORMULES attendent la vc38** (`FORMULES_BINAIRE_MIN_ANDROID` = 2.9.176, `src/config/cloudOffer.js`) : l'app lit
  son binaire au démarrage, les formules s'allument seules chez qui installe la vc38 publiée ; la vc37 rejette tout refus
  Google sans code. Le Cloud seul garde `CLOUD_BINAIRE_MIN_ANDROID` (2.9.167).
- **Plus aucun texte « Les formules avec Cloud y arrivent bientôt… »** (écran, Réglages, offres, serveur). Un canal qui facture
  FERMÉ (retour arrière seulement) MASQUE les formules à ce compte (voie `boutique_fermee` : aucune carte, rien dans
  Réglages, phrase neutre du serveur « Cette formule n'est pas disponible pour le moment. Rien n'a été débité. »).
- **Jamais deux abonnements — le Cloud SEUL d'une boutique** : chez Apple, le Cloud seul (groupe « FillSell Cloud ») et les
  formules (groupe « FillSell Plan ») sont deux groupes ; chez Google, le remplacement ne vise pas `app.fillsell.cloud.sub`.
  Un compte dont le Cloud seul vivant est facturé par l'App Store / Google Play ne voit AUCUNE formule (voie
  `cloud_seul_boutique`), sur tout appareil, tant que Nico n'a pas décidé le passage.
- **iPhone, l'essai annoncé comme sur le web** : le module iOS (`@capgo/native-purchases` 8.3.3) ne rend pas
  `introductoryPrice` ; une clé absente vaut « inconnu », et l'essai suit alors `PRODUITS_ESSAI_APPLE` (`cloud`,
  `premium_cloud`, `pro_cloud` — jamais `business_cloud`) puis la décision du serveur (`src/lib/prixBoutique.js`).
- **Google : le bouton des mails d'une formule** (veille comprise) ouvre l'abonnement de CETTE formule
  (`lienAbonnementGoogle`, `_shared/cloud-rappel-veille.js`), jamais celui du Cloud seul.
- Un abonné de la boutique du téléphone (même groupe) n'a jamais la semaine gratuite d'une formule : pas de question 4d
  pour lui (`abonneBoutique`, `src/cloud/achatFormuleCloud.js`).
- Verrou : `npm run selftest:formules-ouverture-partout` (19 rouges sur 5274cd4, 33 verts après) ;
  `selftest:formules-canal-ferme` mis à jour (13/11).

## ⛔ 13/11/2026 (2e réponse de Nico, « paiements : tout doit être parfait et clair ») — avant de valider, chaque écran dit la formule, le prix, l'essai ou pas, la date du 1er prélèvement ; jamais « 7 jours » non su
- **La semaine d'Apple se LIT, sans binaire neuf** : `src/lib/eligibiliteApple.js` lit l'historique de l'identifiant Apple du
  téléphone (`getPurchases()` du module 8.3.3 = `Transaction.all`, la transaction signée porte `offerType`) et applique la
  règle d'Apple PAR GROUPE (« FillSell Plan » / « FillSell Cloud ») : abonnement en cours du groupe → non ; offre
  d'introduction déjà utilisée dans le groupe → non ; sinon oui (un ex-abonné échu SANS offre utilisée y a droit). Lecture
  échouée → « inconnu ». `etatEssaiBoutique(produit)` (`lib/prixBoutique.js`) : 'oui' | 'non' | 'inconnu' — web 'oui' (le
  serveur décide), Google = l'offre rendue par Google (il ne rend que les offres auxquelles le compte a droit).
- **La ligne de prix d'une carte suit la règle du canal** (`cartesFormulesCloud` → `lignePrix`, texte `texteLignePrix`) :
  essai certain → « 7 jours gratuits … 0 aujourd'hui » ; pas d'essai → « Pas d'essai : {P} prélevés aujourd'hui » ; boutique
  qui offre sa semaine à un compte dont l'essai FillSell a servi → la semaine SANS formule, démarrage au 1er paiement ;
  inconnu (iPhone) → les deux issues dites. Abonné : Stripe « la différence au prorata … est prélevée aujourd'hui »
  (always_invoice) ; App Store « {P} sont prélevés aujourd'hui » (montée immédiate) ; Google Play « la différence au prorata
  aujourd'hui, puis {P} à ta date habituelle » (CHARGE_PRORATED_PRICE). Formules classiques (CAS 4 / 5) : `utils/texteMontee.js`.
- **Résilier sur le web** : `cancel-subscription` n'écrit plus jamais `is_premium=false` faute de client Stripe ; rien de
  vivant chez Stripe → 409 `rien_a_resilier` + la phrase (où ça s'arrête). Formule EN ESSAI résiliée → arrêtée tout de suite,
  rien prélevé. « Se désabonner » caché à qui n'a pas de client Stripe ; la bande « géré par Apple / Google / payé par carte »
  suit le canal QUI FACTURE (profil), plus l'appareil.
- **Mails des formules** : plus de « On te prévient la veille » ; Apple / Google : l'arrêt chez eux ; arrêt programmé Stripe :
  plus de « Garder le Cloud » (ne fait rien pour une formule) ; facture de prorata d'une montée = « Ta formule passe à … »,
  plus « renouvelée » ; arrêt de l'essai d'un abonné : « ta formule {palier} continue » ; impayé boutique : toute la formule en pause.
- Verrou : `npm run selftest:textes-paiement-verite` (l'oracle = la règle de chaque canal, écrite dans le test ; 55 rouges sur
  d73cd9d, 69 verts après). Selftests mis à jour (13/11, décision de Nico) : prix-boutique, cloud-achat, formules-cloud-offres,
  formules-cloud-ferme (note de montée hors empreinte, lien Google normalisé), formules-cloud-contrat-app,
  formules-ouverture-partout, paiements-non-regression (`scripts/fixtures/paiements-lignes-audit-1311.json`).

## ⛔ 13/11/2026 (3e réponse de Nico) — UN SEUL abonnement actif par compte, tous canaux ; remboursement Stripe = Apple ; grâce Google coupée ; impayé = « en pause »
- **(a) Un seul abonnement** (`_shared/un-seul-abonnement.js`, pur, serveur + app) : vivant = Stripe active | trialing | past_due,
  boutique dont la période court, Cloud seul de boutique vivant (jamais l'offert ni is_comped). `decisionAchat({ canal, achat })` :
  autre canal → refus « où faire le changement » (web : fillsell.app › Réglages › Abonnement ; iPhone / Android : l'app de ce
  téléphone) ; même canal : palier ↔ formule passe (même abonnement), Cloud seul à côté d'une formule refusé (« prends sa version
  avec Cloud »), forfait à côté d'un Cloud seul refusé, Stripe en impayé refusé, deux abonnements → support. Jamais « ordinateur ».
  Web : create-checkout-session (409 `un_seul_abonnement`, forfait ET Cloud seul ; la montée « laissée passer » au-dessus d'une
  boutique n'existe plus — 785352fe). iPhone / Android : `garde-abonnement` (lecture seule, verify_jwt true) AVANT la feuille,
  repli local `src/lib/gardeAchat.js`. Filet : `_shared/deux-abonnements.ts` (webhooks + validate-google-purchase, à l'ouverture
  d'un abonnement) → alerte « ⚠️ Deux abonnements » à support@ ; ⛔ aucune annulation, aucun remboursement, aucun mail client.
- **(b) charge.refunded** (stripe-webhook, `_shared/remboursement-stripe.js`) : TOTAL sur la facture en cours d'un abonnement vivant
  → palier et Cloud coupés, durablement (`fillsell_periode_remboursee`, relu à chaque recalcul) ; partiel, période passée, pack →
  gardés ; « ↩️ Remboursement » à support@ dans tous les cas, aucun mail client, rien écrit chez Stripe (l'abonnement y reste actif :
  l'alerte dit de l'annuler). ⚠ `charge.refunded` doit être coché sur le point de terminaison Stripe (réglage de Nico). Apple : le
  Cloud SEUL remboursé alerte aussi.
- **(c) Grâce Google** : validate-google-purchase suit `abonnementGoogleActif` (ACTIVE, ou CANCELED payé) — IN_GRACE_PERIOD ne rouvre
  plus rien (même règle que le webhook, décision du 29/10 ; Google recommande l'inverse : question posée le 13/11).
- **(d) Impayé** : Stripe (`paiement-echoue.js`) dit « {formule} est en pause » (+ « FillSell Cloud et les avantages » pour une
  formule avec Cloud) et comment reprendre (régler la facture ; changer de carte : fillsell.app › Réglages › Abonnement › Mes
  factures) ; Apple / Google : « Pour reprendre, mets à jour ton moyen de paiement chez … ».
- ⛔ **Règle permanente** : un client Cloud ne lit JAMAIS « ordinateur » ni « Chrome » — remplace la phrase du 08/11 « … sur ton
  ordinateur » dans les mails du Cloud (impayé, arrêts, début d'essai) et la ligne des cartes : « FillSell Cloud ne publie, ne republie et
  ne retire plus tes annonces ; celles déjà en ligne y restent » / « … 24 h/24 depuis ses serveurs ». Verrou : impaye-formule-en-pause § D.
- **(e)** Conditions (version 2026-11-13, reformulation, minimales inchangées), CGV art. 7, Legal 3.4 / 3.5 / 4.6, site : plus de rappel
  promis la veille, un seul abonnement, la page de paiement du canal dit l'essai et le montant, arrêt par canal (Apple : 24 h avant).
- **(f)** Essai des abonnés boutique : `_shared/offre-essai-abonne.js` (signature des offres promotionnelles Apple, éligibilité),
  `signer-offre-boutique` (fermée : secret ESSAI_ABONNES_BOUTIQUE), `src/lib/essaiAbonneBoutique.js` (binaire minimal null) : INACTIF.
- Verrous : selftest:un-seul-abonnement, remboursement-stripe, grace-google-jamais-rouverte, impaye-formule-en-pause,
  essai-abonne-boutique, textes-paiement-verite § I-J ; lignes relues : `scripts/fixtures/paiements-lignes-pay2-1311.json`.
- ⚠ Le point (a) ci-dessus est REMPLACÉ par la section suivante (dernière réponse de Nico du 13/11).

## ⛔ 13/11/2026 (dernière réponse de Nico) — UNE SEULE FORMULE à la fois, tous canaux ; le Cloud EN PLUS toujours permis
- Mot pour mot : « Une formule (Premium, Pro ou Business) + le Cloud, c'est NORMAL et c'est ce qu'on veut vendre : par le pack
  (Premium + Cloud, Pro + Cloud, Business + Cloud) ou par le Cloud seul en complément, sur n'importe quel canal. f0acd3af et c7c382b7
  sont des clients normaux. Le seul vrai double, ce sont DEUX FORMULES en même temps (785352fe : Premium App Store + Pro Stripe). »
- **La règle** (`_shared/un-seul-abonnement.js`, `decisionAchat` / `decisionSurLectures` / `compterFormules`, pur, serveur + app) :
  on compte les FORMULES vivantes (palier ou pack, tous canaux). Deux formules → refus « où faire le changement » (une montée /
  descente se fait sur le canal de SA formule, le même abonnement). Le Cloud SEUL à côté d'une formule → TOUJOURS permis, sur tout
  canal (formule Apple + Cloud seul par carte, etc.) ; une formule à côté d'un Cloud seul → permis (la même paire). Le pack sur le
  canal de la formule → la même formule change (permis) ; sur un AUTRE canal → refus `formule_autre_canal`, la phrase propose le
  Cloud seul ici OU le pack sur le canal de la formule. Jamais deux fois le Cloud : pack demandé avec un Cloud seul vivant →
  `cloud_deja` « … choisis la formule sans Cloud : elle s'ajoute à ton Cloud » ; Cloud seul demandé avec un pack → « ta formule
  comprend déjà FillSell Cloud ». Impayé Stripe de la formule de CE canal → `impaye`.
- **Partout la même** : `garde-abonnement` (lit `cloud_formule` — sans elle, le Cloud d'un pack de boutique comptait pour un Cloud
  seul et la montée du pack était refusée), `create-checkout-session` (Cloud seul web : `decisionSurLectures` ; `cloudSeulRefuse`
  ne renvoie plus `offre_remplacee` à un abonné — seul un compte SANS formule reste orienté vers les formules avec Cloud),
  `messageVoieFormule` (pack web : `cloud_boutique` / `deux_abonnements` → la proposition « formule sans Cloud », plus la phrase
  neutre ni « écris-nous » ; `abonnement_boutique` + `cloudSeulPossible` → « prends FillSell Cloud seul, ici »), le filet
  `_shared/deux-abonnements.ts` (alerte seulement pour deux formules ou deux Cloud).
- **L'écran** : Réglages › Abonnement montre le bloc FillSell Cloud (Essayer 7 jours / Ajouter) à un abonné PAYANT sans Cloud, sur
  tout appareil (`blocCloudSeulCache`, `src/cloud/formulesCloud.js`) ; les cartes « + Cloud » restent sur le canal de la formule.
- **Textes** : conditions du Cloud art. 6 (Cloud seul) et CGV art. 7 : « en plus d'un forfait payant (Premium, Pro ou Business),
  sur le web, dans l'App Store ou dans Google Play, quel que soit le canal où le forfait est payé » ; formules : « une seule formule
  à la fois (Premium, Pro ou Business, avec ou sans Cloud) » ; Legal 3.4 « Une seule formule par compte ».
- Verrous : `selftest:cloud-en-plus-de-formule` (casse si la garde refuse un jour un ajout du Cloud à une formule) ;
  `selftest:abonne-ajoute-le-cloud` (le tableau : 36 cases, écran, texte, prélèvement, accès) ; un-seul-abonnement et
  textes-paiement-verite mis à jour.
