# FillSell — Instructions Claude

## Git
- Toujours push sur `main` directement.

## Déploiement des Edge Functions

Toutes les fonctions webhook et cron doivent être déployées avec `--no-verify-jwt` :
- email-tunnel
- apple-iap-webhook
- google-play-webhook
- stripe-webhook
- send-merine-reply
- tiktok-event

Commande : `supabase functions deploy <nom> --no-verify-jwt`

Ne jamais déployer ces fonctions sans ce flag, sinon `verify_jwt` repasse à `true` et les appels externes (Apple, Stripe, Google, pg_net) sont bloqués en 401.
