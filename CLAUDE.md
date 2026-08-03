# FillSell — Instructions Claude

## ⛔ `supabase db push` est INTERDIT

Tant que la baseline n'est pas refaite, **ne jamais lancer `supabase db push`**
sur ce projet.

Les historiques de migrations divergent : 29 fichiers locaux ne sont pas
enregistrés côté distant, ~35 versions distantes n'ont pas de fichier local. Un
push rejouerait des migrations **non idempotentes**, dont :
- un `cron.schedule('handler-watch-3min')` → job planifié **en double** ;
- un revert de grants → **soldes utilisateurs modifiés**.

Les migrations s'appliquent **une par une**, après vérification de leur effet
réel en prod. Interdits également tant que ce bandeau est là : `db reset`,
`db remote commit`.

## Dossier de travail — UN SEUL, sans exception

- Le SEUL dossier de travail est `C:\Users\nicol\fill-and-sell\`. Il n'en
  existe pas d'autre : l'ancien worktree
  `C:\Users\nicol\fill-and-sell-chrome-extension\` a été SUPPRIMÉ le
  26/07/2026 (il a coûté une matinée : zip CWS du 24/07 parti sans le fix
  Beebs, deux extensions actives se disputant les jobs). Si un rapport, une
  mémoire ou un commentaire de code y fait encore référence, il est périmé —
  ne JAMAIS y rediriger Nico, ne jamais le recréer.
- L'extension unpacked se charge dans Chrome depuis
  `C:\Users\nicol\fill-and-sell\build\extension\` (produit par
  `npm run build:extension`). Aucun autre chemin.
- UNE SEULE extension FillSell active dans Chrome à la fois — jamais la
  version Web Store ET une unpacked ensemble : elles pollent les mêmes jobs,
  se les disputent, et `handler_build` en base ment sur qui a traité quoi.
  Avant un test unpacked : désactiver/retirer la version Web Store.
- Un push sur main ne déploie PAS l'extension. Le déploiement, c'est :
  `npm run package:extension` (qui refuse tout paquet non traçable), puis
  téléverser `build\fillsell-extension-<version>-cws.zip` sur la fiche
  Chrome Web Store, ET cliquer « Envoyer pour examen ». Tant que ces trois
  gestes ne sont pas faits, les utilisateurs tournent sur l'ancien code —
  vérifiable par `profiles.extension_build` / `cross_post_jobs.handler_build`.

## Format des réponses

Toujours mettre le contenu des réponses textuelles dans un bloc de code (``` ```) pour faciliter le copier-coller. Diagnostics, rapports, récapitulatifs, listes de changements — tout doit être dans un bloc.

## Git
- **Migrations Supabase** : toujours appliquées directement en prod (comportement normal et irréversible).
- **Code applicatif** (React, Edge Functions, extension Chrome) : commit et push **directement sur `main`**, plus de branche feature ni de PR (consigne 2026-07-21). Toujours build/vérifier avant de push — le push tient lieu de validation.
- Déployer les Edge Functions concernées quand elles changent (cf. section dédiée).

## Déploiement des Edge Functions

Toutes les fonctions webhook et cron doivent être déployées avec `--no-verify-jwt` :
- email-tunnel
- apple-iap-webhook
- google-play-webhook
- stripe-webhook
- tiktok-event
- apple-subscription-status
- apple-notification-history
- ops-digest
- handler-watch

(`send-merine-reply` a été supprimée en prod le 28/07/2026 — un one-shot en
`verify_jwt = false` que plus rien n'appelait.)

Commande : `supabase functions deploy <nom> --no-verify-jwt`

Ne jamais déployer ces fonctions sans ce flag, sinon `verify_jwt` repasse à `true` et les appels externes (Apple, Stripe, Google, pg_net) sont bloqués en 401.

**Numéros de version** : ne JAMAIS écrire un numéro de version de fonction
(rapport, STATUS.md, commentaire, commit) sans l'avoir lu dans
`npx supabase functions list`. Les compteurs ne se suivent pas d'une fonction
à l'autre (voice-transcribe v36 quand voice-intent est v148) — un numéro
« déduit » est faux.

## Trigger handle_new_user

Le trigger pg_net appelle email-tunnel via le header `x-cron-secret: fs-cron-2026-tunnel`.
Ne pas utiliser de query param ni de header `Authorization` dans pg_net — seul le header custom fonctionne.

## Premium detection

Règle métier (2026-07-25) : **résilié/expiré = plus premium, partout**. Expression canonique, identique partout (App.jsx, voice-transcribe, voice-intent, generate-listing, deal-analysis, sweep et RPC Pépites, check_inventory_limit) :
```sql
is_premium = true OR is_pro = true OR is_comped = true
```
- `is_premium`/`is_pro` = source de vérité, maintenus par les 4 flux de paiement (stripe-webhook/recomputeStripeFlags, apple-iap-webhook, validate-apple-receipt, google-play-webhook).
- `is_comped` = premium offert sans abonnement actif (décision explicite, posé à la main).
- Ne JAMAIS traiter `is_founder` ni la présence d'`apple_original_transaction_id`/`google_purchase_token` comme signal premium : ces marqueurs survivent à la résiliation (bug « premium fantôme » corrigé le 25/07). `is_founder` reste un marqueur de prix legacy (9,99 €) pour l'affichage tarifaire uniquement.
- Pour tout statut d'abonnement, vérifier la SOURCE (dashboard/API Stripe, Apple, Google) — jamais les colonnes locales seules.

## apple-iap-webhook

Les users promus manuellement sans passer par le flow IAP n'auront jamais d'`apple_original_transaction_id` tant qu'ils ne renouvellent pas via l'app. Sans `appAccountToken` dans le payload Apple, impossible d'identifier l'utilisateur.

## Supabase migrations

Toute nouvelle table dans le schéma public nécessite :
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nouvelle_table TO authenticated;
```

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

## Prix d'achat : VIDE ≠ ZÉRO (règle posée le 03/08)

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

## Queries Supabase analytics

- Toujours utiliser `AT TIME ZONE 'Europe/Paris'`.
- Toujours exclure les emails de test via un CTE `excluded` avec `unnest(ARRAY[...])`.

## pg_net

`net._http_response` se purge automatiquement. Vérifier le statut immédiatement après l'appel.
