## État de production au 01/10 matin — lire avant toute action

`docs/agents/etat-2026-10-01.md` (versions, crons, ce qui est ouvert) et
`docs/agents/consignes-2026-09-28.md` (règles), qui remplacent tout
historique contraire. Il se périme : `functions list`, `cron.job` et
`profiles.extension_build` font foi.

- **Servi** : extension **0.6.81** (minimum serveur inchangé, 0.6.75) ;
  OTA **2.9.36** ; `get-pending-jobs` v177 (`true`), `update-job-status` v111
  (`false`), `ebay-api-worker` v71 (`false`), `handler-watch` v66 (`false`),
  `check-listing-status` v35 (`false`), `ops-digest` v28 (`false`). ⚠️ Le 30/09 22:52, le changement de
  `CRON_SECRET` a monté TOUTES les versions d'un cran sans changer le code.
- **Crons coupés** : 17 `doublons-balayage-2min`, 22 `fusion-photo-lot-10min`.
- **Migrations** : jamais à la main. `db query --linked -f <fichier>` PUIS
  `migration repair --linked --status applied <version>`, relecture de
  l'effet. Les 15 du 29-30/09 sont inscrites (01/10).
- **Données** : toute correction = requête dans `scripts/reparations/`
  (`git add -f`, `*.sql` est ignoré), sauvegarde avant, inverse prêt. Celles
  du 30/09 faites sans trace y sont reconstituées (1 090 fusions par photo).
- **Ouvert** : 0.6.83 (contient la 0.6.82) PROUVÉE le 01/10 (republication Beebs 34090327), à téléverser par Nico (`build/CWS-0.6.83-A-TELEVERSER/`) à la place de la 0.6.82 ;
  ornellaracano 307204072564 — retrait en file (cf. l'état du 01/10).

# FillSell — Instructions Claude

> **Jumeau de `AGENTS.md`** (lu par Codex), qui reprend toutes les règles
> ci-dessous + architecture, état des chantiers et glossaire (`supabase/AGENTS.md`,
> `src/AGENTS.md`, `docs/agents/*.md`). Une règle ajoutée ici se reporte là-bas,
> le même jour. ⚠️ Codex ne lit que ~32 Ko d'`AGENTS.md` : garder la racine
> sous cette taille, le détail va dans `docs/agents/`. Jamais d'`AGENTS.md` ni
> d'autre fichier annexe dans `chrome-extension/` : tout commit dans ce
> dossier impose de recaler `EXTENSION_LAST_COMMIT`, sinon `npm run build` échoue.

## ⛔ `supabase db push` est INTERDIT

Tant que la baseline n'est pas refaite, **ne jamais lancer `supabase db push`**
sur ce projet.

Les historiques de migrations divergent (audit du 26/09) : les 35 versions
distantes sans fichier ont été CAPTURÉES dans le dépôt, mais ~118 fichiers
locaux n'ont aucune trace dans l'historique distant (appliqués hors historique,
ou jamais appliqués). Un push rejouerait des migrations **non idempotentes**,
dont :
- un `cron.schedule('handler-watch-3min')` → job planifié **en double** ;
- un revert de grants → **soldes utilisateurs modifiés**.

Les migrations s'appliquent **une par une**, après vérification de leur effet
réel en prod. Interdits également tant que ce bandeau est là : `db reset`,
`db remote commit`.

⛔ **AVANT de réécrire une fonction SQL : partir de la définition EN PROD**
(`pg_get_functiondef`), jamais du dernier fichier du dépôt. Le 26/09, 22
fonctions tournaient dans une version qu'aucun fichier ne portait (correctifs
appliqués en direct, migrations « patch » par remplacement de texte). Elles
sont capturées dans `20260926235900_depot_suit_la_prod_capture_2609.sql` —
mais tout correctif appliqué en direct depuis recrée l'écart.

## Dossier de travail — UN SEUL, sans exception

