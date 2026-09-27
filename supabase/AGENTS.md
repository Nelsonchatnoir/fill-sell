# AGENTS.md — `supabase/` (base de prod, migrations, fonctions edge)

> Complète le `AGENTS.md` de la racine (qui reste valable ici). Même contenu que
> les sections Supabase de `CLAUDE.md`. Projet Supabase : ref `tojihnuawsoohlolangc`.
> Il n'y a PAS de base de test : tout ce qui s'applique ici s'applique en prod.

## ⛔ Interdits absolus

- `supabase db push`, `supabase db reset`, `supabase db remote commit` : INTERDITS.
  Les historiques divergent (≈ 29 fichiers locaux absents côté distant, ≈ 35
  versions distantes sans fichier local). Un push rejouerait des migrations non
  idempotentes : un `cron.schedule('handler-watch-3min')` en double, un revert
  de grants qui modifie des soldes utilisateurs.
- Une migration s'applique **une par une**, via le MCP Supabase
  (`apply_migration`) ou `npx supabase db query -f <fichier>` — jamais en lot.
- Jamais de fonction edge pour envoyer un mail (cf. `AGENTS.md` racine, § 5).
- Jamais un secret dans un fichier : ni clé, ni jeton, ni valeur de
  `x-cron-secret`. Ils vivent dans les secrets des fonctions (`npx supabase
  secrets list` donne les NOMS), dans le vault (`vault.decrypted_secrets`, ex.
  `service_role_key`) et dans la commande de chaque `cron.job`.

## Migrations — la procédure, dans l'ordre

1. **Nommage** : `supabase/migrations/AAAAMMJJHHMMSS_nom_en_francais.sql`, en-tête
   commenté qui dit la décision, la cause mesurée, ce qui n'est PAS touché, et
   « Idempotent » (CREATE OR REPLACE, DROP … IF EXISTS, `ON CONFLICT`).
2. **Relire l'état réel** avant d'écrire : `pg_get_functiondef('public.f'::regproc)`
   — le corps en prod fait foi, pas le dernier fichier du dépôt (une migration
   repartie d'un vieux corps a tué l'import automatique du 19 au 23/09).
3. **Rejeu annulé MONTRÉ avant** : exécuter la migration dans
   `BEGIN; … <SELECT de contrôle>; ROLLBACK;` et montrer le résultat (lignes
   touchées, droits `has_function_privilege` identiques avant/après).
   ⚠️ `npx supabase db query -f` ne rend que le DERNIER statement : mettre le
   SELECT de contrôle en dernier, juste avant `ROLLBACK`.
4. **GO de Nico, nommé** : toute migration de données, tout trigger, tout index
   attend une phrase qui valide CETTE migration (« GO 20260927163000 »). Un
   message qui parle de la suite du chantier n'est PAS un GO.
5. Appliquer, relire l'effet réel en prod, puis commit du fichier avec
   « APPLIQUÉE le JJ/MM HH:MM (GO …) » dans le message.
6. Nouvelle table dans `public` :
   `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;`
   (+ RLS). Nouveau type d'email one-shot → index `email_logs_one_shot_unique`
   le jour même (cf. racine).
7. Pièges d'écriture : un antislash (`\b`) écrit via heredoc Bash devient
   U+0008 (regex morte, sans erreur) → écrire avec un éditeur de fichier ; dans
   un générateur JS, `String.replace` interprète `$'` → remplacer par fonction.

## Fonctions edge — le geste avant tout déploiement

```
npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
```

On lit `verify_jwt` AVANT, on le relit APRÈS. `supabase/config.toml` est la
source de vérité pour les fonctions qui y sont déclarées ; pour les autres, un
déploiement sans `--no-verify-jwt` remet `verify_jwt` à `true` → le cron ou le
webhook tombe en 401, en silence.

| L'appelant | verify_jwt | Ce que la fonction doit faire |
|---|---|---|
| pg_cron / pg_net (trigger) | **false** | garde `x-cron-secret` obligatoire |
| Webhook externe (Stripe, Apple, Google, eBay) | **false** | vérifier la signature |
| Lien public, redirection OAuth | **false** | jeton dans l'URL |
| App ou extension (JWT utilisateur) | **true** (défaut) | rien, la plateforme garde |
| Deux appelants dont un sans session | **false** | garde maison à deux branches |

