# Rotation du `x-cron-secret` — runbook

**État au 19/09/2026 : NON FAIT.** Ce document existe pour que la bascule ne
dépende plus d'un rapport de session. Il ne contient aucune valeur de secret,
ni l'ancienne ni la future — et il ne doit jamais en contenir.

---

## Pourquoi ce n'est pas une simple rotation

Le secret est déjà au coffre : les **12 fonctions qui le vérifient** le lisent
toutes via `Deno.env.get("CRON_SECRET")` (posé le 24/06/2026). Ce n'est donc
pas « un secret en dur qu'on remplace ».

Le problème est ailleurs : **les 12 vérificateurs font tous la même égalité
stricte contre UNE seule variable**. Il n'existe aucun moyen de leur faire
accepter deux valeurs pendant la bascule sans changer leur code. Et sans
double acceptation, la coupure est garantie — silencieuse, qui plus est : pas
d'erreur à l'écran, juste des mails qui ne partent plus et des jobs qui
s'empilent.

> ⛔ **La règle qui prime : mieux vaut un secret exposé qu'un tunnel mort.**
> Si à un moment la double acceptation n'est plus garantie, on s'arrête.

---

## L'inventaire, relevé le 19/09/2026

### Les 12 vérificateurs — tous en `Deno.env.get("CRON_SECRET")`

`apple-notification-history` · `ebay-api-worker` · `ebay-ventes-sync` ·
`email-tunnel` · `handler-watch` · `lens-analysis` · `lens-temp-purge` ·
`ops-digest` · `republish-auto-sweep` · `republish-purge` ·
`resolve-categorie` · `send-chantier-zip`

### Les appelants côté serveur — sains, ils lisent l'environnement

- `_shared/sale-orchestration.ts` — importé par `check-listing-status`,
  `ebay-api-worker`, `get-pending-jobs`
- `ebay-api-worker` (auto-appel) · `ops-digest`

### ⚠️ Le seul appelant en dur — c'est lui le vrai travail

`supabase/functions/_shared/payment-notify.ts` porte la valeur en clair dans
une constante. Ce fichier est **bundlé dans quatre fonctions de paiement** :
`stripe-webhook`, `apple-iap-webhook`, `google-play-webhook`,
`validate-google-purchase`. Tant qu'elles ne sont pas redéployées, elles
continuent d'envoyer l'ancienne valeur.

### Les 9 crons qui portent le littéral (sur 12)

| cron | cadence | fonction appelée |
|---|---|---|
| `ebay-api-worker-2min` | `*/2 * * * *` | ebay-api-worker |
| `handler-watch-3min` | `*/3 * * * *` | handler-watch |
| `republish-auto-sweep-3min` | `*/3 * * * *` | republish-auto-sweep |
| `email-tunnel-job-relaunch-hourly` | `0 * * * *` | email-tunnel |
| `email-tunnel-daily` | `0 9 * * *` | email-tunnel |
| `ops-digest-daily` | `50 8 * * *` | ops-digest |
| `republish-purge-daily` | `40 3 * * *` | republish-purge |
| `lens-temp-purge-daily` | `50 3 * * *` | lens-temp-purge |
| `ebay-ventes-sync-daily` | `40 4 * * *` | ebay-ventes-sync |

Les trois autres (`coins-monthly-sweep`, `expire-publish-reservations-daily`,
`publish-sans-lien-echec-daily`) sont du SQL pur, sans appel HTTP : ils ne
sont pas concernés.

### Le trigger

`handle_new_user` appelle `email-tunnel` par `pg_net` avec le header custom.
Seul le header custom fonctionne : ni query param, ni `Authorization`
(cf. CLAUDE.md).

### Dans le dépôt

13 fichiers portent le littéral : `CLAUDE.md`, `payment-notify.ts`, et
11 migrations (celles qui planifient les crons ci-dessus).

---

## Le runbook — 7 gestes, réversibles jusqu'au 6

### 1. Générer la nouvelle valeur

```bash
openssl rand -hex 24
```

Noter la valeur **une seule fois**, hors du dépôt. Ne la coller dans aucun
fichier versionné.

### 2. La poser au coffre sous un nom PROVISOIRE

```bash
npx supabase secrets set CRON_SECRET_NEXT=<nouvelle>
```

À ce stade rien ne change : aucune fonction ne lit encore cette variable.

### 3. Rendre les 12 vérificateurs bilingues, puis les déployer

Dans chacun des 12, remplacer l'égalité stricte par :

```ts
const attendu = Deno.env.get("CRON_SECRET");
const suivant = Deno.env.get("CRON_SECRET_NEXT");
const recu    = req.headers.get("x-cron-secret");
const ok = (attendu && recu === attendu) || (suivant && recu === suivant);
```

Et dans `_shared/payment-notify.ts`, remplacer la constante en dur par :

```ts
const CRON_SECRET = Deno.env.get("CRON_SECRET_NEXT") ?? Deno.env.get("CRON_SECRET") ?? "";
```

Puis déployer les **16** fonctions (12 vérificateurs + les 4 qui bundlent
`payment-notify.ts`).

> 🚨 **Le geste de CLAUDE.md, avant ET après chaque déploiement.** Un
> déploiement sans `--no-verify-jwt` remet `verify_jwt` à `true` : le cron
> tombe en 401, en silence.
>
> ```bash
> npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
> ```
>
> On lit l'état RÉEL avant, on le relit après. C'est l'étape la plus risquée
> du runbook : 16 déploiements, dont les webhooks Stripe / Apple / Google.

### 4. Basculer les appelants

Les 9 crons (via `cron.schedule` sur le même `jobname` — **jamais** un second
`cron.schedule` sans garde, cf. l'accident `handler-watch-3min`) et le trigger
`handle_new_user`, sur la nouvelle valeur.

### 5. Prouver qu'un appel réel passe

Attendre un tick de `handler-watch-3min` (3 minutes au plus), puis :

```sql
select status_code, created
from net._http_response
order by created desc limit 5;
```

`200` attendu, pas `401`. ⚠️ `net._http_response` se purge automatiquement :
vérifier **immédiatement** après le tick.

### 6. Promouvoir la nouvelle valeur

```bash
npx supabase secrets set CRON_SECRET=<nouvelle>
npx supabase secrets unset CRON_SECRET_NEXT
```

À partir d'ici, l'ancienne valeur ne vaut plus rien. **C'est le point de
non-retour.**

### 7. Nettoyer le dépôt

Retirer le littéral de `CLAUDE.md` et des commentaires.

> ⛔ **Les 11 migrations passées ne sont PAS réécrites.** Une migration déjà
> appliquée ne se modifie pas. On note simplement, ici, que la valeur qu'elles
> contiennent est **révoquée** — elle n'ouvre plus rien.

---

## Après la bascule

Revenir corriger ce fichier : passer l'état à « FAIT le … », et garder
l'inventaire, qui reste la carte utile du jour où il faudra recommencer.