- Le SEUL dossier de travail est `C:\Users\nicol\fill-and-sell\`. Il n'en
  existe pas d'autre : l'ancien worktree
  `C:\Users\nicol\fill-and-sell-chrome-extension\` a été SUPPRIMÉ le
  26/07/2026 (il a coûté une matinée : zip CWS du 24/07 parti sans le fix
  Beebs, deux extensions actives se disputant les jobs). Si un rapport, une
  mémoire ou un commentaire de code y fait encore référence, il est périmé —
  ne JAMAIS y rediriger Nico, ne jamais le recréer.
- Le build de l'extension est produit dans `build\extension\`.
  Le poste Nico charge la copie stable autorisée dans
  `C:\Users\nicol\FillSell-Extension-Nico` (Fable, 28/09).
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

## ⛔ RÈGLES DÉFINITIVES DU 27/09 SOIR (synchronisation) — jumelles d'AGENTS.md § 4

- **Un titre n'est JAMAIS une preuve d'identité** : ni pour rattacher une
  annonce, ni pour fusionner des fiches automatiquement, ni pour retirer. Le
  doute devient la question « Est-ce le même article ? » / « Déjà vendu ? ».
  (Louis duplique ses articles sur Beebs — mêmes titres, articles différents :
  deux annonces à vendre retirées à tort le 27/09.)
- **Deux annonces sur la même plateforme sont deux exemplaires.** Une vente ne
  retire que les copies de CET exemplaire sur les AUTRES plateformes, liées
  par une preuve (`retrait_job_prouve` : dépôt FillSell, identifiant, import,
  geste de la personne ; jamais une fusion automatique).
- **Aucun verdict sur un relevé incomplet** (refusée, disparue, vendue) ; un
  relevé incomplet est repris seul.
- **Un champ manquant se demande** (choix fermés en français), il ne se
  relance jamais en boucle.
- **Republier une annonce importée est normal** ; « import ≠ publication » ne
  concerne que le comptage (quotas, statistiques).

## Format des réponses

Toujours mettre le contenu des réponses textuelles dans un bloc de code (``` ```) pour faciliter le copier-coller. Diagnostics, rapports, récapitulatifs, listes de changements — tout doit être dans un bloc.

## Git
- **Migrations Supabase** : appliquées en prod une par une (comportement normal et irréversible), et TOUJOURS inscrites dans l'historique : `db query --linked -f <fichier>` puis `migration repair --linked --status applied <version>` (règle du 01/10).
- **Code applicatif** (React, Edge Functions, extension Chrome) : commit et push **directement sur `main`**, plus de branche feature ni de PR (consigne 2026-07-21). Toujours build/vérifier avant de push — le push tient lieu de validation.
- Déployer les Edge Functions concernées quand elles changent (cf. section dédiée).

### ⛔ UN SEUL PUSH SUR `main` PAR LOT (consigne 2026-09-18, payée deux fois)

« Fichier par fichier » veut dire **commits**, JAMAIS déploiements. Les commits
restent séparés pour la lisibilité — ils **partent ensemble**.

Un push = un déploiement Vercel = **tous les chunks renommés**. Le 18/09, six
pushs en dix minutes (dont quatre déploiements en trente-trois secondes) ont
mis la prod à l'écran blanc : chaque onglet ouvert pointait sur des fichiers
qui venaient d'être supprimés. Le code était bon, le build vert.

Empiler les commits en local, vérifier, puis pousser **une fois**. Un fichier
neuf à sortir avant son câblage reste un COMMIT séparé dans le MÊME push.

### ⛔ ÉCRAN BLANC : LE BUILD AVANT LE CODE

Ordre de diagnostic, non négociable — une demi-journée perdue le 11/09 et une
autre le 18/09 pour avoir cherché dans les fichiers d'abord :

1. **l'empreinte du build** — en bas de la page Réglages, ou
   `curl https://fillsell.app/build.json` : elle dit quel commit tourne
   vraiment chez la personne (jamais `-dirty` depuis le 01/10 : `npm run
   build` REFUSE un arbre sale — Vercel comme OTA — et nomme les fichiers ;
   `package.json` et `package-lock.json` montent ENSEMBLE ; simple
   vérification de compilation : `npm run build:essai`, jamais servi) ;
2. **un rechargement forcé** — si l'écran revient, c'était un chunk périmé et
   il n'y a rien à corriger dans le code ;
3. **l'état du déploiement Vercel** (READY ou ERROR) ;
4. **alors seulement**, ouvrir un fichier.

⚠️ Un écran blanc n'est pas forcément une exception de rendu : avec `lazy()` +
`<Suspense fallback={null}>`, un 404 sur un chunk rend exactement le même écran
vide qu'un crash, **et le build est vert dans les deux cas**. Depuis e67aae3 la
garde `vite:preloadError` (src/main.jsx) recharge une fois toute seule — un
écran blanc qui SURVIT à ça, alors oui, c'est du code.

