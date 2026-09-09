# Procédure de reprise Beebs — après acceptation de la 0.6.23 au Chrome Web Store

Écrite le 09/09/2026 à 17 h 45. À dérouler DANS L'ORDRE, sans sauter d'étape.
Rien ne se fait « à 23 h de tête » : chaque étape a sa requête et son contrôle.

## État de départ (posé le 09/09)

Deux verrous INDÉPENDANTS retiennent Beebs. Les deux doivent être levés, dans
l'ordre ci-dessous — sinon les jobs attendront le 11/09 21:00 UTC même une fois
la pause levée, ou repartiront sur du code encore cassé.

| Verrou | Où | Posé par | Effet |
|---|---|---|---|
| PAUSE plateforme | `platform_health` : `paused=true` sur `beebs`, `reason` = message utilisateur, `paused_since` 09/09 17:29:49 | Claude, GO Nico | get-pending-jobs ne sert AUCUN job Beebs ; bandeau dans l'app ; (après déploiement de l'app : case Beebs grisée, RPC refuse `platform_paused`) |
| GEL des 15 jobs | `cross_post_jobs` : 15 jobs Beebs `pending`, `platform_fields.next_action_after = 2026-09-11T21:00:00Z`, `platform_fields.gel_motif = 'beebs_askbackground_attente_0.6.23'`, compteurs effacés | Nico, 17 h 30 | le poll les saute jusqu'à l'échéance |
| Sauvegarde | `public.jobs_beebs_gel_0623_20260909` (15 lignes) | Nico | retour arrière possible |

Cause réparée par la 0.6.23 : `askBackground` appelé dans beebs.js sans y être
défini (0.6.22). Paquet : `build/CWS-0.6.23-A-TELEVERSER/fillsell-extension-0.6.23-a350941-cws.zip`,
BUILD_ID `2026-09-09T15:21:27Z+a350941`.

## Étape 1 — Constater que la 0.6.23 est SERVIE (pas seulement acceptée)

L'acceptation CWS ne suffit pas : les Chrome se mettent à jour quand ils
veulent. Preuve = des comptes du parc qui tournent dessus.

```sql
SELECT extension_version, extension_build, count(*) AS comptes,
       max(extension_sessions->>'checked_at') AS derniere_sonde
FROM profiles
WHERE extension_build IS NOT NULL
  AND (extension_sessions->>'checked_at')::timestamptz > now() - interval '3 days'
GROUP BY 1, 2 ORDER BY 1 DESC;
```

Attendu : au moins ton propre compte en `0.6.23` / `2026-09-09T15:21:27Z+a350941`.
Tant qu'aucun compte n'y est, NE RIEN LEVER.

## Étape 2 — Gestes de release, sur main (indépendants de la reprise)

1. `scripts/package-extension.mjs` : ajouter `'0.6.23'` à `ALREADY_PUBLISHED`.
2. `scripts/build-id.mjs` : `EXTENSION_MIN_BUILD = '2026-09-09T15:21:27Z'`
   — le BUILD_ID DU ZIP, **pas** `EXTENSION_LAST_COMMIT` (le printout du
   packager se trompe, piège connu du 09/08). Pousser le web : c'est ce geste
   qui allume la bannière « extension obsolète » chez les 0.6.22 et avant.

## Étape 3 — Test réel sur UN job, pause levée, gel maintenu pour les 14 autres

L'ordre compte : la pause bloque la distribution, donc on ne peut pas tester
« pause maintenue ». On lève la pause, mais on ne dégèle QU'UN job (le tien).

```sql
-- 3a. lever la pause (les 14 autres restent gelés par next_action_after)
UPDATE platform_health
SET paused = false, paused_since = NULL, severity = NULL, updated_at = now()
WHERE platform = 'beebs';

-- 3b. dégeler UN SEUL job : le tien (4a357c4d, nicolas.svobodny, créé le 09/09 16:35)
UPDATE cross_post_jobs
SET platform_fields = (platform_fields - 'next_action_after' - 'gel_motif' - 'needsUserAttempts')
WHERE id = '4a357c4d-...'::uuid   -- id complet : SELECT id FROM cross_post_jobs WHERE id::text LIKE '4a357c4d%'
  AND platform = 'beebs' AND status = 'pending';
```

Puis attendre un poll (≤ 2 min, extension ouverte) et CONTRÔLER, pas deviner :

```sql
SELECT left(id::text,8), status, handler_build, listing_url, platform_listing_id,
       left(error, 120) AS erreur,
       (SELECT string_agg(left(w->>'message',100), ' ‖ ')
        FROM jsonb_array_elements(COALESCE(platform_fields->'warnings','[]'::jsonb)) w
        WHERE w->>'message' ILIKE 'observabilit%') AS observabilite
FROM cross_post_jobs WHERE id::text LIKE '4a357c4d%';
```

Réussite = `status = 'published'`, `handler_build` porte `a350941 · v0.6.23`,
et l'observabilité dit `catégorie via FIBER` (canal executeScript) ou, à
défaut, `CLIC+PANNEAU` avec `pont MAIN: executeScript` — jamais
`erreur de code`. La fiche Beebs doit répondre (Algolia `prod_MARKETPLACE`,
facet `user_id`, ou `/fr/p/<id>` en 200 avec « Ajouter au panier »).

Échec = `needs_user` ou `failed` → **re-poser la pause immédiatement**
(`UPDATE platform_health SET paused=true, paused_since=now(), updated_at=now()
WHERE platform='beebs'`), le job de test reste seul touché, et on enquête.
Ne pas dégeler les 14 autres.

## Étape 4 — Dégel des 14 autres, seulement après la réussite de l'étape 3

```sql
UPDATE cross_post_jobs
SET platform_fields = (platform_fields - 'next_action_after' - 'gel_motif')
WHERE platform = 'beebs' AND action = 'publish' AND status = 'pending'
  AND platform_fields->>'gel_motif' = 'beebs_askbackground_attente_0.6.23';
-- attendu : 14 lignes
```

Ils repartent au poll suivant de chaque compte (6 comptes ; ceux dont Chrome
est fermé partiront à l'ouverture). Contrôle 30 min plus tard :

```sql
SELECT status, count(*) FROM cross_post_jobs
WHERE platform='beebs' AND action='publish'
  AND id IN (SELECT id FROM jobs_beebs_gel_0623_20260909)
GROUP BY 1;
```

## Étape 5 — Nettoyage

- `platform_health.reason` : remettre à NULL (ou une note interne) — depuis le
  déploiement de l'app qui lit `message_fr`/`message_en`, `reason` n'est plus
  affiché ; tant que cette app n'est PAS déployée, c'est `reason` que les
  utilisateurs lisent : ne pas le vider avant.
- `jobs_beebs_gel_0623_20260909` : garder 7 jours puis DROP.
- Les jobs Beebs passés `needs_user` AVANT le gel (3) ne sont pas concernés :
  ils attendent un geste utilisateur, comme avant.

## Si la 0.6.23 est REFUSÉE par le CWS

Rien à lever. Pause et gel tiennent. Corriger, repackager en 0.6.24
(bump manifest + `ALREADY_PUBLISHED += '0.6.23'`), et reprendre à l'étape 1.
Le gel expire de lui-même le 11/09 21:00 UTC : si la review traîne au-delà,
**prolonger le gel** (`next_action_after` + 48 h sur les 15) — la pause seule
suffit à retenir les jobs, mais autant garder les deux verrous cohérents.
