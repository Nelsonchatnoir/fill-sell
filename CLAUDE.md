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
   vraiment chez la personne ;
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

**Appelées par pg_cron (`x-cron-secret`)** — `cron.job` le prouve :
`ebay-api-worker` (*/2) · `republish-auto-sweep` (*/3) · `handler-watch` (*/3)
· `email-tunnel` (9h + horaire, **et** le trigger `handle_new_user`) ·
`ops-digest` (8h50) · `republish-purge` (3h40) · `lens-temp-purge` (3h50 —
jamais de purge côté client : un client ne voit que SON scan, c'est ce qui
effaçait les photos d'articles avant le 15/09).

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

**One-shots déployés à la main** : `send-batch-notifications`,
`send-chantier-zip`, et les `send-<prénom>-<date>`.
(`send-relance` a été SUPPRIMÉE de la prod le 20/09/2026 — jeton en clair dans
un fichier gitignoré, campagnes toutes parties, aucun appelant.)

⛔ **DIX-SEPT PORTES D'ENVOI RESTENT OUVERTES SANS SOURCE (relevé 20/09).**
`functions list` compte 19 fonctions `send-*`, dont **17 en `verify_jwt =
false`** — joignables sans session. Quinze d'entre elles sont des
`send-<prénom>-<date>` déployées à la main et **absentes du dépôt** : on ne
peut ni relire leur garde, ni savoir si elles portent un jeton en dur, ni les
redéployer. C'est la même famille de défaut que `send-relance`, en quinze
exemplaires. Un envoi ponctuel doit passer par `email-tunnel` ou par une
fonction **commitée**, et être supprimé une fois parti — comme le 28/07 et le
20/09. La liste vivante se lit par le geste `functions list`, jamais ici.

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