## Déploiement des Edge Functions

### ⛔ LE GESTE, AVANT TOUT DÉPLOIEMENT — UNE LIGNE, À COPIER

```
npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
```

**On lit l'état RÉEL avant, on le relit après.** Un déploiement sans
`--no-verify-jwt` remet `verify_jwt` à `true` : le cron ou le webhook tombe en
401, en silence, et personne ne le voit avant que les jobs s'empilent.
C'est ce geste qui a évité de casser le cron `ebay-api-worker-2min` le
18/09 — la fonction tourne en `false` et **ne figurait pas** dans la liste
ci-dessous, qui était la seule source consultée jusque-là.

### LA RÈGLE — C'EST L'APPELANT QUI DÉCIDE, PAS LA LISTE

Une liste se périme à chaque fonction ajoutée : c'est exactement comme ça que
le trou d'`ebay-api-worker` est né. La question n'est jamais « est-elle dans la
liste ? » mais **« qui l'appelle, et cet appelant a-t-il une session
Supabase ? »** :

| L'appelant | verify_jwt | Ce que la fonction doit faire |
|---|---|---|
| pg_cron / pg_net (trigger) | **false** | garde `x-cron-secret` obligatoire |
| Webhook externe (Stripe, Apple, Google, eBay) | **false** | vérifier la signature de l'émetteur |
| Lien public, redirection OAuth | **false** | jeton dans l'URL, jamais rien d'implicite |
| App ou extension (JWT utilisateur) | **true** (défaut) | rien, la plateforme garde |
| DEUX appelants dont un sans session | **false** | garde maison à deux branches |

⛔ `verify_jwt: false` n'est JAMAIS « pas d'authentification » : c'est
« l'authentification est faite par la fonction elle-même ». Une fonction en
`false` sans garde propre est une porte ouverte.

Commande : `supabase functions deploy <nom> --no-verify-jwt`

### L'ÉTAT RELEVÉ LE 18/09/2026 — 33 fonctions en `verify_jwt: false` sur 57

Relevé par `functions list`, pas recopié. Il se périme : le geste ci-dessus
fait foi, pas ce tableau.

⚠️ **Relevé du 01/10/2026 : 49 fonctions actives, 24 en `false`.**
`send-batch-notifications` et `send-chantier-zip` **n'existent plus en
prod**. Liste à jour : `docs/agents/architecture.md`.

**Appelées par pg_cron / pg_net (`x-cron-secret`)** — `cron.job` le prouve :
`ebay-api-worker` (*/2) · `republish-auto-sweep` (*/3) · `handler-watch` (*/3)
· `beebs-lien` (*/5) · `email-tunnel` (9h + horaire, **et** le trigger
`handle_new_user`) · `ops-digest` (8h50) · `republish-purge` (3h40) ·
`lens-temp-purge` (3h50 — jamais de purge côté client : un client ne voit que
SON scan, c'est ce qui effaçait les photos d'articles avant le 15/09) ·
`empreintes-urls` (appelée par `fusion_photo_tick`, cron 20 chaque minute) ·
`stripe-recalage-1er-du-mois` (cron 18 via `recalage_xewer_tick`, le 01/10
de 00:00 à 03:55 seulement) ·
`doublons-balayage` (cron 17, **INACTIF depuis le 28/09** ; déclarée
`verify_jwt = false` dans `config.toml`).

**Webhooks externes** (l'émetteur n'a pas de session) : `stripe-webhook` ·
`apple-iap-webhook` · `google-play-webhook` · `ebay-account-deletion` ·
`ebay-oauth-callback` (redirection eBay).

**Appel public assumé** : `email-desinscription` (le lien des emails ; un
`verify_jwt` à true le rendrait inopérant et bloquerait toute campagne) ·
`apple-subscription-status` · `apple-notification-history`.

**Font leur PROPRE garde** : `resolve-categorie` (deux appelants : l'app avec
JWT, le worker eBay avec `x-cron-secret`) · `voice-intent` (Bearer + getUser
maison, pour maîtriser sa réponse 401/CORS) · `update-job-status` ·
`check-listing-status`.

