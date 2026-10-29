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