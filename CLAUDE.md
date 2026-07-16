# FillSell — Instructions Claude

## Format des réponses

Toujours mettre le contenu des réponses textuelles dans un bloc de code (``` ```) pour faciliter le copier-coller. Diagnostics, rapports, récapitulatifs, listes de changements — tout doit être dans un bloc.

## Git
- **Migrations Supabase** : toujours appliquées directement en prod (comportement normal et irréversible).
- **Code applicatif** (React, Edge Functions, extension Chrome) : toujours sur une branche feature, jamais sur `main` avant validation complète et tests OK.
- Pour les hotfixes urgents uniquement : push direct sur `main` autorisé.

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

Ne jamais utiliser `is_premium` seul, mais ne jamais l'omettre non plus (un Premium standard Stripe web n'a ni token Apple/Google ni `is_founder`). Expression complète, identique partout (App.jsx, voice-transcribe, voice-intent, lens-analysis, generate-listing) :
```sql
is_premium = true OR is_pro = true OR is_founder = true
  OR apple_original_transaction_id IS NOT NULL OR google_purchase_token IS NOT NULL
```
`is_founder` n'est plus un tier : c'est un marqueur de prix legacy (9,99 €/mois grandfathered) pour les ~100 anciens comptes Founder, désormais des Premium comme les autres.

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