`verify_jwt: false` ≠ « pas d'authentification » : la fonction s'authentifie elle-même.

Commande : `npx supabase functions deploy <nom> --project-ref tojihnuawsoohlolangc [--no-verify-jwt]`
(l'avertissement « Docker is not running » est sans effet).

- **Numéros de version** : ne jamais en écrire un sans l'avoir lu dans
  `functions list`. Il monte à chaque déploiement, même sans effet ; il prouve
  qu'un déploiement a eu lieu, jamais qu'il a changé quelque chose.
- **Imports distants épinglés** : jamais `@2` ni aucune version flottante.
  Versions éprouvées : `@supabase/supabase-js@2.117.0`, `std@0.168.0`,
  `stripe@12.18.0`, `@peculiar/x509@1.9.0`, `imagescript@1.3.0`.
  Contrôle : `npm run selftest:imports-epingles`. Changer de version = bouger
  `VERSIONS_ATTENDUES` dans `scripts/imports-epingles-selftest.mjs`. Pas
  d'import map partagé (choix : non prouvable sans déployer).
- Les modules partagés (`functions/_shared/*.js`) sont souvent importés AUSSI
  par l'app (`src/`) : une règle, un fichier. Toucher un module partagé =
  redéployer toutes les fonctions qui l'importent (`grep -rl <module> supabase/functions`)
  ET prévoir l'OTA de l'app si `src/` l'importe.

## pg_net / cron

- `net._http_response` se purge seul : lire le statut **immédiatement** après l'appel.
- Dans pg_net, seul le header custom `x-cron-secret` fonctionne (pas de query
  param, pas d'`Authorization`). Trigger `handle_new_user` → `email-tunnel`.
- Le secret de cron est le même pour tous les crons. Sa rotation est un
  chantier à part (`docs/ROTATION_CRON_SECRET.md`) : tout change ensemble
  (variable `CRON_SECRET` des fonctions + chaque `cron.job`), jamais en passant.
- `cron.job` en prod fait foi, pas les fichiers de migration.

## `email_logs` — tout nouveau type one-shot DOIT entrer dans l'index

L'unicité de `email_logs` est portée par l'index PARTIEL
`email_logs_one_shot_unique` sur `(user_id, email_type)`, limité à une liste
FERMÉE de types (`welcome`, `how_it_works`, `blast_relaunch_aout`,
`blast_founder`, `founder_plan`, `voice_conversion`, et les blasts ajoutés
depuis — lire la définition de l'index en prod).

- **Type one-shot** (un envoi par personne, à vie) → l'ajouter au
  `WHERE ... IN (...)` de l'index par migration idempotente, LE JOUR MÊME,
  sinon il repartira en doublon sans que rien ne le signale (bug du welcome,
  03/08).
- **Type récurrent** (ex. `job_pending_relaunch`, cooldown 72 h) → PAS dans
  l'index ; protection par réservation dédiée (`job_relaunch_log`), jamais
  une dédup lue-puis-écrite.
- Échecs d'insert → `email_log_echecs`, remontés dans l'ops-digest de 8h50.
  `23505` = un doublon d'envoi vient de partir (type one-shot oublié dans
  l'index : enquête le jour même) ; autre code = ligne de dédup perdue (la
  personne reste renvoyable : reposer la ligne).
- Plafond marketing : 2 mails par personne sur 24 h glissantes (toutes lignes
  `email_logs` confondues) ; `support` jamais plafonné.

## Requêtes d'analyse

- Toujours `AT TIME ZONE 'Europe/Paris'`.
- Toujours exclure les comptes de test par un CTE `excluded` (`unnest(ARRAY[...])`)
  — liste dans `AGENTS.md` racine.
- Lectures d'`email_logs` côté fonction : TOUJOURS paginées (`.order().range()`),
  PostgREST tronque à 1000 lignes sans prévenir.
- Un `.select()` PostgREST est tout-ou-rien : une colonne inexistante = HTTP 400
  et `data = null` (l'écran se vide sans erreur). Vérifier la colonne dans
  `information_schema.columns` avant de l'ajouter. `cross_post_jobs` n'a PAS
  de `updated_at`.
