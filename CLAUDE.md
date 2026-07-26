# FillSell — Instructions Claude

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
- send-merine-reply
- tiktok-event
- apple-subscription-status

Commande : `supabase functions deploy <nom> --no-verify-jwt`

Ne jamais déployer ces fonctions sans ce flag, sinon `verify_jwt` repasse à `true` et les appels externes (Apple, Stripe, Google, pg_net) sont bloqués en 401.

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

## Queries Supabase analytics

- Toujours utiliser `AT TIME ZONE 'Europe/Paris'`.
- Toujours exclure les emails de test via un CTE `excluded` avec `unnest(ARRAY[...])`.

## pg_net

`net._http_response` se purge automatiquement. Vérifier le statut immédiatement après l'appel.