**One-shots déployés à la main** : aucun en prod au 01/10 (les
`send-<prénom>-<date>` sont interdits, cf. plus bas). (`send-chantier-zip` et `check-early-adopter` —
stubs 410 — ont été SUPPRIMÉES de la prod le 26/09/2026 : 0 appel en 30 jours
de journaux, 0 cron, 0 fonction SQL, 0 ligne de code.)
(`send-relance` a été SUPPRIMÉE de la prod le 20/09/2026 — jeton en clair dans
un fichier gitignoré, campagnes toutes parties, aucun appelant.)

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

### ⛔ JAMAIS D'IMPORT DISTANT FLOTTANT — TOUJOURS UNE VERSION ÉPINGLÉE

`https://esm.sh/@supabase/supabase-js@2` suit **toutes** les 2.x publiées, y
compris celle qui casse. Le 23/09, `@2` a résolu vers 2.117.1, dont la
dépendance `@supabase/functions-js@2.117.1` rend **404** sur esm.sh (le paquet
n'y a jamais été publié). Mesuré en direct : `2.117.1 → 404`, `2.117.0 → 200`.
Effet : **plus aucune fonction edge important supabase-js ne pouvait être
déployée** — 48 fichiers, c'est-à-dire à peu près tout le serveur. Découvert
par hasard, en déployant autre chose ; personne n'aurait rien vu jusqu'au
premier déploiement d'urgence.

Une dépendance flottante, c'est **une panne de déploiement décidée par
quelqu'un d'autre, un jour qu'on ne choisit pas**. On épingle tout :
`@supabase/supabase-js@2.117.0`, `std@0.168.0`, `stripe@12.18.0`,
`@peculiar/x509@1.9.0`, `imagescript@1.3.0`.

Le contrôle qui l'empêche de revenir, y compris dans un fichier neuf :
```
npm run selftest:imports-epingles
```
Il échoue sur toute importation distante sans version complète (`@2` compte
comme flottant) et sur toute version qui s'écarte de celle qu'on a éprouvée.
**Pour changer de version** : bouger `VERSIONS_ATTENDUES` dans
`scripts/imports-epingles-selftest.mjs`, un `sed` sur `supabase/functions/`,
relancer le test. Une ligne, pas quarante-six.

⚠️ **Pas d'import map partagé, et c'est un choix** : on ne peut pas le PROUVER
sans déployer (`deno check` résout côté client, c'est le bundler du serveur qui
tranche à la livraison, et la CLI n'a pas de `--dry-run`). Un import map non
éprouvé déplacerait le risque d'un cran, jusqu'au premier déploiement pressé.

## Trigger handle_new_user

Le trigger pg_net appelle email-tunnel via le header `x-cron-secret`, dont la valeur se lit par `public.cron_secret()` (vault, secret `cron_secret`) — jamais écrite dans le dépôt.
Ne pas utiliser de query param ni de header `Authorization` dans pg_net — seul le header custom fonctionne.

## Secret de cron — dans le vault et l'environnement, jamais dans le dépôt (30/09)

Le secret `x-cron-secret` protège toutes les fonctions en `verify_jwt = false`
appelées par pg_cron / pg_net. Depuis le 30/09 il n'est écrit NULLE PART dans le
dépôt (l'ancienne valeur, sur GitHub depuis juin, a été changée le 30/09) :

- côté base : vault, secret `cron_secret`, lu par `public.cron_secret()` (SECURITY
  DEFINER, fermée à anon/authenticated). Les commandes `cron.job` et les
  fonctions pg_net construisent l'en-tête par
  `jsonb_build_object('x-cron-secret', public.cron_secret())` ;
- côté fonctions : variable `CRON_SECRET` (`supabase secrets set`), y compris
  `_shared/payment-notify.ts` ;
- dans les migrations historiques, la valeur est remplacée par
  `__CRON_SECRET_DU_VAULT__` : ces fichiers ne se rejouent jamais tels quels.

⛔ Une rotation change les DEUX au même moment (vault + `CRON_SECRET`), puis
on relit `cron.job_run_details` ET les codes HTTP (`net._http_response`) des
crons suivants : un cron « succeeded » peut cacher un 401. Procédure :
`docs/ROTATION_CRON_SECRET.md`. Un nouveau cron ou trigger pg_net n'écrit
JAMAIS la valeur : il appelle `public.cron_secret()`.

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
